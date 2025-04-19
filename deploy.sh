#!/bin/bash
set -e

echo "Applying grading server Kubernetes resources..."
kubectl apply -f k8s/grading-server.yaml

echo "Applying lab content ConfigMap..."
kubectl apply -f k8s/lab-content-configmap.yaml

echo "Checking deployment status..."
kubectl get pods -n grading-system

echo "Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Import the lab workspace template into Coder:"
echo "   - Navigate to the Coder admin panel"
echo "   - Go to Templates > New Template"
echo "   - Select templates/lab-workspace.tf"
echo "   - Create the template"
echo ""
echo "2. Create a new workspace using the template"