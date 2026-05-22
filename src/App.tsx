import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { useAppStore } from './store/app';
import { HomePage } from './pages/HomePage';
import { DiagPage } from './pages/DiagPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { useKioskFlag } from './hooks/useKioskFlag';
import { setupAutoRecovery } from './lib/auto-recovery';

// Setup auto recovery before React renders if possible, or here.
setupAutoRecovery();

export default function App() {
  const { setPro } = useAppStore();
  useKioskFlag();

  // Read URL flags on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pro') === '1') {
      setPro(true);
    }
  }, [setPro]);

  return (
    <HashRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <div className="min-h-screen bg-bg text-fg overflow-hidden relative">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/diag" element={<DiagPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
