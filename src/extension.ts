import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import axios from 'axios';

var webview: vscode.Webview;
var character: string = "My name is 'Your Copilot' and i was developed by 'Paulo Rodrigues'. I'm experienced developer, my answers is given in markdown formatted, you offer code assistance and help in troubleshooting";

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('your-copilot-view', new YourCopilotWebViewProvider(), { webviewOptions: { retainContextWhenHidden: true } }));
}

class YourCopilotWebViewProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): void | Thenable<void> {
        webviewView.webview.html = getWebviewContent(vscode.Uri.file(__dirname));
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(__dirname, 'webview'))]
        };
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'your-copilot.send':
                        YourCopilot.sendMessage(message.text.server, message.text.message, message.text.token, message.text.stream);
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
    static sendMessage(server: string, message: string, token?: string, stream: boolean = false) {
        console.info(server, message);
        if (!stream) {
            var response = axios.post(server + '/v1/chat/completions', {
                "messages": [
                    { "role": "system", "content": character },
                    { "role": "user", "content": message }
                ],
                "temperature": 0.7,
                "max_tokens": -1,
                "stream": stream
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

            response.catch(function (error) {
                webview.postMessage({ command: 'your-copilot.error', text: "" });
            });
        } else {
            var options = {
                'method': 'POST',
                'hostname': server.split('://')[1].split(':')[0],
                'port': server.split('://')[1].split(':')[1],
                'path': '/v1/chat/completions',
                'headers': {
                    'Content-Type': 'application/json'
                },
                'maxRedirects': 20
            };

            var req = http.request(options, function (res) {
                res.on("data", function (chunk) {
                    try {
                        if (chunk.toString() !== 'data: [DONE]') {
                            var jsonChunk = JSON.parse(chunk.toString().split('data: ')[1]);
                            console.log('data: ', jsonChunk.toString());
                            webview.postMessage({ command: 'your-copilot.receive-stream', text: jsonChunk });
                        }
                    }
                    catch (e) {
                        console.log('Your-Copilot - Error while trying to convert chunks to data', e);
                    }
                });

                res.on("error", function (error) {
                    console.error(`Error when streaming: ` + error);
                    webview.postMessage({ command: 'your-copilot.error', text: "" });
                });
            });

            var postData = JSON.stringify({
                "messages": [
                    {
                        "role": "system",
                        "content": character
                    },
                    {
                        "role": "user",
                        "content": message
                    }
                ],
                "temperature": 0.7,
                "max_tokens": -1,
                "stream": true
            });

            req.write(postData);

            req.end();
        }
    }
}