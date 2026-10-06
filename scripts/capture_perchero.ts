import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('scripts/qa_output/perchero');
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
    // a) clasico-portrait.png (1080×1920 ?layout=portrait)
    // -------------------------------------------------------------
    console.log('Capturing a) clasico-portrait.png...');
    const pageA = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });
    await pageA.goto('http://localhost:4173/?layout=portrait');
    await pageA.waitForSelector('[data-testid="panel-attract"]', { timeout: 15000 });
    await pageA.waitForTimeout(2000);
    const pathA = path.join(OUT_DIR, 'clasico-portrait.png');
    await pageA.screenshot({ path: pathA });
    console.log(`Saved: ${pathA}`);
    await pageA.close();

    // -------------------------------------------------------------
    // b) perchero-attract.png (1080×1920 ?layout=portrait&ui=perchero, ATTRACT)
    // -------------------------------------------------------------
    console.log('Capturing b) perchero-attract.png...');
    const pageB = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });
    await pageB.goto('http://localhost:4173/?layout=portrait&ui=perchero');
    await pageB.waitForSelector('[data-testid="rack-panel"][data-mode="attract"]', {
      timeout: 15000,
    });
    await pageB.waitForTimeout(2000);
    const pathB = path.join(OUT_DIR, 'perchero-attract.png');
    await pageB.screenshot({ path: pathB });
    console.log(`Saved: ${pathB}`);
    await pageB.close();

    // -------------------------------------------------------------
    // c) perchero-abierta.png (1080×1920 interactive con una prenda abierta)
    // -------------------------------------------------------------
    console.log('Capturing c) perchero-abierta.png...');
    const pageC = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });
    await pageC.goto('http://localhost:4173/?layout=portrait&ui=perchero');
    await pageC.waitForSelector('[data-testid="rack-panel"]', { timeout: 15000 });
    // Establecer estado interactivo
    await pageC.evaluate(() => {
      const stores = (
        window as unknown as {
          __stores?: {
            useSizingStore: { setState: (s: unknown) => void };
            useKioskStore: { setState: (s: unknown) => void };
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
    await pageC.waitForTimeout(600);
    // Abrir la prenda con teclado (ArrowRight)
    await pageC.keyboard.press('ArrowRight');
    await pageC.keyboard.press('ArrowRight');
    await pageC.waitForTimeout(1000);
    const pathC = path.join(OUT_DIR, 'perchero-abierta.png');
    await pageC.screenshot({ path: pathC });
    console.log(`Saved: ${pathC}`);
    await pageC.close();

    // -------------------------------------------------------------
    // d) perchero-seleccionada.png (mismo, interactivo con prenda seleccionada)
    // -------------------------------------------------------------
    console.log('Capturing d) perchero-seleccionada.png...');
    const pageD = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });
    await pageD.goto('http://localhost:4173/?layout=portrait&ui=perchero');
    await pageD.waitForSelector('[data-testid="rack-panel"]', { timeout: 15000 });
    await pageD.evaluate(() => {
      const stores = (
        window as unknown as {
          __stores?: {
            useSizingStore: { setState: (s: unknown) => void };
            useKioskStore: { setState: (s: unknown) => void };
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
    await pageD.waitForTimeout(600);
    // Navegar hasta la prenda 4 (Team Black Reversible Jacket) y presionar Enter
    for (let i = 0; i < 4; i++) {
      await pageD.keyboard.press('ArrowRight');
    }
    await pageD.keyboard.press('Enter');
    // Esperar a que concluya el vuelo y la selección
    await pageD.waitForTimeout(1600);
    const pathD = path.join(OUT_DIR, 'perchero-seleccionada.png');
    await pageD.screenshot({ path: pathD });
    console.log(`Saved: ${pathD}`);
    await pageD.close();

    // -------------------------------------------------------------
    // e) perchero-landscape.png (1907×870 ?ui=perchero -> debe caer a clásica)
    // -------------------------------------------------------------
    console.log('Capturing e) perchero-landscape.png...');
    const pageE = await browser.newPage({
      viewport: { width: 1907, height: 870 },
    });
    await pageE.goto('http://localhost:4173/?ui=perchero');
    // En landscape, la interfaz efectiva es "clasica", así que debe mostrar AttractPanel
    await pageE.waitForSelector('[data-testid="panel-attract"]', { timeout: 15000 });
    await pageE.waitForTimeout(2000);
    const pathE = path.join(OUT_DIR, 'perchero-landscape.png');
    await pageE.screenshot({ path: pathE });
    console.log(`Saved: ${pathE}`);
    await pageE.close();

    console.log('All perchero screenshots captured successfully!');
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
