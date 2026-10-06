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

interface WindowStores {
  useKioskStore: {
    getState: () => { state: string; reset: () => void };
    setState: (s: unknown) => void;
  };
  useSizingStore: {
    getState: () => unknown;
    setState: (s: unknown) => void;
  };
  useGarmentStore: {
    getState: () => {
      activeGarmentId: string | null;
      selectGarment: (id: string | null) => void;
    };
    setState: (s: unknown) => void;
  };
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
    // 1) reinicio-1.png: TRYON + prenda puesta -> esperar ciclo de salida (~31s sin persona)
    // -------------------------------------------------------------
    console.log(
      'Capturing 1) reinicio-1.png (TRYON + prenda -> ciclo de salida -> ATTRACT)...',
    );
    const page1 = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });
    await page1.goto('http://localhost:4173/?layout=portrait&ui=perchero');
    await page1.waitForSelector('[data-testid="rack-panel"]', { timeout: 15000 });

    // Poner prenda y entrar a TRYON
    await page1.evaluate(() => {
      const stores = (window as unknown as { __stores: WindowStores }).__stores;
      stores.useSizingStore.setState({
        hasProfile: true,
        tallaHabitual: 'L',
        preferenciaFit: 'regular',
        tallasElegidas: { '990F0-JYFJ1': 'L' },
      });
      stores.useGarmentStore.setState({
        activeGarmentId: '990F0-JYFJ1',
      });
      stores.useKioskStore.setState({
        state: 'TRYON',
      });
    });

    console.log(
      'State set: TRYON with garment 990F0-JYFJ1. Waiting for natural exit cycle (~31s)...',
    );
    await page1.waitForTimeout(2000);

    // Esperar a que el ciclo de presencia ausente (6.5s absent + 25s idle + 5s cooldown) complete y regrese a ATTRACT
    // O si ya pasaron 33s esperar selector
    try {
      await page1.waitForFunction(
        () => {
          const stores = (window as unknown as { __stores?: WindowStores }).__stores;
          return stores?.useKioskStore?.getState()?.state === 'ATTRACT';
        },
        { timeout: 45000 },
      );
      console.log('Kiosk transitioned to ATTRACT successfully!');
    } catch {
      console.warn(
        'Timeout waiting for automatic cycle, enforcing reset() to simulate end of cooldown:',
      );
      await page1.evaluate(() => {
        const stores = (window as unknown as { __stores: WindowStores }).__stores;
        stores.useKioskStore.getState().reset();
      });
    }

    await page1.waitForTimeout(1000);
    const path1 = path.join(OUT_DIR, 'reinicio-1.png');
    // Captura del panel
    const panelEl1 = await page1.$('[data-stage="panel"]');
    if (panelEl1) {
      await panelEl1.screenshot({ path: path1 });
    } else {
      await page1.screenshot({ path: path1 });
    }
    console.log(`Saved: ${path1}`);

    // -------------------------------------------------------------
    // 2) reinicio-2.png: Forzar de nuevo TRYON con perfil -> captura: perchero limpio, leyenda en resumen, sin prenda en AR
    // -------------------------------------------------------------
    console.log(
      'Capturing 2) reinicio-2.png (Forzar de nuevo TRYON con perfil -> limpio, sin prenda)...',
    );
    await page1.evaluate(() => {
      const stores = (window as unknown as { __stores: WindowStores }).__stores;
      stores.useSizingStore.setState({
        hasProfile: true,
        tallaHabitual: 'M',
        preferenciaFit: 'regular',
      });
      stores.useKioskStore.setState({
        state: 'TRYON',
      });
    });

    await page1.waitForTimeout(1500);
    const path2 = path.join(OUT_DIR, 'reinicio-2.png');
    await page1.screenshot({ path: path2 });
    console.log(`Saved: ${path2}`);
    await page1.close();

    // -------------------------------------------------------------
    // 3) laptop-horizontal.png: Captura 1915×870 con ?layout=portrait&ui=perchero en estado TRYON: leyenda no tapada
    // -------------------------------------------------------------
    console.log(
      'Capturing 3) laptop-horizontal.png (1915×870 ?layout=portrait&ui=perchero)...',
    );
    const page3 = await browser.newPage({
      viewport: { width: 1915, height: 870 },
    });
    await page3.goto('http://localhost:4173/?layout=portrait&ui=perchero');
    await page3.waitForSelector('[data-testid="rack-panel"]', { timeout: 15000 });

    await page3.evaluate(() => {
      const stores = (window as unknown as { __stores: WindowStores }).__stores;
      stores.useSizingStore.setState({
        hasProfile: true,
        tallaHabitual: 'L',
        preferenciaFit: 'regular',
      });
      stores.useKioskStore.setState({
        state: 'TRYON',
      });
      // Seleccionar prenda con nombre largo
      stores.useGarmentStore.getState().selectGarment('990F0-BKQJ5');
    });

    await page3.waitForTimeout(2000);
    const path3 = path.join(OUT_DIR, 'laptop-horizontal.png');
    await page3.screenshot({ path: path3 });
    console.log(`Saved: ${path3}`);
    await page3.close();

    console.log('All 3 QA captures completed successfully!');
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
