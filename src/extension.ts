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

    private constructor() { }

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
        this.messageHistory.push(message);
        const settings = this.getSettings();
        if (this.messageHistory.length > settings.maxContextMessages) {
            // Remove oldest messages but keep the system message
            const systemMessage = this.messageHistory.find(m => m.role === 'system');
            this.messageHistory = this.messageHistory.slice(-settings.maxContextMessages);
            if (systemMessage && !this.messageHistory.includes(systemMessage)) {
                this.messageHistory.unshift(systemMessage);
            }
        }
    }

    getMessageHistory(): Message[] {
        return this.messageHistory;
    }

    clearMessageHistory() {
        this.messageHistory = [];
        this.addMessage({ role: 'system', content: DEFAULT_CHARACTER });
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

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'your-copilot-view',
            new YourCopilotWebViewProvider(),
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Listen for active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && state.getWebview()) {
                const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
                const content = editor.document.getText();
                state.getWebview()?.postMessage({
                    command: 'your-copilot.active-file',
                    text: relativePath,
                    content: content
                });
            }
        })
    );

    // Send initial active editor if exists
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && state.getWebview()) {
        const relativePath = vscode.workspace.asRelativePath(activeEditor.document.uri);
        const content = activeEditor.document.getText();
        state.getWebview()?.postMessage({
            command: 'your-copilot.active-file',
            text: relativePath,
            content: content
        });
    }
}

// WebView Provider
class YourCopilotWebViewProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
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
                }
            },
            undefined
        );
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
        if (!webview) return;

        // Add user message to history
        state.addMessage({ role: 'user', content: messageData.message });

        try {
            if (!messageData.stream) {
                const response = await this.sendNonStreamingMessage(messageData);
                const assistantMessage = response.data.choices[0].message?.content;
                
                // Add assistant response to history
                state.addMessage({ role: 'assistant', content: assistantMessage });
                
                webview.postMessage({ command: 'your-copilot.receive', text: assistantMessage });
            } else {
                await this.sendStreamingMessage(messageData);
            }
        } catch (error: any) {
            this.handleError(error, messageData.server, webview);
        }
    }

    private static async sendNonStreamingMessage(messageData: { server: string; message: string; token?: string }) {
        const state = GlobalState.getInstance();
        return await axios.post(
            `${messageData.server}/v1/chat/completions`,
            {
                messages: state.getMessageHistory(),
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

        const [hostname, port] = messageData.server.split('://')[1].split(':');
        const options = {
            method: 'POST',
            hostname,
            port,
            path: '/v1/chat/completions',
            headers: { 'Content-Type': 'application/json' },
            maxRedirects: 20
        };

        const req = http.request(options, (res) => {
            let assistantMessage = '';

            res.on("data", (chunk) => {
                try {
                    if (chunk.toString() !== 'data: [DONE]') {
                        const jsonChunk = JSON.parse(chunk.toString().split('data: ')[1]);
                        assistantMessage += jsonChunk.choices[0]?.delta?.content || '';
                        webview.postMessage({ command: 'your-copilot.receive-stream', text: jsonChunk });
                    }
                } catch (e) {
                    console.log('Your-Copilot - Error while trying to convert chunks to data', e);
                }
            });

            res.on("end", () => {
                if (assistantMessage) {
                    state.addMessage({ role: 'assistant', content: assistantMessage });
                }
            });

            res.on("error", (error) => {
                console.error(`Error when streaming: ${error}`);
                webview.postMessage({ command: 'your-copilot.error', text: "" });
            });
        });

        req.write(JSON.stringify({
            messages: state.getMessageHistory(),
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