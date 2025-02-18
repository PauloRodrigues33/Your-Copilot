import React from 'react';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useVSCode } from '../context/VSCodeContext';
import { CodeProps } from 'react-markdown/lib/ast-to-react';

interface MessageProps {
  message: {
    side: 'left' | 'right';
    content: string;
    timestamp: string;
  };
}

const Message: React.FC<MessageProps> = ({ message }) => {
  const { postMessage } = useVSCode();

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const handleApplyCode = (code: string) => {
    postMessage({
      command: 'your-copilot.apply-code',
      code
    });
  };

  const CodeBlock = ({ language, value }: { language: string, value: string }) => (
    <Box sx={{ position: 'relative' }}>
      <Box sx={{ position: 'absolute', right: 1, top: 1, zIndex: 1 }}>
        <IconButton
          size="small"
          onClick={() => handleCopyCode(value)}
          sx={{ color: 'grey.500', '&:hover': { color: 'primary.main' } }}
        >
          <ContentCopyIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => handleApplyCode(value)}
          sx={{ color: 'grey.500', '&:hover': { color: 'primary.main' } }}
        >
          <PlayArrowIcon fontSize="small" />
        </IconButton>
      </Box>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{ margin: 0 }}
      >
        {value}
      </SyntaxHighlighter>
    </Box>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: message.side === 'right' ? 'flex-end' : 'flex-start',
        mb: 2
      }}
    >
      <Paper
        elevation={1}
        sx={{
          maxWidth: '70%',
          p: 2,
          backgroundColor: message.side === 'right' ? 'primary.dark' : 'background.paper'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {message.side === 'right' ? 'You' : 'AI'} • {message.timestamp}
          </Typography>
        </Box>
        
        <ReactMarkdown
          components={{
            code: ({ inline, className, children }: CodeProps) => {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
                <CodeBlock
                  language={match[1]}
                  value={String(children).replace(/\n$/, '')}
                />
              ) : (
                <code className={className}>
                  {children}
                </code>
              );
            }
          }}
        >
          {message.content}
        </ReactMarkdown>
      </Paper>
    </Box>
  );
};

export default Message; 