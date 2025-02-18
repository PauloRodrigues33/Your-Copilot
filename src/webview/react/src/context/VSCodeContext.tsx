import React, { createContext, useContext, useCallback, ReactNode } from 'react';

declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

interface VSCodeContextType {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
}

let vscodeApi: VSCodeContextType | undefined;

const getVSCodeApi = () => {
  if (!vscodeApi) {
    vscodeApi = window.acquireVsCodeApi();
  }
  return vscodeApi;
};

const VSCodeContext = createContext<VSCodeContextType>({
  postMessage: () => {},
  getState: () => ({}),
  setState: () => {},
});

export const VSCodeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const vscode = getVSCodeApi();

  const postMessage = useCallback((message: any) => {
    vscode.postMessage(message);
  }, []);

  const getState = useCallback(() => {
    return vscode.getState();
  }, []);

  const setState = useCallback((state: any) => {
    vscode.setState(state);
  }, []);

  return (
    <VSCodeContext.Provider value={{ postMessage, getState, setState }}>
      {children}
    </VSCodeContext.Provider>
  );
};

export const useVSCode = () => {
  const context = useContext(VSCodeContext);
  if (!context) {
    throw new Error('useVSCode must be used within a VSCodeProvider');
  }
  return context;
}; 