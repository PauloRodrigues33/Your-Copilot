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
        case 'your-copilot.error':
            // Handle error if needed
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
    console.log('error getting state: ', e);
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
        fileChip.appendChild(fileName);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-file';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => removeFileReference(path);
        fileChip.appendChild(removeBtn);
        
        container.appendChild(fileChip);
    });
}

function removeFileReference(path) {
    referencedFiles.delete(path);
    updateReferencedFiles();
    
    // Update textarea content - handle the @ symbol properly
    const textarea = document.getElementById('in-text');
    const text = textarea.value;
    textarea.value = text.replace(`@${getFileName(path)}`, '').trim();
    validateInput(); // Ensure button state is updated
}

function sendMessage() {
    var message = document.getElementById('in-text').value;
    if (message.length == 0) return;

    // Process message to include file contents
    let finalMessage = message;
    referencedFiles.forEach((content, path) => {
        const fileRef = `@${getFileName(path)}`;
        if (!finalMessage.includes(fileRef)) {
            finalMessage = `${fileRef}\n${finalMessage}`;
        }
        finalMessage = finalMessage.replace(fileRef, `\nFile: ${path}\n\`\`\`\n${content}\n\`\`\`\n`);
    });

    updateHtmlChat('right', message); // Show original message in chat
    console.log('sendMessage');
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
    vscodeContext.setState({ 
        server: document.getElementById('ipAddress').value, 
        token: document.getElementById('token').value, 
        stream: document.getElementById('stream').checked 
    });
}

function updateHtmlChat(side, message, stream = false) {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (side == "left") {
        var chatElem = originalChat.cloneNode(true);
        if (!stream) {
            var n = document.getElementById('chat-wrapper').appendChild(chatElem);
            var html = converter.makeHtml(message || '');
            const messageBody = n.querySelector('.message-body');
            messageBody.innerHTML = html;
            
            // Apply syntax highlighting to code blocks
            messageBody.querySelectorAll('pre code').forEach((block) => {
                // Try to detect language from class
                const classes = block.className.split(' ');
                const languageClass = classes.find(c => c.startsWith('language-'));
                const language = languageClass ? languageClass.replace('language-', '') : '';
                
                // Add line numbers
                block.innerHTML = block.innerHTML.split('\\n').map((line, index) => 
                    `<span class="line-number">${index + 1}</span>${line}`
                ).join('\\n');
                
                // Apply Prism highlighting
                if (language && Prism.languages[language]) {
                    block.innerHTML = Prism.highlight(
                        block.textContent,
                        Prism.languages[language],
                        language
                    );
                }
                
                // Add copy button
                const pre = block.parentElement;
                const copyButton = document.createElement('button');
                copyButton.className = 'copy-button';
                copyButton.innerHTML = 'Copy';
                copyButton.onclick = () => {
                    navigator.clipboard.writeText(block.textContent);
                    copyButton.innerHTML = 'Copied!';
                    setTimeout(() => copyButton.innerHTML = 'Copy', 2000);
                };
                pre.appendChild(copyButton);
            });

            // Scroll to bottom
            n.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        else {
            if (!isStreaming) {
                chatElem = originalChat.cloneNode(true);
                chatElem.style.display = 'block';
                var chatElemDOM = document.getElementById('chat-wrapper').appendChild(chatElem);
                chatStreamingElement = chatElemDOM.querySelector('#message-element');
                chatStreamingElement.id = '#message-element' + message.id;
                chatStreamingElement.innerHTML = message?.choices[0]?.delta?.content || '';
                isStreaming = true;
                console.log('streaming started');

                // Scroll to bottom
                chatElemDOM.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
            else {
                if (message.finish_reason != null) {
                    isStreaming = false;
                    chatStreamingElement = null;
                    console.log('streaming finished');
                }
                else {
                    var currentChat = document.getElementById('#message-element' + message.id);
                    if (currentChat) {
                        var msg = message?.choices[0]?.delta?.content || '';
                        if (message?.choices[0]?.finish_reason != null) {
                            if (converter) {
                                const renderedContent = converter.makeHtml(currentChat.innerHTML);
                                currentChat.innerHTML = renderedContent;
                                // Apply syntax highlighting to code blocks
                                currentChat.querySelectorAll('pre code').forEach((block) => {
                                    const classes = block.className.split(' ');
                                    const languageClass = classes.find(c => c.startsWith('language-'));
                                    const language = languageClass ? languageClass.replace('language-', '') : '';
                                    
                                    if (language && Prism.languages[language]) {
                                        block.innerHTML = Prism.highlight(
                                            block.textContent,
                                            Prism.languages[language],
                                            language
                                        );
                                    }
                                });
                            }
                            isStreaming = false;
                            chatStreamingElement = null;
                            console.log('streaming finished inside');
                        }
                        else {
                            currentChat.innerHTML = currentChat.innerHTML + msg;
                        }
                    }
                }
            }
        }
        chatElem.querySelector('.message-time').textContent = timeString;
    }
    if (side == "right") {
        var chatElem = document.getElementById('chat-right').cloneNode(true);
        var n = document.getElementById('chat-wrapper').appendChild(chatElem);
        n.querySelector('#message-element').textContent = message;
        n.querySelector('.message-time').textContent = timeString;
        
        // Scroll to bottom
        n.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
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