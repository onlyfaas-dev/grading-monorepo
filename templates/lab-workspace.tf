terraform {
  required_providers {
    coder = {
      source  = "coder/coder"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
    }
  }
}

provider "coder" {
}

variable "use_kubeconfig" {
  type        = bool
  description = <<-EOF
  Use host kubeconfig? (true/false)

  Set this to false if the Coder host is itself running as a Pod on the same
  Kubernetes cluster as you are deploying workspaces to.

  Set this to true if the Coder host is running outside the Kubernetes cluster
  for workspaces.  A valid "~/.kube/config" must be present on the Coder host.
  EOF
  default     = false
}

variable "namespace" {
  type        = string
  description = "The Kubernetes namespace to create workspaces in (must exist prior to creating workspaces). If the Coder host is itself running as a Pod on the same Kubernetes cluster as you are deploying workspaces to, set this to the same namespace."
}

data "coder_parameter" "cpu" {
  name         = "cpu"
  display_name = "CPU"
  description  = "The number of CPU cores"
  default      = "2"
  icon         = "/icon/memory.svg"
  mutable      = true
  option {
    name  = "2 Cores"
    value = "2"
  }
  option {
    name  = "4 Cores"
    value = "4"
  }
  option {
    name  = "6 Cores"
    value = "6"
  }
  option {
    name  = "8 Cores"
    value = "8"
  }
}

data "coder_parameter" "memory" {
  name         = "memory"
  display_name = "Memory"
  description  = "The amount of memory in GB"
  default      = "2"
  icon         = "/icon/memory.svg"
  mutable      = true
  option {
    name  = "2 GB"
    value = "2"
  }
  option {
    name  = "4 GB"
    value = "4"
  }
  option {
    name  = "6 GB"
    value = "6"
  }
  option {
    name  = "8 GB"
    value = "8"
  }
}

data "coder_parameter" "home_disk_size" {
  name         = "home_disk_size"
  display_name = "Home disk size"
  description  = "The size of the home disk in GB"
  default      = "10"
  type         = "number"
  icon         = "/emojis/1f4be.png"
  mutable      = false
  validation {
    min = 1
    max = 99999
  }
}

data "coder_parameter" "github_token" {
  name         = "github_token"
  display_name = "GitHub Token"
  description  = "GitHub token for authentication with the grading system"
  type         = "string"
}

data "coder_parameter" "extension_url" {
  name         = "extension_url"
  display_name = "VS Code Extension URL"
  description  = "URL to the grading extension VSIX file"
  default      = "https://storage.googleapis.com/grading-lab-assets/lab-grader-0.1.0.vsix"
  type         = "string"
  mutable      = true
}

provider "kubernetes" {
  # Authenticate via ~/.kube/config or a Coder-specific ServiceAccount, depending on admin preferences
  config_path = var.use_kubeconfig == true ? "~/.kube/config" : null
  
  # Use exec for authentication - this will refresh tokens as needed
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "kubectl"
    args        = ["get", "serviceaccount", "default", "-o", "yaml"]
  }
}

data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}

resource "coder_agent" "main" {
  os             = "linux"
  arch           = "amd64"
  startup_script = <<-EOT
    #!/bin/bash
    # Install and start code-server
    curl -fsSL https://code-server.dev/install.sh | sh -s -- --version 4.19.0
    code-server --auth none --port 13337 &
    
    # Install grading extension
    mkdir -p /tmp/extensions
    
    # Download the extension using curl
    echo "Downloading VS Code extension from ${data.coder_parameter.extension_url.value}..."
    if [[ "${data.coder_parameter.extension_url.value}" == *"github.com"* ]]; then
      # If it's a GitHub URL, use the token for authentication
      curl -L -H "Authorization: token ${data.coder_parameter.github_token.value}" -o /tmp/extensions/lab-grader.vsix "${data.coder_parameter.extension_url.value}"
    else
      # Otherwise download without authentication
      curl -L -o /tmp/extensions/lab-grader.vsix "${data.coder_parameter.extension_url.value}"
    fi
    
    # Install the extension
    echo "Installing VS Code extension..."
    code-server --install-extension /tmp/extensions/lab-grader.vsix
    
    # Configure extension
    mkdir -p ~/.local/share/code-server/User
    cat > ~/.local/share/code-server/User/settings.json << EOF
    {
      "grader.labsPath": "/labs",
      "grader.apiUrl": "http://grading-service.grading-system.svc.cluster.local:8080",
      "grader.currentLab": "lab1-network-analysis"
    }
    EOF
    
    # Generate workspace token
    export TOKEN_SECRET_KEY="${data.coder_parameter.github_token.value}"
    node /labs/generate-token.js "${data.coder_workspace.me.id}" "${data.coder_workspace_owner.me.id}"
    
    # Install lab dependencies
    sudo apt-get update
    sudo apt-get install -y jq tcpdump netcat
  EOT

  # The following metadata blocks are optional. They are used to display
  # information about your workspace in the dashboard.
  metadata {
    display_name = "CPU Usage"
    key          = "0_cpu_usage"
    script       = "coder stat cpu"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "RAM Usage"
    key          = "1_ram_usage"
    script       = "coder stat mem"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Home Disk"
    key          = "3_home_disk"
    script       = "coder stat disk --path $${HOME}"
    interval     = 60
    timeout      = 1
  }
}

resource "coder_app" "code-server" {
  agent_id     = coder_agent.main.id
  slug         = "code-server"
  display_name = "VS Code"
  url          = "http://localhost:13337/?folder=/home/coder"
  icon         = "/icon/code.svg"
}

resource "kubernetes_persistent_volume_claim" "home" {
  metadata {
    name      = "coder-${data.coder_workspace.me.id}-home"
    namespace = var.namespace
    labels = {
      "app.kubernetes.io/name"     = "coder-pvc"
      "app.kubernetes.io/instance" = "coder-pvc-${data.coder_workspace.me.id}"
      "app.kubernetes.io/part-of"  = "coder"
      "com.coder.resource"         = "true"
      "com.coder.workspace.id"     = data.coder_workspace.me.id
      "com.coder.workspace.name"   = data.coder_workspace.me.name
      "com.coder.user.id"          = data.coder_workspace_owner.me.id
      "com.coder.user.username"    = data.coder_workspace_owner.me.name
    }
    annotations = {
      "com.coder.user.email" = data.coder_workspace_owner.me.email
    }
  }
  wait_until_bound = false
  spec {
    access_modes = ["ReadWriteOnce"]
    resources {
      requests = {
        storage = "${data.coder_parameter.home_disk_size.value}Gi"
      }
    }
  }
}

resource "kubernetes_pod" "workspace" {
  count = data.coder_workspace.me.start_count
  depends_on = [
    kubernetes_persistent_volume_claim.home,
    kubernetes_config_map.lab_content,
    kubernetes_config_map.lab_api_content,
    kubernetes_pod.init_workspace
  ]
  metadata {
    name      = "coder-${data.coder_workspace.me.id}"
    namespace = var.namespace
    labels = {
      "app.kubernetes.io/name"     = "coder-workspace"
      "app.kubernetes.io/instance" = "coder-workspace-${data.coder_workspace.me.id}"
      "app.kubernetes.io/part-of"  = "coder"
      "com.coder.resource"         = "true"
      "com.coder.workspace.id"     = data.coder_workspace.me.id
      "com.coder.workspace.name"   = data.coder_workspace.me.name
      "com.coder.user.id"          = data.coder_workspace_owner.me.id
      "com.coder.user.username"    = data.coder_workspace_owner.me.name
    }
    annotations = {
      "com.coder.user.email" = data.coder_workspace_owner.me.email
    }
  }

  spec {
    security_context {
      run_as_user     = 1000
      fs_group        = 1000
      run_as_non_root = true
    }

    container {
      name  = "workspace"
      image = "codercom/code-server:latest"
      
      security_context {
        run_as_user = 1000
      }
      
      env {
        name  = "CODER_AGENT_TOKEN"
        value = coder_agent.main.token
      }
      
      resources {
        requests = {
          cpu    = "250m"
          memory = "512Mi"
        }
        limits = {
          cpu    = "${data.coder_parameter.cpu.value}"
          memory = "${data.coder_parameter.memory.value}Gi"
        }
      }
      
      volume_mount {
        mount_path = "/home/coder"
        name       = "home-directory"
      }
      
      volume_mount {
        mount_path = "/labs"
        name       = "lab-content"
        read_only  = true
      }
      
      # Add readiness probe to ensure container is ready
      readiness_probe {
        exec {
          command = ["cat", "/home/coder/workspace_ready.txt"]
        }
        initial_delay_seconds = 5
        period_seconds = 5
        timeout_seconds = 1
        success_threshold = 1
        failure_threshold = 3
      }
    }
    
    # Lab database container for networking exercises
    container {
      name  = "lab-database"
      image = "postgres:14-alpine"
      
      env {
        name  = "POSTGRES_USER"
        value = "student"
      }
      
      env {
        name  = "POSTGRES_PASSWORD"
        value = "password"
      }
      
      env {
        name  = "POSTGRES_DB"
        value = "labdb"
      }
      
      resources {
        requests = {
          cpu    = "100m"
          memory = "256Mi"
        }
        limits = {
          cpu    = "500m"
          memory = "512Mi"
        }
      }
    }
    
    # Lab API server for networking exercises
    container {
      name  = "lab-api"
      image = "nginx:alpine"
      
      volume_mount {
        mount_path = "/usr/share/nginx/html"
        name       = "lab-api-content"
        read_only  = true
      }
      
      resources {
        requests = {
          cpu    = "100m"
          memory = "128Mi"
        }
        limits = {
          cpu    = "200m"
          memory = "256Mi"
        }
      }
    }
    
    volume {
      name = "home-directory"
      persistent_volume_claim {
        claim_name = kubernetes_persistent_volume_claim.home.metadata.0.name
      }
    }
    
    volume {
      name = "lab-content"
      config_map {
        name = kubernetes_config_map.lab_content.metadata.0.name
      }
    }
    
    volume {
      name = "lab-api-content"
      config_map {
        name = kubernetes_config_map.lab_api_content.metadata.0.name
      }
    }
  }
  
  timeouts {
    create = "15m"
    delete = "15m"
  }
}

# Create the lab content ConfigMap based on the structure from lab-content-configmap.yaml
resource "kubernetes_config_map" "lab_content" {
  metadata {
    name      = "lab-content"
    namespace = var.namespace
  }

  data = {
    "lab1-instructions.md" = <<-EOT
      # Lab 1: Network Traffic Analysis

      ## Scenario
      You are a network administrator who needs to analyze server logs to identify potential security threats.

      ## Tasks

      1. Analyze the provided log file `/lab1/resources/network.log` to identify the top 10 talkers (IPs with highest bandwidth usage)
         - Write the results to `/lab1/toptalker.txt`
         - Each line should contain: IP, bytes transferred, protocol (e.g., `192.168.1.45  1542000 TCP`)

      2. Identify suspicious IPs based on the following criteria:
         - Multiple failed login attempts (>5 within 1 minute)
         - Port scanning activity (connections to >10 different ports)
         - Write these IPs to `/lab1/blocked_ips.txt`, one per line

      3. Create a JSON report summarizing your findings:
         - Save as `/lab1/report.json`
         - Include:
           - Timestamp of analysis
           - Total number of connections
           - Array of suspicious activities with IP and reason
    EOT

    "lab1-grading.yaml" = <<-EOT
      name: "Network Traffic Analysis Lab"
      total_points: 100
      outputs:
        - file: "/lab1/toptalker.txt"
          description: "List of top 10 talkers by bandwidth"
          points: 40
          validation:
            type: "file_match"
            method: "regex_match"
            pattern: "^\\s*\\d+\\.\\d+\\.\\d+\\.\\d+\\s+\\d+\\s+[A-Z]{3}\\s*$"
            lines: 10
          
        - file: "/lab1/blocked_ips.txt"
          description: "List of IPs to be blocked"
          points: 30
          validation:
            type: "file_match"
            method: "content_subset"
            must_contain:
              - "192.168.1.45"
              - "10.0.0.123"
            
        - file: "/lab1/report.json"
          description: "JSON report with traffic statistics"
          points: 30
          validation:
            type: "json_schema"
            schema:
              type: "object"
              required: ["timestamp", "total_connections", "suspicious_activity"]
              properties:
                timestamp: { type: "string", format: "date-time" }
                total_connections: { type: "integer", minimum: 1 }
                suspicious_activity: { 
                  type: "array",
                  items: {
                    type: "object",
                    required: ["ip", "reason"]
                  }
                }
    EOT

    "generate-token.js" = <<-EOT
      #!/usr/bin/env node
      // Simple token generation script
      const crypto = require('crypto');
      const fs = require('fs');
      
      const workspaceId = process.argv[2];
      const userId = process.argv[3];
      const secretKey = process.env.TOKEN_SECRET_KEY || 'default-secret-key';
      
      const token = crypto.createHmac('sha256', secretKey)
        .update(workspaceId + userId)
        .digest('hex');
      
      // Write token to a file
      fs.writeFileSync('/home/coder/.grader_token', token);
      console.log('Token generated successfully');
    EOT

    "network.log" = <<-EOT
      2023-09-15T08:12:43 SRC=192.168.1.45 DST=10.0.0.10 PROTO=TCP SRC_PORT=32145 DST_PORT=80 SIZE=1240 ACTION=ALLOW
      2023-09-15T08:12:45 SRC=192.168.1.45 DST=10.0.0.10 PROTO=TCP SRC_PORT=32146 DST_PORT=80 SIZE=980 ACTION=ALLOW
      2023-09-15T08:13:01 SRC=10.0.0.123 DST=192.168.1.45 PROTO=TCP SRC_PORT=22 DST_PORT=45123 SIZE=540 ACTION=ALLOW
      2023-09-15T08:13:15 SRC=10.0.0.123 DST=192.168.1.46 PROTO=TCP SRC_PORT=22 DST_PORT=45124 SIZE=540 ACTION=ALLOW
      2023-09-15T08:14:22 SRC=192.168.1.47 DST=10.0.0.10 PROTO=UDP SRC_PORT=53212 DST_PORT=53 SIZE=120 ACTION=ALLOW
    EOT
  }
}

# Create a simple API content ConfigMap
resource "kubernetes_config_map" "lab_api_content" {
  metadata {
    name      = "lab-api-content"
    namespace = var.namespace
  }

  data = {
    "index.html" = <<-EOT
      <!DOCTYPE html>
      <html>
      <head>
        <title>Lab API</title>
      </head>
      <body>
        <h1>Lab API Server</h1>
        <p>This is a simple API server for lab exercises</p>
      </body>
      </html>
    EOT
    
    "api.json" = <<-EOT
      {
        "status": "running",
        "version": "1.0.0",
        "endpoints": [
          "/api/v1/status",
          "/api/v1/users",
          "/api/v1/data"
        ]
      }
    EOT
  }
}

# Create a directory structure inside the home PVC for labs
resource "kubernetes_pod" "init_workspace" {
  count = data.coder_workspace.me.start_count
  depends_on = [
    kubernetes_persistent_volume_claim.home,
    kubernetes_config_map.lab_content,
    kubernetes_config_map.lab_api_content
  ]
  metadata {
    name      = "init-workspace-${data.coder_workspace.me.id}"
    namespace = var.namespace
  }
  spec {
    restart_policy = "Never"
    container {
      name    = "init-container"
      image   = "busybox:latest"
      command = ["/bin/sh", "-c"]
      args    = [
        "mkdir -p /home/coder/lab1/resources && echo 'Workspace initialized' > /home/coder/workspace_ready.txt"
      ]
      volume_mount {
        name       = "home-directory"
        mount_path = "/home/coder"
      }
    }
    volume {
      name = "home-directory"
      persistent_volume_claim {
        claim_name = kubernetes_persistent_volume_claim.home.metadata.0.name
      }
    }
  }
  timeouts {
    create = "2m"
  }
}