/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';

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

    const consoleLogs: string[] = [];
    page.on('console', async (msg) => {
      try {
        const args = await Promise.all(
          msg.args().map((a) => a.jsonValue().catch(() => a.toString())),
        );
        const t = args
          .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
          .join(' ');
        consoleLogs.push(t);
        if (t.includes('[flyElement]') || t.includes('fly')) {
          console.log('BROWSER LOG:', t);
        }
      } catch {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto(
      'http://localhost:4173/?layout=portrait&ui=perchero&debug=1&hand=1&hand_sim=1',
    );
    await page.waitForTimeout(2000);

    // Set interactive mode
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      if (stores) {
        stores.useSizingStore.setState({ hasProfile: true });
        stores.useKioskStore.setState({ state: 'TRYON' });
      }
    });
    await page.waitForTimeout(500);

    // Inspect elements and overlay state
    const info = await page.evaluate(() => {
      const mirror = document.querySelector('[data-stage="mirror"]');
      const mRect = mirror?.getBoundingClientRect();
      const debugOverlay = document.querySelector('#debug-overlay');
      const dRect = debugOverlay?.getBoundingClientRect();
      const slots = Array.from(document.querySelectorAll('.rack-slot')).map((el, i) => {
        const r = el.getBoundingClientRect();
        const img = el.querySelector('.rack-garment');
        const imgR = img?.getBoundingClientRect();
        return {
          index: i,
          className: el.className,
          slotRect: { left: r.left, top: r.top, width: r.width, height: r.height },
          imgRect: imgR
            ? { left: imgR.left, top: imgR.top, width: imgR.width, height: imgR.height }
            : null,
        };
      });

      return {
        mirrorRect: mRect
          ? { left: mRect.left, top: mRect.top, width: mRect.width, height: mRect.height }
          : null,
        debugOverlayRect: dRect
          ? { left: dRect.left, top: dRect.top, width: dRect.width, height: dRect.height }
          : null,
        slots: slots.slice(0, 4),
      };
    });

    console.log('DOM Measurements:', JSON.stringify(info, null, 2));

    // Ensure debug overlay is expanded
    const toggleBtn = await page.$('#debug-overlay button');
    if (toggleBtn) {
      const btnText = await toggleBtn.textContent();
      console.log('Debug overlay toggle button text:', btnText);
      if (btnText && btnText.includes('Mostrar todo')) {
        console.log('Expanding debug overlay...');
        await toggleBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Now test clicking slot 0, then slot 1, then returning slot 1
    console.log('\n--- Clicking slot 0 (touch take) ---');
    await page.click('.rack-slot[data-rack-index="0"]', { force: true });
    await page.waitForTimeout(1500);

    console.log('\n--- Clicking slot 1 (touch take another garment) ---');
    await page.click('.rack-slot[data-rack-index="1"]', { force: true });
    await page.waitForTimeout(1500);

    console.log('\n--- Clicking slot 1 again (touch return garment) ---');
    await page.click('.rack-slot[data-rack-index="1"]', { force: true });
    await page.waitForTimeout(1500);

    console.log('\n--- Hand step to slot 2 ---');
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      stores.useHandCursorStore.setState({
        lastEvent: { type: 'step', index: 2, direction: 'right' },
      });
    });
    await page.waitForTimeout(1000);

    console.log('\n--- Hand step to slot 3 ---');
    await page.evaluate(() => {
      const stores = (window as any).__stores;
      stores.useHandCursorStore.setState({
        lastEvent: { type: 'step', index: 3, direction: 'right' },
      });
    });
    await page.waitForTimeout(1000);

    console.log('\nAll browser logs with [flyElement]:');
    consoleLogs
      .filter((l) => l.includes('fly') || l.includes('scale'))
      .forEach((l) => console.log('  ', l));
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch(console.error);
