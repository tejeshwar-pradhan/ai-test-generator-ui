import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';

const CodeBlock = ({ codeString, language }) => (
  <SyntaxHighlighter language={language} style={docco}>
    {codeString}
  </SyntaxHighlighter>
);
export default CodeBlock;