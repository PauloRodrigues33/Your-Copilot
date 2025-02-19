// Initialize VSCode API
const vscodeContext = acquireVsCodeApi();
console.log('Main script loaded');

// Initialize showdown converter
const converter = new showdown.Converter();
converter.setFlavor('github');

// React Components
const App = () => {
    const [messages, setMessages] = React.useState([
        { side: 'right', text: 'Hi Copilot!', time: new Date() },
        { side: 'left', text: "Hi, I'm Your Copilot", time: new Date() }
    ]);
    const [fileList, setFileList] = React.useState([]);
    const [selectedFileIndex, setSelectedFileIndex] = React.useState(-1);
    const [lastAtPosition, setLastAtPosition] = React.useState(-1);
    const [referencedFiles, setReferencedFiles] = React.useState(new Map());
    const [isStreaming, setIsStreaming] = React.useState(false);
    const [settings, setSettings] = React.useState(() => {
        try {
            const state = vscodeContext.getState() || {};
            return {
                server: state.server || '',
                token: state.token || '',
                stream: state.stream || false,
                max_tokens: state.max_tokens || 4096,
                temperature: state.temperature || 0.7
            };
        } catch (e) {
            console.error('Error getting state:', e);
            return { 
                server: '', 
                token: '', 
                stream: false,
                max_tokens: 4096,
                temperature: 0.7
            };
        }
    });
    const [showSettings, setShowSettings] = React.useState(false);
    const [showError, setShowError] = React.useState(false);
    const textareaRef = React.useRef(null);
    const chatWrapperRef = React.useRef(null);

    React.useEffect(() => {
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleMessage = (event) => {
        const message = event.data;
        if (!message || !message.command) return;
        
        switch (message.command) {
            case 'your-copilot.receive':
                if (message.text) {
                    updateChat('left', message.text);
                    setIsStreaming(false);
                }
                break;
            case 'your-copilot.receive-stream':
                if (message.text) {
                    if (typeof message.text === 'object' && message.text.finish_reason === 'stop') {
                        setIsStreaming(false);
                    } else {
                        setIsStreaming(true);
                        updateChat('left', message.text, true);
                    }
                }
                break;
            case 'your-copilot.file-list':
                if (Array.isArray(message.files)) {
                    setFileList(message.files);
                    setSelectedFileIndex(message.files.length > 0 ? 0 : -1);
                }
                break;
            case 'your-copilot.file-content':
                if (message.text && message.content) {
                    setReferencedFiles(prev => {
                        const newMap = new Map(prev);
                        newMap.set(message.text, message.content);
                        return newMap;
                    });
                }
                break;
            case 'your-copilot.active-file':
                if (message.text && message.content) {
                    handleActiveFileChange(message.text, message.content);
                }
                break;
            case 'your-copilot.error':
                if (message.text) {
                    console.error('Error:', message.text);
                }
                break;
        }
    };

    const updateChat = (side, message, stream = false) => {
        if (stream) {
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.side === side) {
                    lastMessage.text += message;
                } else {
                    newMessages.push({ side, text: message, time: new Date() });
                }
                return newMessages;
            });
        } else {
            setMessages(prev => [...prev, { side, text: message, time: new Date() }]);
        }
        
        // Scroll to bottom after render
        setTimeout(() => {
            if (chatWrapperRef.current) {
                chatWrapperRef.current.scrollTop = chatWrapperRef.current.scrollHeight;
            }
        }, 0);
    };

    const handleInput = (event) => {
        const textarea = event.target;
        const text = textarea.value;
        const cursorPosition = textarea.selectionStart;
        
        const beforeCursor = text.substring(0, cursorPosition);
        const lastAtIndex = beforeCursor.lastIndexOf('@');
        
        if (lastAtIndex === -1) {
            setFileList([]);
            return;
        }

        const currentWord = beforeCursor.slice(lastAtIndex + 1);
        
        if (/[\s\n]/.test(currentWord)) {
            setFileList([]);
            return;
        }

        if (currentWord.length > 0) {
            setLastAtPosition(lastAtIndex);
            vscodeContext.postMessage({
                command: 'your-copilot.search-files',
                text: currentWord
            });
        } else {
            setFileList([]);
        }
    };

    const handleKeyPress = (event) => {
        if (fileList.length > 0) {
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    setSelectedFileIndex(prev => Math.min(prev + 1, fileList.length - 1));
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    setSelectedFileIndex(prev => Math.max(prev - 1, 0));
                    break;
                case 'Enter':
                    if (selectedFileIndex !== -1) {
                        event.preventDefault();
                        selectFile(fileList[selectedFileIndex]);
                    }
                    break;
                case 'Escape':
                case 'Tab':
                    event.preventDefault();
                    setFileList([]);
                    break;
            }
        } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const textarea = textareaRef.current;
            if (textarea && textarea.value && textarea.value.trim() && settings.server) {
                sendMessage();
            }
        }
    };

    const selectFile = (file) => {
        if (!file) return;

        const textarea = textareaRef.current;
        if (!textarea) return;

        const text = textarea.value;
        if (typeof lastAtPosition !== 'number') return;
        
        const beforeAt = text.substring(0, lastAtPosition);
        const afterCursor = text.substring(textarea.selectionStart);
        
        vscodeContext.postMessage({
            command: 'your-copilot.get-file-content',
            text: file
        });
        
        const fileName = getFileName(file);
        if (!fileName) return;

        textarea.value = beforeAt + '@' + fileName + ' ' + afterCursor;
        
        const newCursorPosition = lastAtPosition + fileName.length + 2;
        textarea.setSelectionRange(newCursorPosition, newCursorPosition);
        
        setFileList([]);
        textarea.focus();
    };

    const handleActiveFileChange = (filePath, content) => {
        if (!filePath || !content) return;

        const textarea = textareaRef.current;
        if (!textarea) return;

        const fileName = getFileName(filePath);
        if (!fileName) return;

        const fileRef = `@${fileName}`;
        const currentValue = textarea.value || '';
        
        if (!currentValue.includes(fileRef)) {
            textarea.value = currentValue + (currentValue ? ' ' : '') + fileRef;
        }
        
        setReferencedFiles(prev => {
            const newMap = new Map(prev);
            newMap.set(filePath, content);
            return newMap;
        });
    };

    const sendMessage = () => {
        if (!settings.server) {
            setShowError(true);
            return;
        }

        // Validate and format server URL
        let serverUrl = settings.server;
        try {
            // Add protocol if missing
            if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                serverUrl = 'http://' + serverUrl;
            }
            // Test if it's a valid URL
            new URL(serverUrl);
        } catch (error) {
            console.error('Invalid server URL:', error);
            setShowError(true);
            updateChat('left', 'Error: Invalid server URL. Please check your settings and make sure to include the protocol (http:// or https://)');
            return;
        }

        const textarea = textareaRef.current;
        if (!textarea) return;

        const input = textarea.value.trim();
        if (!input) return;

        updateChat('right', input);
        
        const fileRefs = [];
        const fileContents = {};
        
        try {
            if (referencedFiles.size > 0) {
                referencedFiles.forEach((content, path) => {
                    if (path && content) {
                        const fileName = getFileName(path);
                        if (fileName && input.includes(`@${fileName}`)) {
                            fileRefs.push(path);
                            fileContents[path] = content;
                        }
                    }
                });
            }

            const message = {
                command: 'your-copilot.send',
                text: {
                    server: serverUrl,
                    message: input,
                    token: settings.token || '',
                    stream: Boolean(settings.stream),
                    fileRefs,
                    fileContents
                }
            };

            vscodeContext.postMessage(message);
            textarea.value = '';
            setReferencedFiles(new Map());
        } catch (error) {
            console.error('Error sending message:', error);
            updateChat('left', 'Error sending message. Please try again.');
        }
    };

    const toggleSettings = () => {
        setShowSettings(!showSettings);
    };

    const updateSettings = (newSettings) => {
        // Validate and format server URL
        let serverUrl = newSettings.server;
        try {
            // Add protocol if missing
            if (serverUrl && !serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                serverUrl = 'http://' + serverUrl;
                newSettings.server = serverUrl;
            }
            // Test if it's a valid URL
            if (serverUrl) {
                new URL(serverUrl);
            }
        } catch (error) {
            console.error('Invalid server URL:', error);
            updateChat('left', 'Warning: Invalid server URL format. Please include the protocol (http:// or https://)');
        }

        setSettings(newSettings);
        vscodeContext.setState(newSettings);
    };

    const clearConversation = () => {
        setMessages([]);
        if (textareaRef.current) {
            textareaRef.current.value = '';
        }
        setReferencedFiles(new Map());
    };

    return (
        <React.Fragment>
            <div className="chat-container">
                <div className="chat-wrapper-wrapper">
                    <div className="chat-wrapper" ref={chatWrapperRef}>
                        {messages.map((msg, index) => (
                            <ChatMessage key={index} {...msg} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="chat-type-container">
                <div className="chat-type-container-wrapper">
                    <ReferencedFiles 
                        files={referencedFiles} 
                        onRemove={(path) => {
                            if (textareaRef.current) {
                                const fileRef = `@${getFileName(path)}`;
                                textareaRef.current.value = textareaRef.current.value.replace(fileRef, '').trim();
                            }
                            setReferencedFiles(prev => {
                                const newMap = new Map(prev);
                                newMap.delete(path);
                                return newMap;
                            });
                        }}
                    />
                    <div className="textarea-container">
                        <textarea
                            ref={textareaRef}
                            onChange={() => setShowError(false)}
                            onKeyDown={handleKeyPress}
                            onInput={handleInput}
                        />
                        {fileList.length > 0 && (
                            <FileDropdown
                                files={fileList}
                                selectedIndex={selectedFileIndex}
                                onSelect={selectFile}
                            />
                        )}
                    </div>
                    <div className="button-container">
                        <button 
                            type="button" 
                            className="btn"
                            onClick={sendMessage}
                            onMouseEnter={() => setShowError(!settings.server)}
                            onMouseLeave={() => setShowError(false)}
                        >
                            Send
                        </button>
                        <button 
                            type="button" 
                            className="settings-btn" 
                            onClick={toggleSettings}
                            title="Settings"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9.1 4.4L8.6 2H7.4L6.9 4.4L6.2 4.6L4.2 3.2L3.2 4.2L4.6 6.2L4.4 6.9L2 7.4V8.6L4.4 9.1L4.6 9.8L3.2 11.8L4.2 12.8L6.2 11.4L6.9 11.6L7.4 14H8.6L9.1 11.6L9.8 11.4L11.8 12.8L12.8 11.8L11.4 9.8L11.6 9.1L14 8.6V7.4L11.6 6.9L11.4 6.2L12.8 4.2L11.8 3.2L9.8 4.6L9.1 4.4ZM8 10C6.9 10 6 9.1 6 8C6 6.9 6.9 6 8 6C9.1 6 10 6.9 10 8C10 9.1 9.1 10 8 10Z" />
                            </svg>
                        </button>
                        <button 
                            type="button" 
                            className="settings-btn"
                            onClick={clearConversation}
                            title="Clear Conversation"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 2C11.3 2 14 4.7 14 8C14 11.3 11.3 14 8 14C4.7 14 2 11.3 2 8C2 4.7 4.7 2 8 2ZM8 1C4.1 1 1 4.1 1 8C1 11.9 4.1 15 8 15C11.9 15 15 11.9 15 8C15 4.1 11.9 1 8 1ZM10.7 11.5L8 8.8L5.3 11.5L4.5 10.7L7.2 8L4.5 5.3L5.3 4.5L8 7.2L10.7 4.5L11.5 5.3L8.8 8L11.5 10.7L10.7 11.5Z" />
                            </svg>
                        </button>
                    </div>
                    {showError && (
                        <div className="error">
                            Please insert an IP Address in the configuration below.
                        </div>
                    )}
                </div>
            </div>

            {showSettings && (
                <SettingsDialog
                    settings={settings}
                    onClose={toggleSettings}
                    onChange={updateSettings}
                />
            )}
        </React.Fragment>
    );
};

const ChatMessage = ({ side, text, time }) => {
    const messageRef = React.useRef(null);

    React.useEffect(() => {
        if (messageRef.current) {
            const content = converter.makeHtml(text);
            messageRef.current.innerHTML = content;
            applyCodeHighlighting(messageRef.current);
        }
    }, [text]);

    return (
        <div className={`chat-message ${side === 'right' ? 'user-message' : 'assistant-message'}`}>
            <div className="message-content">
                <div className="message-header">
                    {side === 'right' ? (
                        <span className="avatar">You</span>
                    ) : (
                        <div className="avatar-container">
                            <span className="avatar-icon">🤖</span>
                            <span className="avatar">AI</span>
                        </div>
                    )}
                    <span className="message-time">
                        {time.toLocaleTimeString()}
                    </span>
                </div>
                <div className="message-body">
                    <div ref={messageRef} />
                </div>
            </div>
        </div>
    );
};

const ReferencedFiles = ({ files, onRemove }) => (
    <div className="referenced-files">
        {Array.from(files.entries()).map(([path]) => (
            <div key={path} className="file-chip" title={path}>
                <span>{getFileName(path)}</span>
                <button className="remove-file" onClick={() => onRemove(path)}>×</button>
            </div>
        ))}
    </div>
);

const FileDropdown = ({ files, selectedIndex, onSelect }) => (
    <div className="file-dropdown" style={{ display: 'block' }}>
        {files.length === 0 ? (
            <div className="file-item no-results">No files found</div>
        ) : (
            files.map((file, index) => (
                <div
                    key={file}
                    className={`file-item${index === selectedIndex ? ' selected' : ''}`}
                    onClick={() => onSelect(file)}
                >
                    {file}
                </div>
            ))
        )}
    </div>
);

const SettingsDialog = ({ settings, onClose, onChange }) => {
    const dialogRef = React.useRef(null);

    React.useEffect(() => {
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
        return () => {
            if (dialogRef.current && dialogRef.current.open) {
                dialogRef.current.close();
            }
        };
    }, []);

    const handleBackdropClick = (e) => {
        if (e.target === dialogRef.current) {
            onClose();
        }
    };

    const handleNumberInput = (e, field) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value)) {
            onChange({ ...settings, [field]: value });
        }
    };

    return (
        <dialog 
            ref={dialogRef} 
            className="settings-dialog" 
            onClick={handleBackdropClick}
        >
            <div className="settings-header">
                <h2>Settings</h2>
                <button className="close-btn" onClick={onClose}>×</button>
            </div>
            <div className="settings-content">
                <div className="settings-section">
                    <h3 className="settings-section-title">Server Configuration</h3>
                    <p>Insert your LLM server</p>
                    <p>You can use:</p>
                    <ul>
                        <li>LM Studio</li>
                        <li>Ollama</li>
                        <li>Vllm</li>
                        <li>Any other LLM server that supports the OpenAI API standard</li>
                    </ul>
                    <div className="input-control">
                        <label htmlFor="ipAddress">IP Address</label>
                        <input
                            type="text"
                            name="ipAddress"
                            id="ipAddress"
                            placeholder="http://localhost:1234"
                            className="input"
                            value={settings.server}
                            onChange={e => onChange({ ...settings, server: e.target.value })}
                        />
                    </div>

                    <div className="input-control">
                        <label htmlFor="token">API Token</label>
                        <input
                            type="password"
                            name="token"
                            id="token"
                            placeholder="Leave blank if you are using your own LLM server"
                            className="input"
                            value={settings.token}
                            onChange={e => onChange({ ...settings, token: e.target.value })}
                        />
                        <small>Only if you are using oficial OpenAI API</small>
                    </div>
                </div>

                <div className="settings-section">
                    <h3 className="settings-section-title">Model Parameters</h3>
                    <div className="input-control number-input">
                        <label htmlFor="max_tokens">Max Tokens</label>
                        <input
                            type="number"
                            name="max_tokens"
                            id="max_tokens"
                            min="1"
                            max="32000"
                            className="input"
                            value={settings.max_tokens}
                            onChange={e => handleNumberInput(e, 'max_tokens')}
                        />
                        <small>Maximum number of tokens to generate (default: 4096)</small>
                    </div>

                    <div className="input-control number-input">
                        <label htmlFor="temperature">Temperature</label>
                        <input
                            type="number"
                            name="temperature"
                            id="temperature"
                            min="0"
                            max="2"
                            step="0.1"
                            className="input"
                            value={settings.temperature}
                            onChange={e => handleNumberInput(e, 'temperature')}
                        />
                        <small>Controls randomness (0 = deterministic, 2 = maximum creativity, default: 0.7)</small>
                    </div>
                </div>

                <div className="settings-section">
                    <h3 className="settings-section-title">Response Options</h3>
                    <div className="input-control">
                        <label className="label-check">
                            <input
                                type="checkbox"
                                name="stream"
                                id="stream"
                                className="input-check"
                                checked={settings.stream}
                                onChange={e => onChange({ ...settings, stream: e.target.checked })}
                            />
                            Stream responses
                        </label>
                        <small>Enable real-time streaming of responses</small>
                    </div>
                </div>
            </div>
        </dialog>
    );
};

function getFileName(path) {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1] || '';
}

function applyCodeHighlighting(container) {
    const codeBlocks = container.querySelectorAll('pre code');
    codeBlocks.forEach(block => {
        let language = '';
        block.classList.forEach(className => {
            if (className.startsWith('language-')) {
                language = className.replace('language-', '');
            }
        });

        if (language && Prism.languages[language]) {
            block.innerHTML = Prism.highlight(
                block.textContent,
                Prism.languages[language],
                language
            );

            // Add code action buttons
            const pre = block.parentElement;
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'code-actions';

            // Copy button
            const copyButton = document.createElement('button');
            copyButton.className = 'code-action-btn';
            copyButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                    <path d="M4 2h8v2H4V2zM3 5h9v2H3V5zm0 3h7v2H3V8zm0 3h5v2H3v-2z"/>
                </svg>
                Copy
            `;
            copyButton.onclick = () => {
                navigator.clipboard.writeText(block.textContent);
                copyButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
                    </svg>
                    Copied!
                `;
                setTimeout(() => {
                    copyButton.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                            <path d="M4 2h8v2H4V2zM3 5h9v2H3V5zm0 3h7v2H3V8zm0 3h5v2H3v-2z"/>
                        </svg>
                        Copy
                    `;
                }, 2000);
            };

            // Apply diff button
            const applyButton = document.createElement('button');
            applyButton.className = 'code-action-btn';
            applyButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                    <path d="M13.5 3h-11a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5zm-11-1h11a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-11a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 2.5 2z"/>
                    <path d="M7.646 8.646a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 10.207V14.5a.5.5 0 0 1-1 0V10.207L6.354 11.354a.5.5 0 1 1-.708-.708l2-2z"/>
                </svg>
                Apply
            `;
            applyButton.onclick = () => {
                vscodeContext.postMessage({
                    command: 'your-copilot.apply-diff',
                    code: block.textContent,
                    language: language
                });
            };

            actionsContainer.appendChild(copyButton);
            actionsContainer.appendChild(applyButton);
            pre.appendChild(actionsContainer);
        }
    });
}

// Render the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />); 