var vscodeContext = acquireVsCodeApi();
console.log('Main script loaded');

var converter = new showdown.Converter();
converter.setFlavor('github');

// Add message event listener
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'your-copilot.receive':
            updateHtmlChat('left', message.text);
            break;
        case 'your-copilot.receive-stream':
            updateHtmlChat('left', message.text, true);
            break;
        case 'your-copilot.file-list':
            showFileDropdown(message.files);
            break;
        case 'your-copilot.file-content':
            referencedFiles.set(message.text, message.content);
            updateReferencedFiles();
            break;
        case 'your-copilot.active-file':
            handleActiveFileChange(message.text, message.content);
            break;
        case 'your-copilot.error':
            console.error('Error:', message.text);
            break;
    }
});

try {
    //get the state if exists:
    var state = vscodeContext.getState();
    if (state) {
        document.getElementById('ipAddress').value = state.server;
        document.getElementById('token').value = state.token;
        document.getElementById('stream').checked = state.stream;
    }
}
catch (e) {
    console.error('Error getting state:', e);
}

function toggleOnBtnHover() {
    if (!configurationValidated()) {
        document.getElementById('error').style.display = 'block';
    }
    else {
        document.getElementById('error').style.display = 'none';
    }
}

function configurationValidated() {
    var ipAddress = document.getElementById('ipAddress').value;
    if (ipAddress.length > 0) {
        return true;
    } else {
        return false;
    }
}

function validateInput() {
    var input = document.getElementById('in-text').value;
    if (input.length > 0) {
        document.getElementById('btn').disabled = false;
    } else {
        document.getElementById('btn').disabled = true;
    }
}

var lastAtPosition = -1;
var selectedFileIndex = -1;
var fileList = [];
var referencedFiles = new Map(); // Map to store file references: path -> content
var isStreaming = false;
var chatStreamingElement = null;
var originalChat = document.getElementById('chat');

function handleInput(event) {
    const textarea = event.target;
    const text = textarea.value;
    const cursorPosition = textarea.selectionStart;
    
    // Find the last @ before the cursor
    const beforeCursor = text.substring(0, cursorPosition);
    const afterCursor = text.substring(cursorPosition);
    
    // Find the word being typed after the last @
    const lastAtIndex = beforeCursor.lastIndexOf('@');
    if (lastAtIndex === -1) {
        hideFileDropdown();
        return;
    }

    // Get the text between the last @ and the cursor
    const currentWord = beforeCursor.slice(lastAtIndex + 1);
    
    // Check if we're actually in a file reference context
    // If there's a space or newline in the current word, we're not
    if (/[\s\n]/.test(currentWord)) {
        hideFileDropdown();
        return;
    }

    // Only search if we have at least one character after @
    if (currentWord.length > 0) {
        lastAtPosition = lastAtIndex;
        vscodeContext.postMessage({
            command: 'your-copilot.search-files',
            text: currentWord
        });
    } else {
        hideFileDropdown();
    }
}

function handleKeyPress(event) {
    const dropdown = document.getElementById('file-dropdown');
    
    if (dropdown.style.display === 'block') {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                selectedFileIndex = Math.min(selectedFileIndex + 1, fileList.length - 1);
                updateFileSelection();
                break;
            case 'ArrowUp':
                event.preventDefault();
                selectedFileIndex = Math.max(selectedFileIndex - 1, 0);
                updateFileSelection();
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
                hideFileDropdown();
                break;
        }
    } else if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (document.getElementById('in-text').value.trim() && configurationValidated()) {
            sendMessage();
        }
    }
}

function updateFileSelection() {
    const items = document.querySelectorAll('.file-item');
    items.forEach((item, index) => {
        if (index === selectedFileIndex) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function showFileDropdown(files) {
    const dropdown = document.getElementById('file-dropdown');
    fileList = files;
    selectedFileIndex = files.length > 0 ? 0 : -1;
    
    dropdown.innerHTML = '';
    if (files.length === 0) {
        const item = document.createElement('div');
        item.className = 'file-item no-results';
        item.textContent = 'No files found';
        dropdown.appendChild(item);
    } else {
        files.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-item' + (index === 0 ? ' selected' : '');
            item.textContent = file;
            item.onclick = () => selectFile(file);
            dropdown.appendChild(item);
        });
    }
    
    dropdown.style.display = 'block';
}

function hideFileDropdown() {
    const dropdown = document.getElementById('file-dropdown');
    dropdown.style.display = 'none';
    lastAtPosition = -1;
    selectedFileIndex = -1;
    fileList = [];
}

function selectFile(file) {
    const textarea = document.getElementById('in-text');
    const text = textarea.value;
    
    // Get the text before and after the current file reference
    const beforeAt = text.substring(0, lastAtPosition);
    const afterCursor = text.substring(textarea.selectionStart);
    
    // Request file content
    vscodeContext.postMessage({
        command: 'your-copilot.get-file-content',
        text: file
    });
    
    // Update textarea with file reference and add a space
    const fileName = getFileName(file);
    textarea.value = beforeAt + '@' + fileName + ' ' + afterCursor;
    
    // Move cursor after the file reference and space
    const newCursorPosition = lastAtPosition + fileName.length + 2;
    textarea.setSelectionRange(newCursorPosition, newCursorPosition);
    
    hideFileDropdown();
    textarea.focus();
}

function getFileName(path) {
    return path.split('/').pop();
}

function updateReferencedFiles() {
    const container = document.getElementById('referenced-files');
    container.innerHTML = '';
    
    referencedFiles.forEach((content, path) => {
        const fileChip = document.createElement('div');
        fileChip.className = 'file-chip';
        fileChip.title = path; // Show full path on hover
        
        const fileName = document.createElement('span');
        fileName.textContent = getFileName(path);
        
        const removeButton = document.createElement('button');
        removeButton.className = 'remove-file';
        removeButton.textContent = '×';
        removeButton.onclick = () => {
            // Remove reference from textarea
            const textarea = document.getElementById('in-text');
            const fileRef = `@${getFileName(path)}`;
            textarea.value = textarea.value.replace(fileRef, '').trim();
            
            // Remove from map and update UI
            referencedFiles.delete(path);
            updateReferencedFiles();
            validateInput();
        };
        
        fileChip.appendChild(fileName);
        fileChip.appendChild(removeButton);
        container.appendChild(fileChip);
    });
    
    // Update container visibility
    container.style.display = referencedFiles.size > 0 ? 'flex' : 'none';
}

function addFileReference(filePath, content) {
    if (!filePath || !content) {
        console.log('Invalid file data:', { filePath, hasContent: !!content });
        return false;
    }

    const fileRef = `@${getFileName(filePath)}`;
    
    // Check if file is already referenced
    if (referencedFiles.has(filePath)) {
        console.log('File already referenced:', filePath);
        return false;
    }

    // Add to references map
    referencedFiles.set(filePath, content);
    console.log('Added file reference:', { filePath, fileRef });
    
    return true;
}

function insertFileReferenceIntoTextarea(fileRef) {
    const textarea = document.getElementById('in-text');
    const currentText = textarea.value;
    const cursorPosition = textarea.selectionStart;
    
    // Add newlines only if needed
    const beforeCursor = currentText.substring(0, cursorPosition);
    const afterCursor = currentText.substring(cursorPosition);
    const prefix = beforeCursor.length > 0 && !beforeCursor.endsWith('\n') ? '\n' : '';
    const suffix = afterCursor.length > 0 && !afterCursor.startsWith('\n') ? '\n' : '';
    
    textarea.value = beforeCursor + prefix + fileRef + suffix + afterCursor;
    validateInput();
}

function handleActiveFileChange(filePath, content) {
    if (!filePath || !content) {
        console.log('Invalid file data:', { filePath, hasContent: !!content });
        return;
    }
    
    console.log('Processing active file:', {
        filePath,
        hasContent: !!content,
        currentReferences: Array.from(referencedFiles.keys())
    });
    
    const fileRef = `@${getFileName(filePath)}`;
    const textarea = document.getElementById('in-text');
    
    // Only add if the file isn't already referenced and the reference isn't in the textarea
    if (!textarea.value.includes(fileRef) && addFileReference(filePath, content)) {
        insertFileReferenceIntoTextarea(fileRef);
        updateReferencedFiles();
    }
}

function sendMessage() {
    var message = document.getElementById('in-text').value;
    if (message.length == 0) return;

    // Process message to include file contents
    let finalMessage = message;
    let hasFileReferences = false;

    // Create an array of file references to process them in order
    const fileRefs = [];
    referencedFiles.forEach((content, path) => {
        const fileRef = `@${getFileName(path)}`;
        if (finalMessage.includes(fileRef)) {
            fileRefs.push({ ref: fileRef, path, content });
            hasFileReferences = true;
        }
    });

    // Process each file reference
    fileRefs.forEach(({ ref, path, content }) => {
        finalMessage = finalMessage.replace(ref, `\nFile: ${path}\n\`\`\`\n${content}\n\`\`\`\n`);
    });

    // Show original message in chat (without file contents)
    updateHtmlChat('right', message);

    // Ensure the chat elements are visible
    document.getElementById('chat').style.display = 'block';
    document.getElementById('chat-right').style.display = 'block';

    vscodeContext.postMessage({
        command: 'your-copilot.send',
        text: { 
            server: document.getElementById('ipAddress').value, 
            message: finalMessage, 
            token: document.getElementById('token').value, 
            stream: document.getElementById('stream').checked 
        }
    });

    // reset the input and references
    document.getElementById('in-text').value = "";
    referencedFiles.clear();
    updateReferencedFiles();
    validateInput(); // Update button state
    
    vscodeContext.setState({ 
        server: document.getElementById('ipAddress').value, 
        token: document.getElementById('token').value, 
        stream: document.getElementById('stream').checked 
    });
}

function updateHtmlChat(side, message, stream = false) {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (side === "left") {
        let chatElem = originalChat.cloneNode(true);
        chatElem.style.display = 'block';
        chatElem.id = 'chat-' + Date.now(); // Ensure unique ID
        
        if (!stream) {
            console.log('Processing non-stream message');
            const chatWrapper = document.getElementById('chat-wrapper');
            const newMessage = chatWrapper.appendChild(chatElem);
            
            try {
                const html = converter.makeHtml(message || '');
                const messageBody = newMessage.querySelector('.message-body');
                if (messageBody) {
                    messageBody.innerHTML = html;
                    applyCodeHighlighting(messageBody);
                } else {
                    console.error('Message body element not found');
                }
            } catch (error) {
                console.error('Error converting message to HTML:', error);
                const messageBody = newMessage.querySelector('.message-body');
                if (messageBody) {
                    messageBody.textContent = message || '';
                }
            }
            
            newMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
            if (!isStreaming) {
                console.log('Starting new stream');
                const chatWrapper = document.getElementById('chat-wrapper');
                const newMessage = chatWrapper.appendChild(chatElem);
                const messageBody = newMessage.querySelector('.message-body');
                
                if (messageBody) {
                    const renderedContainer = document.createElement('div');
                    renderedContainer.id = 'rendered-content-' + message.id;
                    messageBody.innerHTML = '';
                    messageBody.appendChild(renderedContainer);
                    
                    if (!window.streamingState) {
                        window.streamingState = new Map();
                    }
                    
                    window.streamingState.set(message.id, {
                        rawContent: '',
                        codeBlocks: [],
                        inCodeBlock: false,
                        codeBlockLang: '',
                        codeBlockContent: '',
                        inBackticks: false,
                        backtickCount: 0
                    });
                    
                    const content = message?.choices[0]?.delta?.content || '';
                    updateStreamingContent(message.id, content);
                    isStreaming = true;
                    
                    newMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });
                } else {
                    console.error('Message body element not found for streaming message');
                }
            } else {
                if (message.finish_reason != null) {
                    console.log('Stream finished');
                    const state = window.streamingState.get(message.id);
                    if (state && state.inCodeBlock) {
                        state.rawContent += '```';
                        updateStreamingContent(message.id, '');
                    }
                    
                    isStreaming = false;
                    chatStreamingElement = null;
                    window.streamingState.delete(message.id);
                } else {
                    const content = message?.choices[0]?.delta?.content || '';
                    if (content) {
                        updateStreamingContent(message.id, content);
                    }
                }
            }
        }
        
        const timeElement = chatElem.querySelector('.message-time');
        if (timeElement) {
            timeElement.textContent = timeString;
        }
    } else if (side === "right") {
        let chatElem = document.getElementById('chat-right').cloneNode(true);
        chatElem.style.display = 'block';
        chatElem.id = 'chat-right-' + Date.now(); // Ensure unique ID
        
        const chatWrapper = document.getElementById('chat-wrapper');
        const newMessage = chatWrapper.appendChild(chatElem);
        
        const messageBody = newMessage.querySelector('.message-body');
        if (messageBody) {
            messageBody.innerHTML = `<p id="message-element">${message}</p>`;
        }
        
        const timeElement = newMessage.querySelector('.message-time');
        if (timeElement) {
            timeElement.textContent = timeString;
        }
        
        newMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
}

function updateStreamingContent(messageId, newContent) {
    const state = window.streamingState.get(messageId);
    if (!state) return;

    // Update raw content
    state.rawContent += newContent;
    
    // Process the content
    for (const char of newContent) {
        if (state.inCodeBlock) {
            if (char === '`') {
                state.backtickCount++;
                if (state.backtickCount === 3) {
                    state.inCodeBlock = false;
                    state.backtickCount = 0;
                    state.codeBlocks.push({
                        language: state.codeBlockLang,
                        content: state.codeBlockContent
                    });
                    state.codeBlockLang = '';
                    state.codeBlockContent = '';
                }
            } else {
                state.backtickCount = 0;
                if (state.codeBlockLang === '' && char !== '\n') {
                    state.codeBlockLang += char;
                } else if (char === '\n' && state.codeBlockLang !== '') {
                    state.codeBlockContent += char;
                } else {
                    state.codeBlockContent += char;
                }
            }
        } else {
            if (char === '`') {
                state.backtickCount++;
                if (state.backtickCount === 3) {
                    state.inCodeBlock = true;
                    state.backtickCount = 0;
                }
            } else {
                state.backtickCount = 0;
            }
        }
    }

    // Try to convert the content to HTML
    try {
        let htmlContent = converter.makeHtml(state.rawContent);
        
        // If we're in the middle of a code block, append the current incomplete block
        if (state.inCodeBlock) {
            htmlContent += `<pre><code class="language-${state.codeBlockLang}">${state.codeBlockContent}</code></pre>`;
        }

        const renderedContainer = document.getElementById('rendered-content-' + messageId);
        if (renderedContainer) {
            renderedContainer.innerHTML = htmlContent;
            
            // Apply syntax highlighting to all code blocks
            applyCodeHighlighting(renderedContainer);
        }
    } catch (error) {
        console.error('Error converting markdown:', error);
        // In case of error, just show the raw content
        const renderedContainer = document.getElementById('rendered-content-' + messageId);
        if (renderedContainer) {
            renderedContainer.textContent = state.rawContent;
        }
    }
}

function applyCodeHighlighting(container) {
    container.querySelectorAll('pre code').forEach((block) => {
        try {
            // Try to detect language from class
            const classes = block.className.split(' ');
            const languageClass = classes.find(c => c.startsWith('language-'));
            const language = languageClass ? languageClass.replace('language-', '') : '';
            
            // Get the code content
            const content = block.textContent;
            
            // Create line numbers and code content
            const lines = content.split('\n');
            const codeLines = lines.map((line, index) => {
                const lineNumber = document.createElement('span');
                lineNumber.className = 'line-number';
                lineNumber.textContent = (index + 1).toString();
                
                const codeLine = document.createElement('span');
                codeLine.className = 'line';
                codeLine.textContent = line;
                
                const wrapper = document.createElement('div');
                wrapper.className = 'code-line';
                wrapper.appendChild(lineNumber);
                wrapper.appendChild(codeLine);
                
                return wrapper.outerHTML;
            }).join('');
            
            block.innerHTML = codeLines;
            
            // Apply Prism highlighting if language is supported
            if (language && Prism.languages[language]) {
                const highlightedCode = Prism.highlight(
                    content,
                    Prism.languages[language],
                    language
                );
                
                // Replace the code content while preserving line numbers
                block.querySelectorAll('.line').forEach((line, index) => {
                    const highlightedLine = highlightedCode.split('\n')[index] || '';
                    line.innerHTML = highlightedLine;
                });
            }
            
            // Add copy button to the pre element
            const pre = block.parentElement;
            if (pre && !pre.querySelector('.copy-button')) {
                const copyButton = document.createElement('button');
                copyButton.className = 'copy-button';
                copyButton.innerHTML = 'Copy';
                copyButton.onclick = () => {
                    navigator.clipboard.writeText(content);
                    copyButton.innerHTML = 'Copied!';
                    setTimeout(() => copyButton.innerHTML = 'Copy', 2000);
                };
                pre.appendChild(copyButton);
            }
        } catch (error) {
            console.error('Error applying code highlighting:', error);
        }
    });
}

function toggleSettings() {
    const dialog = document.getElementById('settings-dialog');
    if (dialog.open) {
        dialog.close();
    } else {
        dialog.showModal();
    }
}

// Add event listener for ESC key to close dialog
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const dialog = document.getElementById('settings-dialog');
        if (dialog.open) {
            dialog.close();
        }
    }
});

// Save settings when dialog is closed
document.getElementById('settings-dialog').addEventListener('close', () => {
    if (configurationValidated()) {
        vscodeContext.setState({ 
            server: document.getElementById('ipAddress').value, 
            token: document.getElementById('token').value, 
            stream: document.getElementById('stream').checked 
        });
    }
});

function clearConversation() {
    // Clear the chat wrapper
    const chatWrapper = document.getElementById('chat-wrapper');
    chatWrapper.innerHTML = `<div class="chat-message user-message" id="chat-right">
                <div class="message-content">
                    <div class="message-header">
                        <span class="avatar">You</span>
                        <span class="message-time"></span>
                    </div>
                    <div class="message-body">
                        <p id="message-element">Hi Copilot!</p>
                    </div>
                </div>
            </div>
            <div class="chat-message assistant-message" id="chat">
                <div class="message-content">
                    <div class="message-header">
                        <div class="avatar-container">
                            <span class="avatar-icon">🤖</span>
                            <span class="avatar">AI</span>
                        </div>
                        <span class="message-time"></span>
                    </div>
                    <div class="message-body">
                        <p id="message-element">Hi, I'm Your Copilot</p>
                    </div>
                </div>
            </div>`;
    
    // Clear referenced files
    referencedFiles.clear();
    updateReferencedFiles();
    
    // Clear the input
    document.getElementById('in-text').value = '';
    validateInput();
    
    // Notify the extension to clear message history
    vscodeContext.postMessage({
        command: 'your-copilot.clear-conversation'
    });
} 