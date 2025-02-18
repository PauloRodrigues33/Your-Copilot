import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';

interface Settings {
    server: string;
    token: string;
    stream: boolean;
}

export class ContextService {
    private webview: vscode.Webview;
    private messageHistory: string[] = [];
    private settings: Settings = {
        server: '',
        token: '',
        stream: false
    };

    constructor(webview: vscode.Webview) {
        this.webview = webview;
    }

    async sendMessage(message: { server: string; message: string; token: string; stream: boolean }) {
        try {
            this.settings = {
                server: message.server,
                token: message.token,
                stream: message.stream
            };

            // Add file references to the message
            let enhancedMessage = message.message;
            
            // Get all referenced files from the webview with timeout
            const referencedFiles = await Promise.race([
                new Promise<{[path: string]: string}>(resolve => {
                    let resolved = false;
                    const messageHandler = this.webview.onDidReceiveMessage(event => {
                        if (event.command === 'your-copilot.referenced-files') {
                            if (!resolved) {
                                resolved = true;
                                messageHandler.dispose();
                                resolve(event.files || {});
                            }
                        }
                    });

                    this.webview.postMessage({
                        command: 'your-copilot.get-referenced-files'
                    });
                }),
                // Add a 500ms timeout to handle cases where there are no references
                new Promise<{[path: string]: string}>(resolve => 
                    setTimeout(() => resolve({}), 500)
                )
            ]);

            // Add file contents to the message if there are any
            if (Object.keys(referencedFiles).length > 0) {
                for (const [path, content] of Object.entries(referencedFiles)) {
                    if (content) { // Only add if content exists
                        enhancedMessage += `\n\nReferenced file ${path}:\n\`\`\`${this.getFileExtension(path)}\n${content}\n\`\`\``;
                    }
                }
            }

            this.messageHistory.push(enhancedMessage);

            if (message.stream) {
                await this.streamResponse({ ...message, message: enhancedMessage });
            } else {
                await this.sendSingleResponse({ ...message, message: enhancedMessage });
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.webview.postMessage({
                command: 'your-copilot.error',
                text: 'Error sending message to server'
            });
        }
    }

    private async streamResponse(message: { server: string; message: string; token: string }) {
        try {
            const response = await axios.post(
                `${message.server}/v1/chat/completions`,
                {
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: message.message }],
                    stream: true
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${message.token}`
                    },
                    responseType: 'stream'
                }
            );

            response.data.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                
                for (const line of lines) {
                    if (line.includes('[DONE]')) {
                        return;
                    }

                    try {
                        const json = JSON.parse(line.replace('data: ', ''));
                        this.webview.postMessage({
                            command: 'your-copilot.receive-stream',
                            text: json
                        });
                    } catch (error) {
                        console.error('Error parsing stream chunk:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error in stream response:', error);
            this.webview.postMessage({
                command: 'your-copilot.error',
                text: 'Error streaming response from server'
            });
        }
    }

    private async sendSingleResponse(message: { server: string; message: string; token: string }) {
        try {
            const response = await axios.post(
                `${message.server}/v1/chat/completions`,
                {
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: message.message }],
                    stream: false
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${message.token}`
                    }
                }
            );

            const content = response.data.choices[0].message.content;
            this.messageHistory.push(content);

            this.webview.postMessage({
                command: 'your-copilot.receive',
                text: content
            });
        } catch (error) {
            console.error('Error in single response:', error);
            this.webview.postMessage({
                command: 'your-copilot.error',
                text: 'Error getting response from server'
            });
        }
    }

    async searchFiles(query: string) {
        try {
            const files = await vscode.workspace.findFiles('**/*');
            const searchResults = files
                .map(file => vscode.workspace.asRelativePath(file))
                .filter(filePath => {
                    // Ignore node_modules, .git, and other common directories
                    if (filePath.includes('node_modules/') || 
                        filePath.includes('.git/') || 
                        filePath.includes('dist/') ||
                        filePath.includes('build/')) {
                        return false;
                    }

                    // If there's a query, filter by it
                    if (query) {
                        const fileName = path.basename(filePath).toLowerCase();
                        const searchTerms = query.toLowerCase().split(/\s+/);
                        return searchTerms.every(term => 
                            fileName.includes(term) || filePath.toLowerCase().includes(term)
                        );
                    }

                    return true;
                })
                .slice(0, 10);

            this.webview.postMessage({
                command: 'your-copilot.file-list',
                files: searchResults
            });
        } catch (error) {
            console.error('Error searching files:', error);
        }
    }

    async getFileContent(filePath: string) {
        try {
            const files = await vscode.workspace.findFiles(filePath);
            if (files.length > 0) {
                const document = await vscode.workspace.openTextDocument(files[0]);
                const content = document.getText();

                this.webview.postMessage({
                    command: 'your-copilot.file-content',
                    text: filePath,
                    content
                });
            }
        } catch (error) {
            console.error('Error getting file content:', error);
        }
    }

    async applyCode(code: string) {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const currentContent = activeEditor.document.getText();
                const uri = activeEditor.document.uri;
                
                // Create a temporary file for the new content
                const tempUri = uri.with({ scheme: 'untitled', path: uri.path + '.new' });
                const doc = await vscode.workspace.openTextDocument(tempUri);
                const edit = new vscode.WorkspaceEdit();
                edit.insert(tempUri, new vscode.Position(0, 0), code);
                await vscode.workspace.applyEdit(edit);

                // Show diff
                const title = `${path.basename(uri.fsPath)} ↔ New Changes`;
                await vscode.commands.executeCommand('vscode.diff', 
                    uri,
                    tempUri,
                    title,
                    { preview: true }
                );
            }
        } catch (error) {
            console.error('Error applying code:', error);
        }
    }

    handleActiveFileChange(document: vscode.TextDocument) {
        try {
            const ignoredExtensions = ['.git', '.pdf', '.jpg', '.png', '.ico'];
            const filePath = document.uri.fsPath;
            
            // Ignore binary files and specific directories
            if (ignoredExtensions.some(ext => filePath.endsWith(ext)) ||
                filePath.includes('node_modules/') ||
                filePath.includes('.git/') ||
                filePath.includes('dist/') ||
                filePath.includes('build/')) {
                return;
            }

            const relativePath = vscode.workspace.asRelativePath(document.uri);
            const content = document.getText();
            
            // Only send if the file has content
            if (content.trim()) {
                // Send file reference update without sending to chat
                this.webview.postMessage({
                    command: 'your-copilot.active-file',
                    text: relativePath,
                    content
                });
            }
        } catch (error) {
            console.error('Error handling active file change:', error);
        }
    }

    private getFileExtension(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        switch (ext) {
            case '.ts':
            case '.tsx':
                return 'typescript';
            case '.js':
            case '.jsx':
                return 'javascript';
            case '.py':
                return 'python';
            case '.java':
                return 'java';
            case '.html':
                return 'html';
            case '.css':
                return 'css';
            case '.json':
                return 'json';
            case '.md':
                return 'markdown';
            default:
                return ext.slice(1) || 'plaintext';
        }
    }

    clearConversation() {
        this.messageHistory = [];
    }
} 