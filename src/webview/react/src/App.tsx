import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { VSCodeProvider } from './context/VSCodeContext';
import Chat from './components/Chat';
import Settings from './components/Settings';
import FileReference from './components/FileReference';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

const App: React.FC = () => {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <VSCodeProvider>
        <div className="app-container">
          <Settings />
          <FileReference />
          <Chat />
        </div>
      </VSCodeProvider>
    </ThemeProvider>
  );
};

export default App; 