import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('scripts/qa_output/vitrina');
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
  console.log('Starting vite preview on port 4173...');
  const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    shell: true,
    stdio: 'inherit',
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
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  try {
    // -------------------------------------------------------------
    // a) 1907×870 landscape, a los ~2.5 s de una diapositiva (BKTM1)
    // -------------------------------------------------------------
    console.log('Capturing a) 1907x870 landscape BKTM1 at ~2.5s...');
    const pageA = await browser.newPage({
      viewport: { width: 1907, height: 870 },
    });
    await pageA.goto('http://localhost:4173/?layout=landscape');
    await pageA.waitForSelector('text=Team Black T-Shirt', { timeout: 15000 });
    await pageA.waitForTimeout(2500);
    const pathA = path.join(OUT_DIR, 'a_1907x870_landscape_bktm1.png');
    await pageA.screenshot({ path: pathA });
    console.log(`Saved: ${pathA}`);
    await pageA.close();

    // -------------------------------------------------------------
    // b) 1080×1920 con ?layout=portrait, misma diapositiva (BKTM1)
    // -------------------------------------------------------------
    console.log('Capturing b) 1080x1920 portrait BKTM1 at ~2.5s...');
    const pageB = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });
    await pageB.goto('http://localhost:4173/?layout=portrait');
    await pageB.waitForSelector('text=Team Black T-Shirt', { timeout: 15000 });
    await pageB.waitForTimeout(2500);
    const pathB = path.join(OUT_DIR, 'b_1080x1920_portrait_bktm1.png');
    await pageB.screenshot({ path: pathB });
    console.log(`Saved: ${pathB}`);
    await pageB.close();

    // -------------------------------------------------------------
    // c) 1080×1920 portrait sobre 990F0-FCHJ0 (nombre largo)
    // -------------------------------------------------------------
    // Let's create a page in portrait and wait for the slide to rotate to FCHJ0 or BKQJ5 or summary.
    // Notice slides rotate: 0:BKTM1, 1:BKPM5, 2:BKHM0, 3:BKBW5, 4:BKQJ5, ... 9:FCHJ0, 10:summary
    console.log('Opening continuous portrait page to capture specific slides...');
    const pageStream = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });
    await pageStream.goto('http://localhost:4173/?layout=portrait');

    // d) Wait for 990F0-BKQJ5 (Team Black Reversible Jacket)
    console.log('Waiting for d) 990F0-BKQJ5 (Team Black Reversible Jacket)...');
    await pageStream.waitForSelector('text=Team Black Reversible Jacket', {
      timeout: 45000,
    });
    // Variant 1 (roja)
    await pageStream.waitForTimeout(800);
    const pathD1 = path.join(OUT_DIR, 'd_1080x1920_portrait_bkqj5_var1.png');
    await pageStream.screenshot({ path: pathD1 });
    console.log(`Saved: ${pathD1}`);
    // Wait for flip to variant 2 (negra, flips at 1.6s from slide mount, photo fades in 200ms)
    await pageStream.waitForTimeout(1400);
    const pathD2 = path.join(OUT_DIR, 'd_1080x1920_portrait_bkqj5_var2.png');
    await pageStream.screenshot({ path: pathD2 });
    console.log(`Saved: ${pathD2}`);
    // Also save d_1080x1920_portrait_bkqj5.png
    fs.copyFileSync(pathD2, path.join(OUT_DIR, 'd_1080x1920_portrait_bkqj5.png'));

    // c) Wait for 990F0-FCHJ0 (Functional Hooded Sweat Jacket)
    console.log('Waiting for c) 990F0-FCHJ0 (Functional Hooded Sweat Jacket)...');
    await pageStream.waitForSelector('text=Functional Hooded Sweat Jacket', {
      timeout: 45000,
    });
    await pageStream.waitForTimeout(1800);
    const pathC = path.join(OUT_DIR, 'c_1080x1920_portrait_fchj0.png');
    await pageStream.screenshot({ path: pathC });
    console.log(`Saved: ${pathC}`);

    // e) Wait for Summary Slide (10 PRENDAS · DESDE $35.29)
    console.log('Waiting for e) Summary slide (10 PRENDAS)...');
    await pageStream.waitForSelector('text=10 PRENDAS', { timeout: 60000 });
    await pageStream.waitForTimeout(1800);
    const pathE = path.join(OUT_DIR, 'e_1080x1920_portrait_summary.png');
    await pageStream.screenshot({ path: pathE });
    console.log(`Saved: ${pathE}`);

    await pageStream.close();
    console.log('All screenshots captured successfully!');
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
