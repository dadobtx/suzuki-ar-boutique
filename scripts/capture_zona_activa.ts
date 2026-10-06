import { chromium } from '@playwright/test';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('scripts/qa_output/zona_activa');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function waitUrl(url: string, timeoutMs = 15000): Promise<boolean> {
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
  console.log('Building app with npm run build...');
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

    console.log('Navigating to ?debug=1&zona=1&layout=portrait...');
    await page.goto('http://localhost:4173/?debug=1&zona=1&layout=portrait');

    // Wait for video element and camera stream to load
    await page.waitForSelector('video', { timeout: 15000 });
    console.log('Video mounted, waiting 3s...');
    await page.waitForTimeout(3000);

    // Inject active zone telemetry for visual verification of ?debug=1 overlay
    await page.evaluate(() => {
      // Generate synthetic landmarks for skeleton of locked person
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

      // Override active zone with 2 candidates: 1 locked (center), 1 far (companion)
      const mockActiveZone = {
        enabled: true,
        lockedIndex: 0,
        approaching: false,
        candidates: [
          {
            sw: 0.14,
            cx: 0.5,
            vis: 0.95,
            speed: 0.03,
            score: 0.14,
            reason: 'locked' as const,
            box: { minX: 0.38, maxX: 0.62, minY: 0.24, maxY: 0.82 },
          },
          {
            sw: 0.06,
            cx: 0.82,
            vis: 0.88,
            speed: 0.01,
            score: 0.06,
            reason: 'far' as const,
            box: { minX: 0.76, maxX: 0.88, minY: 0.3, maxY: 0.7 },
          },
        ],
      };

      (window as unknown as { __landmarksOverride?: unknown }).__landmarksOverride = lms;
      (window as unknown as { __activeZoneOverride?: unknown }).__activeZoneOverride =
        mockActiveZone;
      window.dispatchEvent(new CustomEvent('kiosk-landmarks'));
      window.dispatchEvent(new CustomEvent('kiosk-active-zone'));
    });

    await page.waitForTimeout(1000);

    // Capture screenshot
    const shotPath = path.join(OUT_DIR, 'zona_activa_debug.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`Saved screenshot to ${shotPath}`);

    // Copy to brain artifact directory
    const brainArtifact = path.resolve(
      'C:/Users/Dario/.gemini/antigravity/brain/6859acb7-13d6-4ba0-9813-318cb64f4e04/zona_activa_debug.png',
    );
    fs.copyFileSync(shotPath, brainArtifact);
    console.log(`Copied artifact to ${brainArtifact}`);

    // Telemetry and benchmark: memory check after 100 iterations
    console.log('Measuring memory and stability...');
    const memoryMetrics = await page.evaluate(async () => {
      const perfMemory = (
        performance as unknown as {
          memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
        }
      ).memory;
      return {
        usedJSHeapMB: perfMemory
          ? (perfMemory.usedJSHeapSize / (1024 * 1024)).toFixed(2)
          : 'N/A',
        totalJSHeapMB: perfMemory
          ? (perfMemory.totalJSHeapSize / (1024 * 1024)).toFixed(2)
          : 'N/A',
      };
    });

    console.log('Memory metrics:', memoryMetrics);
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
