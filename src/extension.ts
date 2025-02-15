import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import axios from 'axios';
import ignore from 'ignore';

// Types
interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface Settings {
    server: string;
    token: string;
    maxContextMessages: number;
    stream: boolean;
}

// Constants
const DEFAULT_SETTINGS: Settings = {
    server: 'http://localhost:1234',
    token: '',
    maxContextMessages: 30,
    stream: false
};

const DEFAULT_CHARACTER: string = `You are an intelligent assistant designed to assist software developers with various tasks related to coding, troubleshooting, debugging, writing tests, and general development-related inquiries. You should be responsive, knowledgeable, and provide clear, actionable advice.

Core Responsibilities
Code Assistance

Provide code examples in markdown format.
Write clean, efficient, and maintainable code for a wide range of programming languages (e.g., Python, JavaScript, Java, C++).
Offer best practices and design patterns when appropriate.
Troubleshooting

Help identify and fix bugs or issues in existing codebases.
Analyze error logs and provide solutions to common and complex problems.
Suggest improvements for performance optimization and scalability.
Testing and Debugging

Write unit tests, integration tests, and end-to-end tests using frameworks like pytest (Python), Jest (JavaScript), or JUnit (Java).
Provide strategies to ensure code quality through automated testing.
Suggest debugging tools and techniques.
Project Management

Offer advice on project planning, estimation, and task prioritization.
Help with version control best practices (e.g., Git).
Learning and Development

Provide resources for learning new technologies or improving existing skills.
Suggest books, courses, and articles to stay updated in the tech industry.
Guidelines
Be clear and concise.`;

// Global state
class GlobalState {
    private static instance: GlobalState;
    private webview: vscode.Webview | undefined;
    private context: vscode.ExtensionContext | undefined;
    private messageHistory: Message[] = [];
    private systemMessage: Message;

    private constructor() {
        this.systemMessage = { role: 'system', content: DEFAULT_CHARACTER };
        this.messageHistory = [this.systemMessage];
    }

    static getInstance(): GlobalState {
        if (!GlobalState.instance) {
            GlobalState.instance = new GlobalState();
        }
        return GlobalState.instance;
    }

    setWebview(webview: vscode.Webview) {
        this.webview = webview;
    }

    getWebview(): vscode.Webview | undefined {
        return this.webview;
    }

    setContext(context: vscode.ExtensionContext) {
        this.context = context;
    }

    getContext(): vscode.ExtensionContext | undefined {
        return this.context;
    }

    addMessage(message: Message) {
        // Ensure system message is always first
        if (this.messageHistory[0]?.role !== 'system') {
            this.messageHistory.unshift(this.systemMessage);
        }

        this.messageHistory.push(message);
        
        // Trim history while preserving system message
        const settings = this.getSettings();
        if (this.messageHistory.length > settings.maxContextMessages) {
            const systemMessage = this.messageHistory.shift(); // Remove and store system message
            this.messageHistory = this.messageHistory.slice(-(settings.maxContextMessages - 1)); // Keep space for system message
            this.messageHistory.unshift(systemMessage!); // Add system message back at the start
        }
    }

    getMessageHistory(): Message[] {
        // Ensure system message is present and first
        if (this.messageHistory.length === 0 || this.messageHistory[0]?.role !== 'system') {
            this.messageHistory.unshift(this.systemMessage);
        }
        return this.messageHistory;
    }

    clearMessageHistory() {
        this.messageHistory = [this.systemMessage];
    }

    getSettings(): Settings {
        const context = this.getContext();
        if (!context) {
            return DEFAULT_SETTINGS;
        }

        return {
            server: context.globalState.get('server') as string || DEFAULT_SETTINGS.server,
            token: context.globalState.get('token') as string || DEFAULT_SETTINGS.token,
            maxContextMessages: context.globalState.get('maxContextMessages') as number || DEFAULT_SETTINGS.maxContextMessages,
            stream: context.globalState.get('stream') as boolean || DEFAULT_SETTINGS.stream
        };
    }

    updateSettings(settings: Partial<Settings>) {
        const context = this.getContext();
        if (!context) {
            return;
        }

        const currentSettings = this.getSettings();
        const newSettings = { ...currentSettings, ...settings };

        Object.entries(newSettings).forEach(([key, value]) => {
            context.globalState.update(key, value);
        });
    }
}

// Extension activation
export function activate(context: vscode.ExtensionContext) {
    const state = GlobalState.getInstance();
    state.setContext(context);
    state.clearMessageHistory(); // Initialize with system message

    let webviewProvider = new YourCopilotWebViewProvider();

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'your-copilot-view',
            webviewProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Listen for active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                const state = GlobalState.getInstance();
                const webview = state.getWebview();
                
                if (webview) {
                    try {
                        // Ignore some file types that shouldn't be referenced
                        const ignoredExtensions = ['.git', '.pdf', '.jpg', '.png', '.ico'];
                        const filePath = editor.document.uri.fsPath;
                        if (ignoredExtensions.some(ext => filePath.endsWith(ext))) {
                            return;
                        }

                        const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
                        const content = editor.document.getText();
                        
                        console.log('Sending active file update:', relativePath);
                        
                        webview.postMessage({
                            command: 'your-copilot.active-file',
                            text: relativePath,
                            content: content
                        });
                    } catch (error) {
                        console.error('Error sending active file update:', error);
                    }
                }
            }
        })
    );
}

// WebView Provider
class YourCopilotWebViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;
        const state = GlobalState.getInstance();
        state.setWebview(webviewView.webview);

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(vscode.Uri.file(__dirname), '..', 'src', 'webview'),
                vscode.Uri.joinPath(vscode.Uri.file(__dirname), '..', 'node_modules')
            ]
        };

        webviewView.webview.html = this.getWebviewContent(vscode.Uri.file(__dirname));

        webviewView.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'your-copilot.send':
                        await YourCopilot.sendMessage(message.text);
                        return;

                    case 'your-copilot.save-settings':
                        state.updateSettings({
                            server: message.text.server,
                            token: message.text.token,
                            stream: message.text.stream
                        });
                        return;

                    case 'your-copilot.search-files':
                        const files = await FileManager.searchFiles(message.text);
                        state.getWebview()?.postMessage({ command: 'your-copilot.file-list', files });
                        return;

                    case 'your-copilot.get-file-content':
                        const content = FileManager.getFileContent(message.text);
                        state.getWebview()?.postMessage({
                            command: 'your-copilot.file-content',
                            text: message.text,
                            content: content
                        });
                        return;

                    case 'your-copilot.clear-conversation':
                        state.clearMessageHistory();
                        return;
                }
            },
            undefined
        );

        // Send initial active editor if exists
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            try {
                const relativePath = vscode.workspace.asRelativePath(activeEditor.document.uri);
                const content = activeEditor.document.getText();
                
                console.log('Sending initial active file:', relativePath);
                
                webviewView.webview.postMessage({
                    command: 'your-copilot.active-file',
                    text: relativePath,
                    content: content
                });
            } catch (error) {
                console.error('Error sending initial active file:', error);
            }
        }
    }

    private getWebviewContent(extensionUri: vscode.Uri): string {
        const webviewUri = vscode.Uri.joinPath(extensionUri, '..', 'src', 'webview', 'index.html');
        try {
            let html = fs.readFileSync(webviewUri.fsPath, 'utf8');
            
            // Get webview
            const webview = GlobalState.getInstance().getWebview();
            if (!webview) {
                throw new Error('Webview not initialized');
            }

            // Create URIs for local resources
            const stylesUri = webview.asWebviewUri(
                vscode.Uri.joinPath(extensionUri, '..', 'src', 'webview', 'styles.css')
            );
            const scriptUri = webview.asWebviewUri(
                vscode.Uri.joinPath(extensionUri, '..', 'src', 'webview', 'script.js')
            );

            // Replace placeholders with actual URIs
            html = html
                .replace('{{STYLES_URI}}', stylesUri.toString())
                .replace('{{SCRIPT_URI}}', scriptUri.toString());

            return html;
        } catch (error) {
            console.error('Error reading or processing HTML file:', error);
            return 'Error loading HTML file';
        }
    }
}

// AI Communication
class YourCopilot {
    static async sendMessage(messageData: { server: string; message: string; token?: string; stream: boolean }) {
        const state = GlobalState.getInstance();
        const webview = state.getWebview();
        if (!webview) {
            console.error('Webview not available');
            return;
        }

        try {
            // Add user message to history
            state.addMessage({ role: 'user', content: messageData.message });

            if (!messageData.stream) {
                const response = await this.sendNonStreamingMessage(messageData);
                const assistantMessage = response.data.choices[0].message?.content;
                
                if (assistantMessage) {
                    // Add assistant response to history
                    state.addMessage({ role: 'assistant', content: assistantMessage });
                    
                    // Send message to webview
                    webview.postMessage({
                        command: 'your-copilot.receive',
                        text: assistantMessage
                    });
                } else {
                    console.error('Empty response from API');
                    webview.postMessage({
                        command: 'your-copilot.error',
                        text: 'Empty response from API'
                    });
                }
            } else {
                await this.sendStreamingMessage(messageData);
            }
        } catch (error: any) {
            this.handleError(error, messageData.server, webview);
            // Restore system message if there was an error
            if (state.getMessageHistory()[0]?.role !== 'system') {
                state.clearMessageHistory();
            }
        }
    }

    private static async sendNonStreamingMessage(messageData: { server: string; message: string; token?: string }) {
        const state = GlobalState.getInstance();
        const messages = state.getMessageHistory();

        return await axios.post(
            `${messageData.server}/v1/chat/completions`,
            {
                messages: messages,
                temperature: 0.7,
                max_tokens: 128,
                model: 'gpt-3.5-turbo',
                stream: false
            },
            {
                maxBodyLength: Infinity,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': messageData.token ? `Bearer ${messageData.token}` : undefined
                }
            }
        );
    }

    private static async sendStreamingMessage(messageData: { server: string; message: string }) {
        const state = GlobalState.getInstance();
        const webview = state.getWebview();
        if (!webview) return;

        const messages = state.getMessageHistory();
        const [hostname, port] = messageData.server.split('://')[1].split(':');
        const options = {
            method: 'POST',
            hostname,
            port,
            path: '/v1/chat/completions',
            headers: { 'Content-Type': 'application/json' },
            maxRedirects: 20
        };

        let streamId = Date.now().toString();
        let fullMessage = '';

        const req = http.request(options, (res) => {
            res.on("data", (chunk) => {
                try {
                    const chunkStr = chunk.toString();
                    if (chunkStr !== 'data: [DONE]' && chunkStr.startsWith('data: ')) {
                        const jsonChunk = JSON.parse(chunkStr.slice(6)); // Remove 'data: ' prefix
                        const content = jsonChunk.choices[0]?.delta?.content || '';
                        
                        if (content) {
                            fullMessage += content;
                            webview.postMessage({
                                command: 'your-copilot.receive-stream',
                                text: {
                                    ...jsonChunk,
                                    id: streamId
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error('Error processing stream chunk:', e);
                }
            });

            res.on("end", () => {
                if (fullMessage) {
                    state.addMessage({ role: 'assistant', content: fullMessage });
                    webview.postMessage({
                        command: 'your-copilot.receive-stream',
                        text: {
                            id: streamId,
                            finish_reason: 'stop'
                        }
                    });
                }
            });

            res.on("error", (error) => {
                console.error('Stream error:', error);
                webview.postMessage({
                    command: 'your-copilot.error',
                    text: error.message
                });
                
                // Restore system message if there was an error
                if (state.getMessageHistory()[0]?.role !== 'system') {
                    state.clearMessageHistory();
                }
            });
        });

        req.on('error', (error) => {
            console.error('Request error:', error);
            webview.postMessage({
                command: 'your-copilot.error',
                text: error.message
            });
        });

        req.write(JSON.stringify({
            messages: messages,
            temperature: 0.7,
            max_tokens: -1,
            stream: true
        }));

        req.end();
    }

    private static handleError(error: any, server: string, webview: vscode.Webview) {
        console.error(`Error when sending message: ${error}`);
        
        if (server.includes('api.openai.com')) {
            vscode.window.showErrorMessage(
                `Your-Copilot - Error when sending message - ${error.message} | ${error.response?.data?.error?.message}`,
                'Dismiss'
            );
        } else {
            vscode.window.showErrorMessage(
                `Your-Copilot - Error when sending message - ${error.message}`,
                'Dismiss'
            );
        }

        webview.postMessage({ command: 'your-copilot.error', text: "" });
    }

    static async predictCode(server: string, message: string, token?: string) {
        return await axios.post(
            `${server}/v1/chat/completions`,
            {
                messages: [
                    { role: 'system', content: 'Predict and complete this code, only answer the predicted code' },
                    { role: 'user', content: message }
                ],
                temperature: 0.7,
                max_tokens: -1,
                stream: false
            },
            {
                maxBodyLength: Infinity,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : undefined
                }
            }
        );
    }
}

// File Management
class FileManager {
    static async searchFiles(query: string): Promise<string[]> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!workspaceRoot) {
            return [];
        }

        const ig = this.getIgnoreFilter(workspaceRoot);
        const allFiles = this.getAllFiles(workspaceRoot, ig);
        
        return this.filterAndScoreFiles(allFiles, query);
    }

    private static getIgnoreFilter(workspaceRoot: string): ReturnType<typeof ignore> {
        const ig = ignore();
        
        // Add common files to ignore
        ig.add([
            'node_modules',
            '.git',
            'dist',
            'out',
            '.DS_Store'
        ]);

        // Add .gitignore patterns if exists
        const gitignorePath = path.join(workspaceRoot, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
            ig.add(gitignoreContent);
        }

        return ig;
    }

    private static getAllFiles(dir: string, ig: ReturnType<typeof ignore>, workspaceRoot = dir, files: string[] = []): string[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(workspaceRoot, fullPath);

            if (ig.ignores(relativePath)) {
                continue;
            }

            if (entry.isDirectory()) {
                this.getAllFiles(fullPath, ig, workspaceRoot, files);
            } else {
                files.push(relativePath);
            }
        }

        return files;
    }

    private static filterAndScoreFiles(files: string[], query: string): string[] {
        if (!query.trim()) {
            return files.slice(0, 10);
        }

        const terms = query.toLowerCase().split(/\s+/);
        const scoredFiles = files.map(file => {
            const fileName = path.basename(file).toLowerCase();
            const filePath = file.toLowerCase();
            let score = 0;

            for (const term of terms) {
                if (fileName === term) score += 3;
                if (fileName.startsWith(term)) score += 2;
                if (fileName.includes(term)) score += 2;
                if (filePath.includes(term)) score += 1;
            }

            return { file, score };
        });

        return scoredFiles
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.file)
            .slice(0, 10);
    }

    static getFileContent(filePath: string): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!workspaceRoot) {
            return '';
        }

        try {
            return fs.readFileSync(path.join(workspaceRoot, filePath), 'utf8');
        } catch (error) {
            console.error('Error reading file:', error);
            return '';
        }
    }
}

// Inline Completion Provider
class InlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList | undefined> {
        const state = GlobalState.getInstance();
        const settings = state.getSettings();

        try {
            const response = await YourCopilot.predictCode(
                settings.server,
                `Complete and predict this code, only answer the predicted code: ${document.getText()}`
            );

            return {
                items: [{
                    insertText: response?.data?.choices[0]?.message?.content || ''
                }]
            };
        } catch (error) {
            console.log('Inline completion not working', error);
            return undefined;
        }
    }
}