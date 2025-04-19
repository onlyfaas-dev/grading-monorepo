#!/bin/bash
set -e

# Configuration
ECR_REPO="344200675140.dkr.ecr.us-east-1.amazonaws.com/my-cluster-repo"
AWS_PROFILE="of"

# Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --profile $AWS_PROFILE | docker login --username AWS --password-stdin $ECR_REPO

# Build and push VS Code extension
echo "Building VS Code extension image..."
cd extension
docker build -t $ECR_REPO:extension-vsix -f Dockerfile.vsix .
echo "Pushing VS Code extension image..."
docker push $ECR_REPO:extension-vsix
cd ..

# Build and push Grading Server
echo "Building Grading Server image..."
docker build -t $ECR_REPO:grading-server -f Dockerfile.prod .
echo "Pushing Grading Server image..."
docker push $ECR_REPO:grading-server

# Build and push Grading Worker
echo "Building Grading Worker image..."
docker build -t $ECR_REPO:grading-worker -f Dockerfile.worker.prod .
echo "Pushing Grading Worker image..."
docker push $ECR_REPO:grading-worker

echo "All images built and pushed successfully!"