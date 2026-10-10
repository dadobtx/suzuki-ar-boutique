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
    // 1) 1080×1920 portrait: BKTM1 (tarjeta con espalda)
    console.log('Capturing 1) BKTM1 con tarjeta de espalda...');
    const page1 = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });
    await page1.goto('http://localhost:4173/?layout=portrait');
    await page1.waitForSelector('text=Team Black T-Shirt', { timeout: 15000 });
    // Esperar a que la tarjeta de espalda monte y anime (delay 0.55s)
    await page1.waitForSelector('[data-testid="showcase-back-card"]', { timeout: 10000 });
    await page1.waitForTimeout(2000);
    const path1 = path.join(OUT_DIR, '1_bktm1_tarjeta_espalda.png');
    await page1.screenshot({ path: path1 });
    console.log(`Saved: ${path1}`);

    // 2) 1080×1920 portrait: BKBW5 (sin tarjeta)
    console.log('Capturing 2) BKBW5 sin tarjeta...');
    // Esperar a que la vitrina rote a BKBW5 (Team Black Vest)
    await page1.waitForSelector('text=Team Black Vest', { timeout: 40000 });
    await page1.waitForTimeout(2000);
    const path2 = path.join(OUT_DIR, '2_bkbw5_sin_tarjeta.png');
    await page1.screenshot({ path: path2 });
    console.log(`Saved: ${path2}`);
    await page1.close();

    // 3) 1080×1920 portrait: Catálogo mostrando Fleece Jacket y Functional Hooded Sweat Jacket lado a lado
    console.log(
      'Capturing 3) Catálogo Fleece Jacket y Functional Hooded Sweat Jacket lado a lado...',
    );
    const page3 = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });
    await page3.goto('http://localhost:4173/?layout=portrait');
    await page3.waitForSelector('[data-testid="panel-attract"]', { timeout: 15000 });

    // Activar modo interactivo / catálogo en el store
    await page3.evaluate(() => {
      const stores = (
        window as unknown as {
          __stores?: {
            useSizingStore: { setState: (s: unknown) => void };
            useKioskStore: { setState: (s: unknown) => void };
            useGarmentStore: { setState: (s: unknown) => void };
          };
        }
      ).__stores;
      if (stores) {
        stores.useSizingStore.setState({
          hasProfile: true,
          tallaHabitual: 'M',
          tallasElegidas: {},
        });
        stores.useKioskStore.setState({ state: 'TRYON' });
      }
    });

    // Esperar a que aparezcan las tarjetas del catálogo
    await page3.waitForSelector('text=FUNCTIONAL HOODED SWEAT JACKET', {
      timeout: 15000,
    });
    await page3.waitForTimeout(1000);

    // En portrait, el catálogo es un contenedor horizontal flex con scroll.
    // Scroll hacia el final para que aparezcan FLEECE JACKET y FUNCTIONAL HOODED SWEAT JACKET
    await page3.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[role="article"]'));
      const targetCard = cards.find((c) =>
        c.textContent?.toUpperCase().includes('FUNCTIONAL HOODED'),
      );
      if (targetCard) {
        targetCard.scrollIntoView({
          inline: 'end',
          block: 'nearest',
          behavior: 'instant',
        });
      }
    });
    await page3.waitForTimeout(1000);

    const path3 = path.join(OUT_DIR, '3_catalogo_fleece_y_functional_hooded.png');
    await page3.screenshot({ path: path3 });
    console.log(`Saved: ${path3}`);
    await page3.close();

    console.log('All 3 screenshots captured successfully!');
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
