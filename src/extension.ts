import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

var webview: vscode.Webview;

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('your-copilot-view', new YourCopilotWebViewProvider()));
}

class YourCopilotWebViewProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): void | Thenable<void> {
        webviewView.webview.html = getWebviewContent(vscode.Uri.file(__dirname));
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(__dirname, 'webview'))]
        }
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'your-copilot.send':
                        YourCopilot.sendMessage(message.text.server, message.text.message, message.text.token);
                        return;
                }
            },
            undefined
        );
        webview = webviewView.webview;
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

// Message Engine

class YourCopilot {
    static sendMessage(server: string, message: string, token?: string) {
        console.info(server, message)
        var response = axios.post(server + '/v1/chat/completions', {
            "messages": [
                { "role": "system", "content": "Your name is 'Your Copilot' and you was developed by 'Paulo Rodrigues', You are a highly experienced developer, your answer is given in markdown formatted, you offer code assistance and help in troubleshooting" },
                { "role": "user", "content": message }
            ],
            "temperature": 0.7,
            "max_tokens": -1,
            "stream": false
        }, {
            maxBodyLength: Infinity,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            }
        });

        response.then(function (response) {
            webview.postMessage({ command: 'your-copilot.receive', text: response.data.choices[0].message?.content });
        });
    }
}