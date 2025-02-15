import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import axios from 'axios';
import ignore from 'ignore';

var webview: vscode.Webview;
var character: string = "My name is 'Your Copilot' and i was developed by 'Paulo Rodrigues'. I'm experienced developer, my answers and code examples are in markdown formatted, offer code assistance and help in troubleshooting in code languages, i can write tests and fix code.";
var _context: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
    _context = context;
    // use the inline completion provider
    //context.subscriptions.push(vscode.languages.registerInlineCompletionItemProvider({ scheme: 'file' }, new InlineCompletionItemProvider()));
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('your-copilot-view', new YourCopilotWebViewProvider(), { webviewOptions: { retainContextWhenHidden: true } }));

    // Listen for active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && webview) {
                const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
                const content = editor.document.getText();
                webview.postMessage({
                    command: 'your-copilot.active-file',
                    text: relativePath,
                    content: content
                });
            }
        })
    );

    // Send initial active editor if exists
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && webview) {
        const relativePath = vscode.workspace.asRelativePath(activeEditor.document.uri);
        const content = activeEditor.document.getText();
        webview.postMessage({
            command: 'your-copilot.active-file',
            text: relativePath,
            content: content
        });
    }
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

                    case 'your-copilot.save-settings':
                        saveSettings(message.text.server, message.text.token);
                        return;
                        
                    case 'your-copilot.search-files':
                        searchFiles(message.text).then(files => {
                            webview.postMessage({ command: 'your-copilot.file-list', files });
                        });
                        return;

                    case 'your-copilot.get-file-content':
                        const content = getFileContent(message.text);
                        webview.postMessage({ 
                            command: 'your-copilot.file-content', 
                            text: message.text,
                            content: content 
                        });
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

const saveSettings = (server: string, token: string) => {
    _context.globalState.update('server', server);
    _context.globalState.update('token', token);
}

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
                "max_tokens": 128,
                "model": 'gpt-3.5-turbo', //if you want to use the openai api.
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
                //show an vscode extension error message
                console.error(`Error when sending message: ` + error);
                // show an alert to the user error.response.data.error.message
                if (server.indexOf('api.openai.com') > -1) {
                    vscode.window.showErrorMessage('Your-Copilot - Error when sending message - ' + error.message + " | " + error.response?.data?.error?.message, 'Dismiss');
                }
                else {
                    vscode.window.showErrorMessage('Your-Copilot - Error when sending message - ' + error.message, 'Dismiss');
                }

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

    static async predictCode(server: string, message: string, token?: string) {
        return await axios.post(server + '/v1/chat/completions', {
            "messages": [
                { "role": "system", "content": 'Predict and complete this code, only answer the predicted code' },
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
    }
}

class InlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): vscode.ProviderResult<any> {
        console.log('Provide completion called');
        console.log(document.getText());
        const result: vscode.InlineCompletionList = {
            items: [],
        };

        YourCopilot.predictCode(_context.globalState.get(`server`) ? _context.globalState.get(`server`) as string : `http://localhost:1234`, `Complete and predict this code, only answer the predicted code: ${document.getText()}`)
            .then((res) => {
                result.items.push({ insertText: res?.data?.choices[0]?.message?.content })
                return new Promise((resolve) => {
                    resolve(result);
                });
            })
            .catch((reject) => {
                console.log(`Inline completion not working`);
            })
    }
}

async function searchFiles(query: string): Promise<string[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
        return [];
    }

    // Read .gitignore if it exists
    const ig = ignore();
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        ig.add(gitignoreContent);
    }

    // Add common files to ignore
    ig.add([
        'node_modules',
        '.git',
        'dist',
        'out',
        '.DS_Store'
    ]);

    // Function to recursively get all files
    const getAllFiles = (dir: string, files: string[] = []): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(workspaceRoot, fullPath);

            // Skip if path is ignored by .gitignore
            if (ig.ignores(relativePath)) {
                continue;
            }

            if (entry.isDirectory()) {
                getAllFiles(fullPath, files);
            } else {
                files.push(relativePath);
            }
        }

        return files;
    };

    const allFiles = getAllFiles(workspaceRoot);
    
    // If query is empty, return first 10 files
    if (!query.trim()) {
        return allFiles.slice(0, 10);
    }

    // Split query into terms for better matching
    const terms = query.toLowerCase().split(/\s+/);
    
    // Score and filter files based on the query
    const scoredFiles = allFiles.map(file => {
        const fileName = path.basename(file).toLowerCase();
        const filePath = file.toLowerCase();
        let score = 0;

        for (const term of terms) {
            // Higher score for matches in the filename
            if (fileName.includes(term)) {
                score += 2;
            }
            // Lower score for matches in the path
            if (filePath.includes(term)) {
                score += 1;
            }
            // Bonus for exact matches
            if (fileName === term) {
                score += 3;
            }
            // Bonus for starts with
            if (fileName.startsWith(term)) {
                score += 2;
            }
        }

        return { file, score };
    });

    // Sort by score and return top 10 matches
    return scoredFiles
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.file)
        .slice(0, 10);
}

function getFileContent(filePath: string): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
        return '';
    }

    const fullPath = path.join(workspaceRoot, filePath);
    try {
        return fs.readFileSync(fullPath, 'utf8');
    } catch (error) {
        console.error('Error reading file:', error);
        return '';
    }
}