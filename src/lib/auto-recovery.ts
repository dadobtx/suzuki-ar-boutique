export function setupAutoRecovery() {
  const isKiosk = new URLSearchParams(window.location.search).get('kiosk') === '1';
  if (!isKiosk) return;

  const MAX_CRASHES = 3;
  const CRASH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  const checkCrashLoop = (): boolean => {
    try {
      const now = Date.now();
      const historyStr = sessionStorage.getItem('kiosk-crash-history');
      let history: number[] = historyStr ? JSON.parse(historyStr) : [];

      // Filter out old crashes
      history = history.filter((time) => now - time < CRASH_WINDOW_MS);
      history.push(now);

      sessionStorage.setItem('kiosk-crash-history', JSON.stringify(history));

      if (history.length > MAX_CRASHES) {
        return true; // Crash loop detected
      }
    } catch {
      // Ignore sessionStorage errors
    }
    return false;
  };

  const triggerRecovery = (reason: string) => {
    console.error(`[Auto-Recovery] Triggered by: ${reason}`);

    if (checkCrashLoop()) {
      // Show permanent error screen
      document.body.innerHTML = `
        <div style="
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          height:100vh;background:#07080F;color:#E60012;
          font-family:'Bebas Neue',sans-serif;text-align:center;
        ">
          <h1 style="font-size:6rem;margin-bottom:1rem;">SISTEMA EN MANTENIMIENTO</h1>
          <p style="font-family:monospace;font-size:1.5rem;color:#888;">Demasiados errores consecutivos.</p>
        </div>
      `;
      return;
    }

    // Normal recovery splash
    document.body.innerHTML = `
      <div style="
        display:flex;align-items:center;justify-content:center;
        height:100vh;background:#E60012;color:white;
        font-family:'Bebas Neue',sans-serif;font-size:5rem;letter-spacing:0.1em;
      ">REINICIANDO...</div>
    `;
    setTimeout(() => location.reload(), 3000);
  };

  window.addEventListener('error', (e) => {
    triggerRecovery(`Uncaught Error: ${e.message}`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    triggerRecovery(`Unhandled Rejection: ${e.reason}`);
  });
}
