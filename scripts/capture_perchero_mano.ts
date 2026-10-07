/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from '@playwright/test';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('scripts/qa_output/perchero-mano');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function waitUrl(url: string, timeoutMs = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  console.log('Rebuilding app with npm run build...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('Starting vite preview on port 4173...');
  const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    shell: true,
    stdio: 'ignore',
  });

  const ready = await waitUrl('http://localhost:4173/');
  if (!ready) {
    console.error('Failed to reach vite preview on http://localhost:4173/');
    preview.kill();
    process.exit(1);
  }
  console.log('Vite preview is ready at http://localhost:4173/');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--enable-precise-memory-info',
    ],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
      deviceScaleFactor: 1,
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[DEBUG]') || text.includes('Cursor')) {
        console.log('BROWSER:', text);
      }
    });

    console.log(
      'Navigating to ?layout=portrait&ui=perchero&debug=1&hand=1&hand_sim=1...',
    );
    await page.goto(
      'http://localhost:4173/?layout=portrait&ui=perchero&debug=1&hand=1&hand_sim=1',
    );

    await page.waitForSelector('video', { timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log(
      'Stores keys:',
      await page.evaluate(() => Object.keys((window as any).__stores || {})),
    );

    // Subscribe to track what deactivates cursor
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      if (stores) {
        stores.useHandCursorStore.subscribe((state: any, prev: any) => {
          if (prev.cursor.active && !state.cursor.active) {
            console.warn('[DEBUG] Cursor deactivated! Call stack:\n', new Error().stack);
          }
        });
      }
    });

    // Setup interactive state and synthetic locked user
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      if (stores) {
        stores.useSizingStore.setState({ hasProfile: true });
        stores.useKioskStore.setState({ state: 'TRYON' });
      }

      // Generate synthetic landmarks for locked person
      const lms: Array<{ x: number; y: number; z: number; visibility: number }> = [];
      const cx = 0.5;
      const cy = 0.45;
      const sw = 0.14;
      for (let i = 0; i < 33; i++) {
        lms.push({ x: cx, y: cy, z: 0, visibility: 0.95 });
      }
      lms[0] = { x: cx, y: 0.28, z: 0, visibility: 0.95 }; // nose
      lms[11] = { x: cx - sw / 2, y: 0.38, z: 0, visibility: 0.95 }; // left shoulder
      lms[12] = { x: cx + sw / 2, y: 0.38, z: 0, visibility: 0.95 }; // right shoulder
      lms[13] = { x: cx - sw / 2 - 0.04, y: 0.5, z: 0, visibility: 0.95 }; // left elbow
      lms[14] = { x: cx + sw / 2 + 0.04, y: 0.5, z: 0, visibility: 0.95 }; // right elbow
      lms[15] = { x: cx - sw / 2 - 0.06, y: 0.62, z: 0, visibility: 0.95 }; // left wrist
      lms[16] = { x: cx + sw / 2 + 0.06, y: 0.62, z: 0, visibility: 0.95 }; // right wrist
      lms[23] = { x: cx - sw / 2.5, y: 0.68, z: 0, visibility: 0.95 }; // left hip
      lms[24] = { x: cx + sw / 2.5, y: 0.68, z: 0, visibility: 0.95 }; // right hip

      const mockActiveZone = {
        enabled: true,
        lockedIndex: 0,
        approaching: false,
        candidates: [
          {
            sw: 0.14,
            cx: 0.5,
            vis: 0.95,
            speed: 0.02,
            score: 0.14,
            reason: 'locked' as const,
            box: { minX: 0.38, maxX: 0.62, minY: 0.24, maxY: 0.82 },
          },
        ],
      };

      (window as any).__landmarksOverride = lms;
      (window as any).__activeZoneOverride = mockActiveZone;
      (window as any).__presenceOverride = 'present';
      window.dispatchEvent(new CustomEvent('kiosk-landmarks'));
      window.dispatchEvent(new CustomEvent('kiosk-active-zone'));
      window.dispatchEvent(new CustomEvent('kiosk-presence'));
    });

    await page.waitForTimeout(1000);

    // Click "▲ Ocultar" button in DiagnosticOverlay so guide banner is visible
    const hideBtn = await page.$('button:has-text("▲ Ocultar")');
    if (hideBtn) {
      await hideBtn.click();
      console.log('Diagnostic overlay collapsed.');
    }

    // Helper to simulate mouse movement over mirror cell
    const moveSim = async (x: number, y: number) => {
      await page.evaluate(
        ({ x, y }) => {
          window.dispatchEvent(
            new CustomEvent('kiosk-hand-sim-move', { detail: { x, y } }),
          );
        },
        { x, y },
      );
    };

    const leaveSim = async () => {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('kiosk-hand-sim-leave'));
      });
    };

    // -------------------------------------------------------------
    // d) sin-mano.png: mouse fuera del espejo: sin cursor, indicación "LEVANTA LA MANO…"
    // -------------------------------------------------------------
    console.log('Capturing d) sin-mano.png...');
    await leaveSim();
    await page.waitForTimeout(600);
    const pathD = path.join(OUT_DIR, 'sin-mano.png');
    await page.screenshot({ path: pathD });
    console.log(`Saved: ${pathD}`);

    async function pollCondition(fn: () => boolean, timeoutMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const res = await page.evaluate(fn);
        if (res) return true;
        await page.waitForTimeout(100);
      }
      return false;
    }

    // -------------------------------------------------------------
    // a) cursor-activo.png: cursor sobre una prenda, anillo al ~50 %
    // -------------------------------------------------------------
    console.log('Capturing a) cursor-activo.png...');
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      if (stores) stores.useGarmentStore.setState({ activeGarmentId: null });
    });
    // Move to slot 2 (x = 0.388, y = 0.45)
    await moveSim(0.388, 0.45);
    await pollCondition(() => {
      const s = (window as any).__stores?.useHandCursorStore?.getState();
      return s && s.cursor.active && s.cursor.dwellProgress >= 0.35;
    });
    const pathA = path.join(OUT_DIR, 'cursor-activo.png');
    await page.screenshot({ path: pathA });
    console.log(`Saved: ${pathA}`);

    // -------------------------------------------------------------
    // b) tomada.png: después de 1.2 s: prenda volando o puesta, gancho vacío
    // -------------------------------------------------------------
    console.log('Capturing b) tomada.png...');
    // Wait until dwell completes and garment is selected
    await pollCondition(() => {
      const s = (window as any).__stores?.useGarmentStore?.getState();
      return s && s.activeGarmentId !== null;
    });
    // Allow animation to settle
    await page.waitForTimeout(600);
    const pathB = path.join(OUT_DIR, 'tomada.png');
    await page.screenshot({ path: pathB });
    console.log(`Saved: ${pathB}`);

    // -------------------------------------------------------------
    // c) devolver.png: cursor sobre el gancho vacío, anillo al ~50 %, indicación "MANTÉN LA MANO QUIETA PARA DEVOLVERLA"
    // -------------------------------------------------------------
    console.log('Capturing c) devolver.png...');
    // Wait for RackPanel busy timeout to clear
    await pollCondition(() => {
      const s = (window as any).__stores?.useHandCursorStore?.getState();
      return s && !s.isBusy;
    });
    await leaveSim();
    await page.waitForTimeout(400);
    await moveSim(0.388, 0.45);
    await pollCondition(() => {
      const s = (window as any).__stores?.useHandCursorStore?.getState();
      return s && s.cursor.active && s.cursor.dwellProgress >= 0.35;
    });
    const pathC = path.join(OUT_DIR, 'devolver.png');
    await page.screenshot({ path: pathC });
    console.log(`Saved: ${pathC}`);

    // Also copy captures to brain artifacts directory for easy inspection
    const brainDir =
      'C:/Users/Dario/.gemini/antigravity/brain/6859acb7-13d6-4ba0-9813-318cb64f4e04';
    fs.copyFileSync(pathA, path.join(brainDir, 'cursor-activo.png'));
    fs.copyFileSync(pathB, path.join(brainDir, 'tomada.png'));
    fs.copyFileSync(pathC, path.join(brainDir, 'devolver.png'));
    fs.copyFileSync(pathD, path.join(brainDir, 'sin-mano.png'));
    console.log('All captures copied to brain directory.');

    // Expand DiagnosticOverlay to read telemetry
    const showBtn = await page.$('button:has-text("▼ Mostrar")');
    if (showBtn) {
      await showBtn.click();
      await page.waitForTimeout(500);
    }
    console.log('Checking telemetry in DiagnosticOverlay...');
    const telemetry = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="diagnostic-overlay"]');
      return panel ? panel.textContent : document.body.innerText;
    });
    console.log('Telemetry preview:\n', telemetry?.slice(0, 1000));
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
