#!/usr/bin/env python3

import os
import sys
import re
import json
import yaml
import logging
import jsonschema
from pathlib import Path
from kubernetes import client, config

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("grader")

def load_grading_criteria(lab_id):
    """Load grading criteria from lab definition"""
    criteria_file = f"/labs/{lab_id}-grading.yaml"
    try:
        with open(criteria_file, "r") as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        logger.error(f"Grading criteria file not found: {criteria_file}")
        raise Exception(f"Lab {lab_id} not found or has no grading criteria")

def access_workspace_files(workspace_id, username):
    """
    In a real implementation, this would use the Kubernetes API to:
    1. Find the Coder workspace pod
    2. Create an ephemeral container or exec into the pod to access files
    3. Copy the files to a temporary location
    
    For simplicity in this demo, we'll simulate workspace files
    """
    # TODO: Replace this with actual K8s API calls to access workspace files
    
    # Simulate workspace access by creating a temp directory with sample files
    workspace_dir = Path("/tmp/workspace")
    workspace_dir.mkdir(exist_ok=True)
    
    # Create sample output files based on what we expect in lab1
    lab1_dir = workspace_dir / "lab1"
    lab1_dir.mkdir(exist_ok=True)
    
    # Create a sample toptalker.txt file
    with open(lab1_dir / "toptalker.txt", "w") as f:
        f.write("192.168.1.45  1542000 TCP\n")
        f.write("10.0.0.12  982340 UDP\n")
        f.write("172.16.54.3  892311 TCP\n")
        f.write("192.168.12.132  723456 TCP\n")
        f.write("10.0.0.36  523987 TCP\n")
        f.write("172.16.34.55  433210 UDP\n")
        f.write("192.168.23.78  387652 TCP\n")
        f.write("10.0.2.15  297834 TCP\n")
        f.write("172.16.34.27  198732 TCP\n")
        f.write("192.168.1.12  98453 UDP\n")
    
    # Create a sample blocked_ips.txt file
    with open(lab1_dir / "blocked_ips.txt", "w") as f:
        f.write("192.168.1.45\n")
        f.write("10.0.0.123\n")
        f.write("172.16.12.34\n")
    
    # Create a sample report.json file
    report = {
        "timestamp": "2025-04-17T10:25:43Z",
        "total_connections": 1432,
        "suspicious_activity": [
            {"ip": "192.168.1.45", "reason": "Multiple failed login attempts"},
            {"ip": "10.0.0.123", "reason": "Port scanning activity"}
        ]
    }
    with open(lab1_dir / "report.json", "w") as f:
        json.dump(report, f, indent=2)
    
    return str(workspace_dir)

def validate_file_match(file_path, validation):
    """Validate file contents using regex or content matching"""
    if not file_path.exists():
        return 0, "File not found"
    
    method = validation.get("method")
    
    if method == "regex_match":
        with open(file_path, "r") as f:
            content = f.read()
        
        pattern = re.compile(validation["pattern"], re.MULTILINE)
        matches = pattern.findall(content)
        
        expected_lines = validation.get("lines", 0)
        if len(matches) == expected_lines:
            return 1.0, "Correct format and content"
        else:
            return 0.5, f"Content partially matches format. Found {len(matches)} matching lines out of {expected_lines} expected."
    
    elif method == "content_subset":
        with open(file_path, "r") as f:
            content = f.read()
        
        missing = []
        for required in validation["must_contain"]:
            if required not in content:
                missing.append(required)
        
        if not missing:
            return 1.0, "File contains all required elements"
        else:
            percentage = (len(validation["must_contain"]) - len(missing)) / len(validation["must_contain"])
            return percentage, f"Missing required elements: {', '.join(missing)}"
    
    return 0, "Unknown validation method"

def validate_json_schema(file_path, validation):
    """Validate JSON file against a schema"""
    if not file_path.exists():
        return 0, "File not found"
    
    try:
        with open(file_path, "r") as f:
            data = json.load(f)
        
        jsonschema.validate(instance=data, schema=validation["schema"])
        return 1.0, "JSON structure is valid"
    except json.JSONDecodeError:
        return 0, "File is not valid JSON"
    except jsonschema.exceptions.ValidationError as e:
        # Check how many required fields are present
        required_fields = validation["schema"].get("required", [])
        if not required_fields:
            return 0, f"JSON schema validation failed: {e.message}"
        
        missing_required = []
        for field in required_fields:
            if field not in data:
                missing_required.append(field)
        
        if missing_required:
            percentage = (len(required_fields) - len(missing_required)) / len(required_fields)
            return percentage, f"Missing required fields: {', '.join(missing_required)}"
        
        return 0.5, f"JSON schema validation failed: {e.message}"

def grade_lab(workspace_dir, lab_id):
    """Grade a lab submission based on criteria and student files"""
    # Load grading criteria
    criteria = load_grading_criteria(lab_id)
    
    results = {
        "lab": criteria["name"],
        "items": [],
        "score": 0,
        "total": criteria["total_points"]
    }
    
    # Check each required output
    for output in criteria["outputs"]:
        file_path = Path(workspace_dir) / output["file"].lstrip("/")
        
        item = {
            "name": output["description"],
            "points": 0,
            "possible": output["points"],
            "message": ""
        }
        
        validation = output["validation"]
        validator_type = validation["type"]
        
        # Apply the appropriate validator
        if validator_type == "file_match":
            percentage, message = validate_file_match(file_path, validation)
            item["points"] = round(percentage * output["points"])
            item["message"] = message
        
        elif validator_type == "json_schema":
            percentage, message = validate_json_schema(file_path, validation)
            item["points"] = round(percentage * output["points"])
            item["message"] = message
        
        results["items"].append(item)
        results["score"] += item["points"]
    
    # Output results to stdout (will be captured in pod logs)
    print(json.dumps(results, indent=2))
    
    return results

def main():
    """Main entry point for the grading worker"""
    try:
        # Get parameters from environment
        lab_id = os.environ.get("LAB_ID")
        workspace_id = os.environ.get("WORKSPACE_ID")
        username = os.environ.get("USERNAME")
        
        if not lab_id or not workspace_id or not username:
            logger.error("Missing required environment variables")
            sys.exit(1)
        
        logger.info(f"Grading lab {lab_id} for workspace {workspace_id} (user: {username})")
        
        # Access workspace files
        workspace_dir = access_workspace_files(workspace_id, username)
        
        # Grade the submission
        results = grade_lab(workspace_dir, lab_id)
        
        logger.info(f"Grading complete. Score: {results['score']}/{results['total']}")
    except Exception as e:
        logger.error(f"Grading failed: {str(e)}")
        # Output error in JSON format for the server to parse
        print(json.dumps({
            "error": str(e),
            "lab": lab_id if 'lab_id' in locals() else "unknown"
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()