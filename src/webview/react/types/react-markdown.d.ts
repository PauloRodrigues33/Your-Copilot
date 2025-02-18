declare module 'react-markdown' {
  import { ReactNode } from 'react';
  
  interface ReactMarkdownProps {
    children: string;
    components?: {
      [key: string]: React.ComponentType<any>;
    };
  }
  
  const ReactMarkdown: React.FC<ReactMarkdownProps>;
  export default ReactMarkdown;
}

declare module 'react-markdown/lib/ast-to-react' {
  export interface CodeProps {
    inline?: boolean;
    className?: string;
    children: React.ReactNode;
  }
  export type CodeComponent = React.ComponentType<CodeProps>;
} 