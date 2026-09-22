import { initDebugLogger } from './lib/debug-logger';

// Initialize early diagnostic capture (strictly no-op unless ?debug=1)
initDebugLogger();

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
