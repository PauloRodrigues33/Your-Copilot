import React, { useState, useEffect } from 'react';
import {
  Box,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  Popper,
  ClickAwayListener
} from '@mui/material';
import { useVSCode } from '../context/VSCodeContext';

interface FileReferenceMap {
  [path: string]: {
    content: string;
    isFromTabChange: boolean;
  };
}

const FileReference: React.FC = () => {
  const [referencedFiles, setReferencedFiles] = useState<FileReferenceMap>({});
  const [fileList, setFileList] = useState<string[]>([]);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const { postMessage } = useVSCode();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.command) {
        case 'your-copilot.file-list':
          setFileList(message.files);
          break;
        case 'your-copilot.file-content':
          addFileReference(message.text, message.content);
          break;
        case 'your-copilot.active-file':
          handleActiveFileChange(message.text, message.content);
          break;
        case 'your-copilot.get-referenced-files':
          // Send back all referenced files with their content
          postMessage({
            command: 'your-copilot.referenced-files',
            files: Object.fromEntries(
              Object.entries(referencedFiles).map(([path, data]) => [path, data.content])
            )
          });
          break;
      }
    };

    // Listen for @ key and input events in the chat input
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        if (event.key === '@') {
          // Don't prevent default to allow @ to appear
          setAnchorEl(target);
          setSearchQuery('');
          postMessage({
            command: 'your-copilot.search-files',
            text: ''
          });
        } else if (anchorEl && event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          const filteredFiles = fileList.filter(file => 
            !searchQuery || 
            file.toLowerCase().includes(searchQuery.toLowerCase()) ||
            getFileName(file).toLowerCase().includes(searchQuery.toLowerCase())
          );
          if (filteredFiles.length > 0) {
            selectFile(filteredFiles[0]);
          }
        } else if (anchorEl) {
          // Update search query when typing after @
          const input = target as HTMLInputElement | HTMLTextAreaElement;
          const value = input.value;
          const atIndex = value.lastIndexOf('@');
          if (atIndex !== -1) {
            const query = value.slice(atIndex + 1);
            setSearchQuery(query);
            postMessage({
              command: 'your-copilot.search-files',
              text: query
            });
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [postMessage, anchorEl, fileList, searchQuery, referencedFiles]);

  const handleActiveFileChange = (filePath: string, content: string) => {
    if (!filePath || !content) return;

    const newReferencedFiles = { ...referencedFiles };
    
    // Remove previous tab-referenced file
    Object.entries(newReferencedFiles).forEach(([path, file]) => {
      if (file.isFromTabChange) {
        delete newReferencedFiles[path];
      }
    });

    // Add new file reference
    newReferencedFiles[filePath] = {
      content,
      isFromTabChange: true
    };

    setReferencedFiles(newReferencedFiles);
  };

  const addFileReference = (filePath: string, content: string) => {
    setReferencedFiles(prev => ({
      ...prev,
      [filePath]: {
        content,
        isFromTabChange: false
      }
    }));
  };

  const removeFileReference = (filePath: string) => {
    const newReferencedFiles = { ...referencedFiles };
    delete newReferencedFiles[filePath];
    setReferencedFiles(newReferencedFiles);

    // Notify that references have changed
    postMessage({
      command: 'your-copilot.referenced-files',
      files: Object.fromEntries(
        Object.entries(newReferencedFiles).map(([path, data]) => [path, data.content])
      )
    });
  };

  const selectFile = (filePath: string) => {
    postMessage({
      command: 'your-copilot.get-file-content',
      text: filePath
    });
    closeFileList();
  };

  const closeFileList = () => {
    setAnchorEl(null);
    setSelectedIndex(0);
    setFileList([]);
  };

  const getFileName = (path: string) => path.split('/').pop() || path;

  return (
    <Box sx={{ 
      position: 'absolute', 
      bottom: '100%', 
      left: 0, 
      right: 0,
      mb: 1 
    }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {Object.entries(referencedFiles).map(([path, file]) => (
          <Chip
            key={path}
            label={getFileName(path)}
            onDelete={() => removeFileReference(path)}
            color={file.isFromTabChange ? 'primary' : 'default'}
            sx={{ borderRadius: 1 }}
          />
        ))}
      </Box>

      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="top-start"
        style={{ zIndex: 1300 }}
      >
        <ClickAwayListener onClickAway={closeFileList}>
          <Paper elevation={3}>
            <List
              role="listbox"
              sx={{
                width: 300,
                maxHeight: 200,
                overflow: 'auto'
              }}
            >
              {fileList.length === 0 ? (
                <ListItem>
                  <ListItemText primary={searchQuery ? `No files found matching '${searchQuery}'` : 'No files found'} />
                </ListItem>
              ) : (
                fileList
                  .filter(file => !searchQuery || 
                    file.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    getFileName(file).toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((file, index) => (
                    <ListItem
                      key={file}
                      role="option"
                      selected={index === selectedIndex}
                      onClick={() => selectFile(file)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <ListItemText 
                        primary={getFileName(file)}
                        secondary={file}
                      />
                    </ListItem>
                  ))
              )}
            </List>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </Box>
  );
};

export default FileReference; 