# Kubernetes-Based Grading Server

This system provides automated grading capabilities for practical coding labs within a Kubernetes environment integrated with Coder workspaces.

## Architecture Overview

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│                             │         │                             │
│  Coder Workspace            │         │  Grading Server             │
│  ┌─────────────────┐        │         │                             │
│  │                 │        │   In-   │  ┌─────────────────┐        │
│  │  VS Code with   │ Cluster│         │  │                 │        │
│  │  Grader         │────────┼────────►│  │  API Endpoint   │        │
│  │  Extension      │ Request│         │  │                 │        │
│  │                 │        │         │  └────────┬────────┘        │
│  └─────────────────┘        │         │           │                 │
│                             │         │           ▼                 │
│                             │         │  ┌─────────────────┐        │
│                             │         │  │                 │        │
│                             │         │  │  Grading        │        │
│                             │         │  │  Worker         │        │
│                             │         │  │                 │        │
│                             │         │  └─────────────────┘        │
│                             │         │                             │
└─────────────────────────────┘         └─────────────────────────────┘
```

## Key Components

1. **VS Code Extension**: Installed in Coder workspaces, providing UI for lab instructions and submissions
2. **Grading API**: Kubernetes service accepting grading requests
3. **Grading Workers**: Isolated environments that run test scripts
4. **Lab Repositories**: Store lab content, test scripts, and expected outputs

## Project Structure

```
grading-server/
├── src/                        # Node.js server source code
│   ├── server.js               # Express server entry point
│   ├── routes/                 # API route handlers
│   ├── grader/                 # Grading logic
│   └── util/                   # Utility functions
│
├── worker/                     # Grading worker code
│   └── grade.py                # Python grading script
│
├── extension/                  # VS Code extension
│   ├── src/                    # Extension TypeScript source
│   └── package.json            # Extension manifest
│
├── k8s/                        # Kubernetes manifests
│   ├── grading-server.yaml     # Server deployment
│   └── lab-content-configmap.yaml # Lab content
│
├── Dockerfile                  # Server container image
├── Dockerfile.worker           # Worker container image
└── package.json                # Server dependencies
```

## Authentication & Security

The system uses a dual authentication approach:

1. **GitHub-Based Identity**: Leverages Coder's GitHub authentication
2. **Workspace Token**: Cryptographically generated proof of workspace ownership

## Quick Start

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

1. Build and push Docker images:
```bash
docker build -t your-registry/grading-server:latest .
docker build -f Dockerfile.worker -t your-registry/grading-worker:latest .
docker push your-registry/grading-server:latest
docker push your-registry/grading-worker:latest
```

2. Deploy to Kubernetes:
```bash
./deploy.sh
```

3. Build the VS Code extension:
```bash
cd extension
npm install
npm run package
```

4. Add the extension to your Coder workspace template

## Use Cases

This grading system can be used for a variety of lab exercises:

1. **Network Troubleshooting**: Students need to diagnose and fix connection problems between services
2. **Security Analysis**: Identifying and mitigating vulnerabilities in a system
3. **Database Optimization**: Tuning a database for better performance
4. **Application Development**: Building and deploying applications to meet requirements
5. **Infrastructure Configuration**: Setting up and configuring cloud resources

## Development

To run the server locally for development:

```bash
npm install
npm run dev
```

The server will be available at http://localhost:8080.

To develop the VS Code extension:

```bash
cd extension
npm install
npm run watch
```

Then press F5 in VS Code to launch with the extension.

## Adding New Labs

See the [Adding New Labs](./DEPLOYMENT.md#step-8-create-test-lab-content) section in the deployment guide.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.