import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { marked } from 'marked';

// Define types
interface GradingResults {
  lab: string;
  items: {
    name: string;
    points: number;
    possible: number;
    message: string;
  }[];
  score: number;
  total: number;
  timestamp: string;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Lab Grader extension is active');

  // Register commands
  const showInstructionsCommand = vscode.commands.registerCommand('labGrader.showInstructions', () => {
    showLabInstructions(context);
  });

  const submitLabCommand = vscode.commands.registerCommand('labGrader.submitLab', async () => {
    await submitLabForGrading(context);
  });

  // Register Lab Instructions view
  const labInstructionsProvider = new LabInstructionsProvider(context);
  vscode.window.registerTreeDataProvider('labInstructions', labInstructionsProvider);

  // Add to context
  context.subscriptions.push(showInstructionsCommand, submitLabCommand);

  // Show instructions on startup
  showLabInstructions(context);
}

// Deactivate extension
export function deactivate() {}

// Lab Instructions provider for the sidebar
class LabInstructionsProvider implements vscode.TreeDataProvider<LabItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<LabItem | undefined> = new vscode.EventEmitter<LabItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<LabItem | undefined> = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: LabItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LabItem): Promise<LabItem[]> {
    if (element) {
      return [];
    }

    const config = vscode.workspace.getConfiguration('grader');
    const labId = config.get('currentLab', 'lab1-network-analysis');
    const labsPath = config.get('labsPath', '/labs');
    
    try {
      const labItems: LabItem[] = [];
      
      // Add lab instructions
      labItems.push(new LabItem(
        'Instructions',
        'Show instructions for the current lab',
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'labGrader.showInstructions',
          title: 'Show Instructions',
          arguments: []
        }
      ));
      
      // Add submit button
      labItems.push(new LabItem(
        'Submit Lab',
        'Submit your work for grading',
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'labGrader.submitLab',
          title: 'Submit Lab',
          arguments: []
        }
      ));
      
      return labItems;
    } catch (error) {
      console.error('Error getting lab items:', error);
      return [];
    }
  }
}

// Tree item for the lab instructions view
class LabItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly tooltip: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip;
  }
}

// Show lab instructions in a webview panel
async function showLabInstructions(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('grader');
  const labId = config.get('currentLab', 'lab1-network-analysis');
  const labsPath = config.get('labsPath', '/labs');
  
  // Read the instructions file
  const instructionsFile = path.join(labsPath, `${labId}-instructions.md`);
  
  try {
    // Check if file exists first because fs.readFile doesn't throw if file doesn't exist
    if (!fs.existsSync(instructionsFile)) {
      vscode.window.showErrorMessage(`Lab instructions not found: ${instructionsFile}`);
      return;
    }
    
    const instructionsText = fs.readFileSync(instructionsFile, 'utf8');
    
    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
      'labInstructions',
      `${formatLabName(labId)} Instructions`,
      vscode.ViewColumn.One,
      {
        enableScripts: true
      }
    );
    
    // Convert Markdown to HTML
    const instructionsHtml = marked(instructionsText);
    
    // Set HTML content
    panel.webview.html = getWebviewContent(formatLabName(labId), instructionsHtml);
  } catch (error) {
    console.error('Error reading instructions:', error);
    vscode.window.showErrorMessage(`Error loading lab instructions: ${error}`);
  }
}

// Format lab ID to a readable name
function formatLabName(labId: string): string {
  return labId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Create HTML content for the webview
function getWebviewContent(title: string, content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body {
          font-family: var(--vscode-editor-font-family);
          padding: 0 20px;
          color: var(--vscode-editor-foreground);
          font-size: var(--vscode-editor-font-size);
        }
        h1 {
          border-bottom: 1px solid var(--vscode-tab-border);
          padding-bottom: 10px;
        }
        pre {
          background-color: var(--vscode-editor-background);
          padding: 10px;
          border-radius: 5px;
          overflow: auto;
        }
        code {
          font-family: var(--vscode-editor-font-family);
          font-size: 0.9em;
        }
        .task {
          margin-bottom: 20px;
          padding-left: 15px;
          border-left: 3px solid var(--vscode-activityBarBadge-background);
        }
        .success {
          color: #4caf50;
        }
        .error {
          color: #f44336;
        }
        button {
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 14px;
          border-radius: 2px;
        }
        button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="content">
        ${content}
      </div>
      <div style="margin-top: 30px; text-align: center;">
        <button onclick="submitLab()">Submit for Grading</button>
      </div>
      <script>
        function submitLab() {
          const vscode = acquireVsCodeApi();
          vscode.postMessage({
            command: 'submit'
          });
        }
      </script>
    </body>
    </html>
  `;
}

// Read the workspace token
async function getWorkspaceToken(): Promise<string> {
  try {
    const tokenPath = path.join(os.homedir(), '.grader', '.token');
    
    // Check if file exists first
    if (!fs.existsSync(tokenPath)) {
      throw new Error('Workspace token not found');
    }
    
    return fs.readFileSync(tokenPath, 'utf8');
  } catch (error) {
    console.error('Error reading workspace token:', error);
    throw new Error('Workspace token not found. This workspace may not be properly configured.');
  }
}

// Submit lab for grading
async function submitLabForGrading(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Get configuration
    const config = vscode.workspace.getConfiguration('grader');
    const labId = config.get('currentLab', 'lab1-network-analysis');
    const apiUrl = config.get('apiUrl', 'http://grading-service.grading-system.svc.cluster.local:8080');
    
    // Get tokens
    let githubToken = context.globalState.get('githubToken') as string;
    
    // If no GitHub token, authenticate first
    if (!githubToken) {
      // In a real implementation, this would redirect to GitHub OAuth
      // For demo purposes, we'll prompt the user for a token
      githubToken = await vscode.window.showInputBox({
        prompt: 'Enter your GitHub token for authentication',
        ignoreFocusOut: true
      }) || '';
      
      if (!githubToken) {
        vscode.window.showErrorMessage('GitHub token is required for authentication');
        return;
      }
      
      // Store token for future use
      context.globalState.update('githubToken', githubToken);
    }
    
    // Get workspace token
    let workspaceToken: string;
    try {
      workspaceToken = await getWorkspaceToken();
    } catch (error) {
      // For development/demo, provide a fallback option
      vscode.window.showWarningMessage('No workspace token found. Using demo mode.');
      workspaceToken = 'demo-workspace-token';
    }
    
    vscode.window.showInformationMessage(`Submitting ${formatLabName(labId)} for grading...`);
    
    // Send to grading service
    const response = await axios.post(
      `${apiUrl}/api/grade`,
      {
        labId,
        workspaceToken,
        githubToken
      }
    );
    
    if (response.data.success) {
      displayResults(response.data.results);
    } else {
      vscode.window.showErrorMessage(`Grading failed: ${response.data.error}`);
    }
  } catch (error: any) {
    console.error('Submission error:', error);
    vscode.window.showErrorMessage(`Submission error: ${error.message || 'Unknown error'}`);
  }
}

// Display grading results
function displayResults(results: GradingResults): void {
  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    'gradingResults',
    `${results.lab} Results`,
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );
  
  // Calculate percentage
  const percentage = Math.round((results.score / results.total) * 100);
  
  // Generate result HTML
  let resultsHtml = `
    <h1>${results.lab} - Grading Results</h1>
    <div class="score-container">
      <div class="score">
        <h2>Score: ${results.score}/${results.total} (${percentage}%)</h2>
      </div>
    </div>
    <div class="results-container">
  `;
  
  // Add each graded item
  for (const item of results.items) {
    const itemPercentage = Math.round((item.points / item.possible) * 100);
    const statusClass = item.points === item.possible ? 'success' : (item.points === 0 ? 'error' : 'partial');
    
    resultsHtml += `
      <div class="result-item ${statusClass}">
        <h3>${item.name} (${item.points}/${item.possible} - ${itemPercentage}%)</h3>
        <p>${item.message}</p>
      </div>
    `;
  }
  
  resultsHtml += '</div>';
  
  // Set HTML content
  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${results.lab} Results</title>
      <style>
        body {
          font-family: var(--vscode-editor-font-family);
          padding: 0 20px;
          color: var(--vscode-editor-foreground);
        }
        h1 {
          border-bottom: 1px solid var(--vscode-tab-border);
          padding-bottom: 10px;
        }
        .score-container {
          margin: 20px 0;
          padding: 15px;
          background-color: var(--vscode-editor-background);
          border-radius: 5px;
          text-align: center;
        }
        .results-container {
          margin-top: 20px;
        }
        .result-item {
          margin-bottom: 15px;
          padding: 10px;
          border-left: 4px solid #cccccc;
          background-color: var(--vscode-editor-background);
        }
        .success {
          border-left-color: #4caf50;
        }
        .error {
          border-left-color: #f44336;
        }
        .partial {
          border-left-color: #ff9800;
        }
        h3 {
          margin-top: 0;
        }
      </style>
    </head>
    <body>
      ${resultsHtml}
    </body>
    </html>
  `;
}