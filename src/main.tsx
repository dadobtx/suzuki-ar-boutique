import './debug-init';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import App from './App';
import { cleanupNonKioskServiceWorker } from './lib/pwa-update';

if (typeof window !== 'undefined') {
  const isKiosk = new URLSearchParams(window.location.search).get('kiosk') === '1';
  if (!isKiosk) {
    cleanupNonKioskServiceWorker();
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
