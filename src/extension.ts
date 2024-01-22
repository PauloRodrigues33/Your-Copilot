import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    var view = vscode.window.registerWebviewViewProvider('your-copilot-view', new ViewProvider(), {
		webviewOptions: {
			retainContextWhenHidden: true,
		},
	});

	context.subscriptions.push(view);
}

export function deactivate() {
    // Deactivation logic, if needed
}

class ViewProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        webviewView.webview.options = {
            enableScripts: true,
        };

        const content = getWebviewContent(vscode.Uri.file(__dirname));
        webviewView.webview.html = content;
    }
}

const getWebviewContent = (extensionUri: vscode.Uri) => {
    const htmlPath = path.join(extensionUri.fsPath, 'src', 'webview', 'index.html');
    
    try {
        const content = fs.readFileSync(htmlPath, 'utf8');
        return content;
    } catch (error) {
        console.error('Error reading HTML file:', error);
        return 'Error loading HTML file';
    }
};