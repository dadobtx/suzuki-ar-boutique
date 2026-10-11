/* eslint-disable @typescript-eslint/no-explicit-any, no-empty */
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('scripts/qa_output/vitrina_frames/after');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function waitUrl(url: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  console.log('Starting preview...');
  const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    shell: true,
    stdio: 'ignore',
  });

  const ready = await waitUrl('http://localhost:4173/');
  if (!ready) {
    console.error('Preview not reachable');
    preview.kill();
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });

    console.log('Navigating to ?layout=portrait...');
    await page.goto('http://localhost:4173/?layout=portrait');
    await page.waitForTimeout(2000);

    // Let's capture frames across slide transition (at t = 4500ms through t = 7500ms, ~10 fps)
    await page.waitForTimeout(2500);

    const frameData: any[] = [];
    for (let i = 0; i < 35; i++) {
      const frameInfo = await page.evaluate(() => {
        const backCard = document.querySelector(
          '[data-testid="showcase-back-card"]',
        ) as HTMLElement | null;
        const backImg = backCard?.querySelector('img') as HTMLImageElement | null;
        const mainIllust = document.querySelector(
          'img[alt*="(ilustración)"]',
        ) as HTMLImageElement | null;

        return {
          backCardPresent: !!backCard,
          backCardBg: backCard ? window.getComputedStyle(backCard).backgroundColor : null,
          backCardOpacity: backCard ? window.getComputedStyle(backCard).opacity : null,
          backImgSrc: backImg?.src ?? null,
          backImgComplete: backImg?.complete ?? null,
          backImgNaturalWidth: backImg?.naturalWidth ?? null,
          mainIllustComplete: mainIllust?.complete ?? null,
        };
      });

      const framePath = path.join(OUT_DIR, `frame_${String(i).padStart(2, '0')}.png`);
      await page.screenshot({ path: framePath });
      frameData.push({ frame: i, ...frameInfo });
      await new Promise((r) => setTimeout(r, 100)); // ~10 fps
    }

    console.log('Sample transition frames after fix:');
    frameData
      .filter((f) => f.backCardPresent)
      .slice(0, 10)
      .forEach((f) => console.log(JSON.stringify(f)));
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch(console.error);
