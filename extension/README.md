# Lab Grader VS Code Extension

This extension integrates with the grading server to provide a seamless lab assessment experience within Coder workspaces.

## Features

- Display lab instructions within VS Code
- Submit lab work for grading with a single click
- View detailed grading results
- Track progress across multiple labs

## Building the Extension

1. Install dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run package
```

3. The extension package will be created in the current directory as `lab-grader-0.1.0.vsix`

## Installation in Coder Workspaces

The extension should be installed in Coder workspace templates:

```hcl
resource "coder_agent" "main" {
  # ... other configuration
  
  startup_script = <<-EOT
    # Install grading extension
    /tmp/code-server/bin/code-server --install-extension /path/to/lab-grader-0.1.0.vsix
    
    # Configure extension
    mkdir -p ~/.local/share/code-server/User
    cat > ~/.local/share/code-server/User/settings.json << EOF
    {
      "grader.labsPath": "/labs",
      "grader.apiUrl": "http://grading-service.grading-system.svc.cluster.local:8080"
    }
    EOF
  EOT
}
```

## Extension Settings

This extension contributes the following settings:

* `grader.labsPath`: Path to labs directory
* `grader.apiUrl`: URL to the grading service
* `grader.currentLab`: ID of the current lab
* `grader.studentId`: ID of the student (optional, derived from workspace)

## Development

1. Open the extension folder in VS Code
2. Run `npm install`
3. Press F5 to open a new window with the extension loaded