import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('scripts/qa_output');
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

interface CardMeasurement {
  sku: string;
  name: string;
  hasBack: boolean;
  imageHeight: number;
  cardHeight: number;
  priceBottom: number;
  cardBottom: number;
  priceVisible: boolean;
  bottomMargin: number;
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
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
    });

    await page.goto('http://localhost:4173/?layout=portrait');
    await page.waitForSelector('[data-testid="panel-attract"]', { timeout: 15000 });

    // Cambiar a modo interactivo para mostrar el catálogo
    await page.evaluate(() => {
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

    // Esperar a que se rendericen las 10 tarjetas del catálogo
    await page.waitForSelector('[role="article"]', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const cards = await page.$$('[role="article"]');
    console.log(`Encontradas ${cards.length} tarjetas en el catálogo.`);

    if (cards.length !== 10) {
      throw new Error(`Se esperaban 10 tarjetas, pero se encontraron ${cards.length}.`);
    }

    const measurements: CardMeasurement[] = [];

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const sku = (await card.getAttribute('data-sku')) || `item-${i}`;

      const titleEl = await card.$('.font-display');
      const name = (await titleEl?.innerText()) || 'Desconocido';

      // Botón o detector de back view
      const flipBtn = await card.$('button:has-text("ATRÁS"), button:has-text("BACK")');
      const hasBack = Boolean(flipBtn);

      const cardBox = await card.boundingBox();
      if (!cardBox) throw new Error(`No se pudo obtener boundingBox para tarjeta ${sku}`);

      // Área de imagen (.bg-white)
      const imgArea = await card.$('.bg-white');
      if (!imgArea) throw new Error(`No se encontró .bg-white en tarjeta ${sku}`);
      const imgBox = await imgArea.boundingBox();
      if (!imgBox)
        throw new Error(`No se pudo obtener boundingBox para área de imagen en ${sku}`);

      // Contenedor de precio (busca div que contenga "$")
      const priceEl = await card.$('div.font-mono.text-lg, div:has-text("$")');
      if (!priceEl) throw new Error(`No se encontró precio en tarjeta ${sku}`);
      const priceBox = await priceEl.boundingBox();
      if (!priceBox)
        throw new Error(`No se pudo obtener boundingBox para precio en ${sku}`);

      const priceBottom = priceBox.y + priceBox.height;
      const cardBottom = cardBox.y + cardBox.height;
      const bottomMargin = cardBottom - priceBottom;
      const priceVisible = bottomMargin >= -0.5; // Tolerancia de subpíxel 0.5px

      measurements.push({
        sku,
        name: name.replace(/\n/g, ' '),
        hasBack,
        imageHeight: imgBox.height,
        cardHeight: cardBox.height,
        priceBottom,
        cardBottom,
        priceVisible,
        bottomMargin,
      });
    }

    // Imprimir tabla de resultados
    console.log(
      '\n========================================================================================',
    );
    console.log('MEDICIONES DE TARJETAS DEL CATÁLOGO (1080×1920 PORTRAIT)');
    console.log(
      '========================================================================================',
    );
    console.log(
      '| SKU         | Prenda                                    | Vista Posterior | Alto Imagen | Precio Visible | Margen Inf (px) |',
    );
    console.log(
      '|-------------|-------------------------------------------|-----------------|-------------|----------------|-----------------|',
    );

    measurements.forEach((m) => {
      const skuPad = m.sku.padEnd(11);
      const namePad = m.name.padEnd(41).slice(0, 41);
      const backPad = (m.hasBack ? 'SÍ' : 'NO').padEnd(15);
      const imgHPad = `${m.imageHeight.toFixed(2)} px`.padEnd(11);
      const visPad = (m.priceVisible ? 'SÍ (OK)' : 'NO (CORTADO)').padEnd(14);
      const marginPad = `${m.bottomMargin.toFixed(2)} px`.padStart(15);
      console.log(
        `| ${skuPad} | ${namePad} | ${backPad} | ${imgHPad} | ${visPad} | ${marginPad} |`,
      );
    });
    console.log(
      '========================================================================================\n',
    );

    // Comprobar uniformidad de alto de imagen
    const heights = measurements.map((m) => m.imageHeight);
    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);
    const heightDiff = maxHeight - minHeight;

    console.log(`Alto mínimo de imagen: ${minHeight.toFixed(2)} px`);
    console.log(`Alto máximo de imagen: ${maxHeight.toFixed(2)} px`);
    console.log(`Diferencia máxima entre tarjetas: ${heightDiff.toFixed(2)} px`);

    const cutPrices = measurements.filter((m) => !m.priceVisible);
    if (cutPrices.length > 0) {
      console.error(
        `FALLO: ${cutPrices.length} tarjeta(s) tienen el precio cortado:`,
        cutPrices.map((c) => c.sku),
      );
    }

    if (heightDiff > 1.0) {
      console.error(
        `FALLO: La diferencia de alto de imagen (${heightDiff.toFixed(2)} px) supera el umbral de 1 px.`,
      );
    }

    // -------------------------------------------------------------
    // CAPTURA 1: VEST (990F0-BKBW5) junto a HOODIE (990F0-BKHM0)
    // -------------------------------------------------------------
    console.log('Capturando VEST junto a HOODIE...');
    await page.evaluate(() => {
      const vestCard = document.querySelector('[data-sku="990F0-BKBW5"]');
      if (vestCard) {
        vestCard.scrollIntoView({
          inline: 'center',
          block: 'center',
          behavior: 'instant',
        });
      }
    });
    await page.waitForTimeout(800);
    const pathVestHoodie = path.join(OUT_DIR, 'catalogo_vest_junto_a_hoodie.png');
    await page.screenshot({ path: pathVestHoodie });
    console.log(`Guardado: ${pathVestHoodie}`);

    // -------------------------------------------------------------
    // CAPTURA 2: SOFTSHELL (990F0-RSSM0) junto a PARKA (990F0-BLPK0)
    // -------------------------------------------------------------
    console.log('Capturando SOFTSHELL junto a PARKA...');
    await page.evaluate(() => {
      const softshellCard = document.querySelector('[data-sku="990F0-RSSM0"]');
      if (softshellCard) {
        softshellCard.scrollIntoView({
          inline: 'center',
          block: 'center',
          behavior: 'instant',
        });
      }
    });
    await page.waitForTimeout(800);
    const pathSoftshellParka = path.join(OUT_DIR, 'catalogo_softshell_junto_a_parka.png');
    await page.screenshot({ path: pathSoftshellParka });
    console.log(`Guardado: ${pathSoftshellParka}`);

    if (heightDiff > 1.0 || cutPrices.length > 0) {
      throw new Error('Verificación fallida: alturas desiguales o precios cortados.');
    }

    console.log(
      '\n✓ Verificación exitosa: Todas las tarjetas tienen la misma altura de imagen y precios visibles.',
    );
    await page.close();
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
