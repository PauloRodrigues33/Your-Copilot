import React, { useState, useEffect, useRef } from 'react';
import { Box, TextField, IconButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import DeleteIcon from '@mui/icons-material/Delete';
import { useVSCode } from '../context/VSCodeContext';
import Message from './Message';
import FileReference from './FileReference';

interface ChatMessage {
  id: string;
  side: 'left' | 'right';
  content: string;
  timestamp: string;
}

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { postMessage, getState } = useVSCode();

  const addMessage = (side: 'left' | 'right', content: string) => {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      side,
      content,
      timestamp: timeString
    }]);
  };

  const updateLastMessage = (contentUpdater: (prevContent: string) => string) => {
    setMessages(prev => {
      const messages = [...prev];
      const lastMessage = messages[messages.length - 1];
      // Only update if it's a system message (left side)
      if (lastMessage && lastMessage.side === 'left') {
        messages[messages.length - 1] = {
          ...lastMessage,
          content: contentUpdater(lastMessage.content)
        };
        return messages;
      }
      // If last message is not from system, create a new system message
      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return [...messages, {
        id: Date.now().toString(),
        side: 'left',
        content: contentUpdater(''),
        timestamp: timeString
      }];
    });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.command) {
        case 'your-copilot.receive':
          addMessage('left', message.text);
          break;
        case 'your-copilot.receive-stream':
          const content = message.text.choices[0].delta.content || '';
    
          if (message.text.isFirstChunk) {
            addMessage('left', content);
          } else if (message.text.finish_reason === 'stop') {
            // Stream finished
          } else if (content) {
            updateLastMessage(prev => prev + content);
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [addMessage, updateLastMessage]);

  const handleSend = () => {
    if (!inputMessage.trim()) return;

    addMessage('right', inputMessage);

    postMessage({
      command: 'your-copilot.send',
      text: {
        server: getState()?.server || '',
        message: inputMessage,
        token: getState()?.token || '',
        stream: getState()?.stream || false
      }
    });

    setInputMessage('');
  };

  const handleClearChat = () => {
    setMessages([]);
    postMessage({
      command: 'your-copilot.clear-conversation'
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', p: 2 }}>
      <Box sx={{ flexGrow: 1, overflow: 'auto', mb: 2 }}>
        {messages.map((msg) => (
          <Message key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </Box>
      
      <Box sx={{ position: 'relative' }}>
        <FileReference />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton
            color="error"
            onClick={handleClearChat}
            sx={{ alignSelf: 'center' }}
          >
            <DeleteIcon />
          </IconButton>
          
          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                // Check if the file list is open
                const fileList = document.querySelector('[role="listbox"]');
                if (fileList) {
                  // Let the FileReference component handle the Enter key
                  return;
                }
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your message..."
            variant="outlined"
            size="small"
          />
          
          <IconButton
            color="primary"
            onClick={handleSend}
            disabled={!inputMessage.trim()}
            sx={{ alignSelf: 'center' }}
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};

export default Chat; 