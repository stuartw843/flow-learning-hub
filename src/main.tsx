import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FlowProvider } from '@speechmatics/flow-client-react';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FlowProvider appId={import.meta.env.VITE_SPEECHMATICS_FLOW_APP_ID}>
      <App />
    </FlowProvider>
  </StrictMode>
);
