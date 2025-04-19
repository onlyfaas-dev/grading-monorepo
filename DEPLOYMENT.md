# Deploying the Grading Server

This guide walks through the process of deploying the grading server system to your Kubernetes cluster.

## Prerequisites

- Docker installed locally for building images
- Access to a container registry (Docker Hub, GitHub Container Registry, ECR, etc.)
- Kubernetes cluster with Coder installed
- `kubectl` configured to access your cluster
- Node.js and npm for VS Code extension development

## Step 1: Configure Your Environment

Create a `.env` file with your configuration:

```bash
# Container registry to use
REGISTRY=ghcr.io/yourusername

# GitHub OAuth application for authentication
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Secret key for signing workspace tokens
TOKEN_SECRET_KEY=change-this-secret-key

# Path to your kubeconfig file
KUBECONFIG_PATH=/path/to/your/kubeconfig.yaml
```

## Step 2: Build and Push Docker Images

```bash
# Build and push the grading server image
docker build -t $REGISTRY/grading-server:latest .
docker push $REGISTRY/grading-server:latest

# Build and push the grading worker image
docker build -f Dockerfile.worker -t $REGISTRY/grading-worker:latest .
docker push $REGISTRY/grading-worker:latest
```

## Step 3: Deploy to Kubernetes

Run the deployment script:

```bash
source .env
./deploy.sh
```

This script will:
1. Create the `grading-system` namespace
2. Create the necessary secrets
3. Apply the lab content ConfigMap
4. Deploy the grading server and associated resources
5. Configure network policies

## Step 4: Build the VS Code Extension

```bash
# Install extension dependencies
cd extension
npm install

# Package the extension
npm run package
```

This will create a `lab-grader-0.1.0.vsix` file in the extension directory.

## Step 5: Host the Extension

Upload the VS Code extension to a location accessible by your Coder workspaces:

```bash
# Example: Upload to an S3 bucket
aws s3 cp lab-grader-0.1.0.vsix s3://your-bucket/extensions/

# Example: Upload to GitHub releases
gh release create v0.1.0 lab-grader-0.1.0.vsix
```

## Step 6: Update Coder Template

Add the grading extension to your Coder workspace template:

```hcl
resource "coder_agent" "main" {
  # ... other configuration
  
  startup_script = <<-EOT
    # Install grading extension
    /tmp/code-server/bin/code-server --install-extension https://url-to-your-extension/lab-grader-0.1.0.vsix
    
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
    mkdir -p ~/.grader
    node /labs/scripts/generate-token.js "${data.coder_workspace.me.id}" "${data.coder_workspace.me.owner_id}"
  EOT
}
```

## Step 7: Verify Deployment

Check that the grading server pods are running:

```bash
kubectl get pods -n grading-system
```

Check that the service is available:

```bash
kubectl get svc -n grading-system
```

## Step 8: Create Test Lab Content

Update the lab content ConfigMap with your own lab content:

```bash
kubectl edit configmap lab-content -n grading-system
```

Or update the `k8s/lab-content-configmap.yaml` file and apply it:

```bash
kubectl apply -f k8s/lab-content-configmap.yaml
```

## Troubleshooting

### Network Policy Issues

If Coder workspaces cannot access the grading service, check that the Coder namespace is properly labeled:

```bash
kubectl label namespace coder name=coder --overwrite
```

### Pod Startup Issues

Check the logs of the grading server pods:

```bash
kubectl logs -n grading-system deployment/grading-server
```

### Extension Installation Issues

If you have issues installing the extension in Coder workspaces, check the code-server logs:

```bash
# In the workspace pod
cat ~/.local/share/code-server/logs/code-server.log
```

## Next Steps

1. Add more labs to the lab content ConfigMap
2. Improve the grading worker to access actual workspace files
3. Implement persistent storage for grading results
4. Add instructor dashboard for monitoring student progress