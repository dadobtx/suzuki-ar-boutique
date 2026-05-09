import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { useAppStore } from './store/app';
import { HomePage } from './pages/HomePage';
import { DiagPage } from './pages/DiagPage';

export default function App() {
  const { setLayout, setKiosk, setPro } = useAppStore();

  // Read URL flags on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get('layout') === 'portrait') {
      setLayout('portrait');
    }

    if (params.get('kiosk') === '1') {
      setKiosk(true);
      document.body.classList.add('kiosk-mode');

      // Block context menu, selection, zoom
      const prevent = (e: Event) => e.preventDefault();
      document.addEventListener('contextmenu', prevent);
      document.addEventListener('selectstart', prevent);

      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=')) {
          e.preventDefault();
        }
      });

      // Auto-recovery
      const reload = () => {
        document.body.innerHTML = `
          <div style="
            display:flex;align-items:center;justify-content:center;
            height:100vh;background:#07080F;color:#00E5FF;
            font-family:JetBrains Mono,monospace;font-size:2rem;
          ">REINICIANDO…</div>
        `;
        setTimeout(() => location.reload(), 3000);
      };
      window.onerror = () => {
        reload();
        return true;
      };
      window.onunhandledrejection = () => reload();
    }

    if (params.get('pro') === '1') {
      setPro(true);
    }
  }, [setLayout, setKiosk, setPro]);

  return (
    <HashRouter>
      <div className="min-h-screen bg-bg text-fg">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/diag" element={<DiagPage />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
