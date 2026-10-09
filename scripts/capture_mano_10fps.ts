/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from '@playwright/test';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('scripts/qa_output/mano-activacion');
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

    console.log(
      'Navigating with ?layout=portrait&ui=perchero&debug=1&hand=1&hand_sim=1&hand_fps=10...',
    );
    await page.goto(
      'http://localhost:4173/?layout=portrait&ui=perchero&debug=1&hand=1&hand_sim=1&hand_fps=10',
    );

    await page.waitForSelector('video', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Setup interactive state and synthetic locked user
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      if (stores) {
        stores.useSizingStore.setState({ hasProfile: true });
        stores.useKioskStore.setState({ state: 'TRYON' });
        stores.useGarmentStore.setState({ activeGarmentId: null });
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
      lms[7] = { x: cx - 0.035, y: 0.28, z: 0, visibility: 0.95 }; // left ear
      lms[8] = { x: cx + 0.035, y: 0.28, z: 0, visibility: 0.95 }; // right ear
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

      // Keep alive loop
      setInterval(() => {
        (window as any).__landmarksOverride = lms;
        (window as any).__activeZoneOverride = mockActiveZone;
        (window as any).__presenceOverride = 'present';
        window.dispatchEvent(new CustomEvent('kiosk-landmarks'));
        window.dispatchEvent(new CustomEvent('kiosk-active-zone'));
        window.dispatchEvent(new CustomEvent('kiosk-presence'));
        const s = (window as any).__stores;
        if (s) {
          if (!s.useSizingStore.getState().hasProfile) {
            s.useSizingStore.setState({ hasProfile: true });
          }
          if (s.useKioskStore.getState().state !== 'TRYON') {
            s.useKioskStore.setState({ state: 'TRYON' });
          }
        }
      }, 100);
    });

    await page.waitForTimeout(1000);

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

    async function pollCondition(fn: () => boolean, timeoutMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const res = await page.evaluate(fn);
        if (res) return true;
        await page.waitForTimeout(100);
      }
      return false;
    }

    console.log(
      'Simulating hand at 10 fps to verify cursor activation and ring progression...',
    );
    // Move to slot 2 (x = 0.388, y = 0.45)
    await moveSim(0.388, 0.45);

    // Poll until cursor is active and dwell progress reaches ~30-60%
    const reached = await pollCondition(() => {
      const s = (window as any).__stores?.useHandCursorStore?.getState();
      return Boolean(s && s.cursor.active && s.cursor.dwellProgress >= 0.3);
    });

    if (reached) {
      console.log('Cursor is ACTIVE with dwell progress progressing at 10 fps!');
    } else {
      console.warn(
        'Timeout waiting for dwell progress, capturing current state anyway...',
      );
    }

    const stateInfo = await page.evaluate(() => {
      const s = (window as any).__stores?.useHandCursorStore?.getState();
      return {
        active: s?.cursor.active,
        dwell: s?.cursor.dwellProgress,
        fps: s?.inferenceFps,
        index: s?.cursor.index,
        p95: s?.p95,
      };
    });
    console.log('Hand cursor state at capture:', stateInfo);

    const shotPath = path.join(OUT_DIR, 'cursor-activo-10fps.png');
    await page.screenshot({ path: shotPath });
    console.log(`Saved screenshot: ${shotPath}`);
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
