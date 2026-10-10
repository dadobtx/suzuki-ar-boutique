import { chromium, type Page } from '@playwright/test';
import { spawn, spawnSync } from 'child_process';
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
  heartInside: boolean;
  heartTop: number;
  imgTop: number;
  heartRight: number;
  imgRight: number;
  lineFontSize: string;
  lineColor: string;
  nameFontSize: string;
  priceFontSize: string;
  priceFontWeight: string;
  flipFrontRatio?: number;
  flipFrontCentered?: boolean;
  flipBackRatio?: number;
  flipBackCentered?: boolean;
  flipFontSize?: number;
}

async function measureCatalog(
  page: Page,
  modeName: string,
): Promise<{ measurements: CardMeasurement[]; heightDiff: number; avgHeight: number }> {
  // Wait for 10 cards
  await page.waitForSelector('[role="article"]', { timeout: 15000 });
  await page.waitForTimeout(1200);

  const cards = await page.$$('[role="article"]');
  console.log(`[${modeName}] Encontradas ${cards.length} tarjetas en el catálogo.`);

  if (cards.length !== 10) {
    throw new Error(`Se esperaban 10 tarjetas, pero se encontraron ${cards.length}.`);
  }

  const measurements: CardMeasurement[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const sku = (await card.getAttribute('data-sku')) || `item-${i}`;

    const titleEl = await card.$('.font-display');
    const name = (await titleEl?.innerText()) || 'Desconocido';

    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error(`No se pudo obtener boundingBox para tarjeta ${sku}`);

    // Área de imagen (.bg-white)
    const imgArea = await card.$('.bg-white');
    if (!imgArea) throw new Error(`No se encontró .bg-white en tarjeta ${sku}`);
    const imgBox = await imgArea.boundingBox();
    if (!imgBox)
      throw new Error(`No se pudo obtener boundingBox para área de imagen en ${sku}`);

    // Heart button inside .bg-white
    const heartBtn = await imgArea.$('button');
    if (!heartBtn)
      throw new Error(`No se encontró botón de favorito dentro de .bg-white en ${sku}`);
    const heartBox = await heartBtn.boundingBox();
    if (!heartBox)
      throw new Error(`No se pudo obtener boundingBox para botón de favorito en ${sku}`);

    const heartInside =
      heartBox.y >= imgBox.y - 1 &&
      heartBox.x + heartBox.width <= imgBox.x + imgBox.width + 1;

    // Price container
    const priceEl = await card.$('.font-mono.tabular-nums');
    if (!priceEl) throw new Error(`No se encontró precio en tarjeta ${sku}`);
    const priceBox = await priceEl.boundingBox();
    if (!priceBox)
      throw new Error(`No se pudo obtener boundingBox para precio en ${sku}`);

    const priceBottom = priceBox.y + priceBox.height;
    const cardBottom = cardBox.y + cardBox.height;
    const bottomMargin = cardBottom - priceBottom;
    const priceVisible = bottomMargin >= -0.5;

    // Font computations
    const lineStyles = await card.$eval('.font-mono.text-base', (el: Element) => {
      const s = window.getComputedStyle(el);
      return { fontSize: s.fontSize, color: s.color };
    });

    const nameStyles = await card.$eval('.font-display', (el: Element) => {
      const s = window.getComputedStyle(el);
      return { fontSize: s.fontSize };
    });

    const priceStyles = await priceEl.evaluate((el: Element) => {
      const s = window.getComputedStyle(el);
      return { fontSize: s.fontSize, fontWeight: s.fontWeight };
    });

    // Flip button detection
    const flipBtn = await card.$(
      'button[aria-label*="trasera"], button[aria-label*="viewBackAria"], button:has(b)',
    );
    const hasBack = Boolean(flipBtn);

    let flipFrontRatio: number | undefined;
    let flipFrontCentered: boolean | undefined;
    let flipBackRatio: number | undefined;
    let flipBackCentered: boolean | undefined;
    let flipFontSize: number | undefined;

    if (hasBack && flipBtn) {
      // 1. Initial State (Frente / Front view, button says ATRÁS / BACK)
      const btnBoxFront = await flipBtn.boundingBox();
      const textElFront = await flipBtn.$('b');
      const textBoxFront = await textElFront?.boundingBox();

      if (btnBoxFront && textBoxFront) {
        flipFrontRatio = textBoxFront.width / btnBoxFront.width;
        const btnCenter = btnBoxFront.x + btnBoxFront.width / 2;
        const textCenter = textBoxFront.x + textBoxFront.width / 2;
        flipFrontCentered = Math.abs(textCenter - btnCenter) <= 2.5;
      }

      // 2. Click to flip (Voltear a vista posterior, botón dice FRENTE / FRONT)
      await flipBtn.click();
      await page.waitForTimeout(300);

      const btnBoxBack = await flipBtn.boundingBox();
      const textElBack = await flipBtn.$('b');
      const textBoxBack = await textElBack?.boundingBox();

      if (btnBoxBack && textBoxBack) {
        flipBackRatio = textBoxBack.width / btnBoxBack.width;
        const btnCenter = btnBoxBack.x + btnBoxBack.width / 2;
        const textCenter = textBoxBack.x + textBoxBack.width / 2;
        flipBackCentered = Math.abs(textCenter - btnCenter) <= 2.5;
      }

      if (textElBack) {
        flipFontSize = await textElBack.evaluate((el: Element) => {
          return parseFloat(window.getComputedStyle(el).fontSize);
        });
      }

      // Click back to return to initial front view
      await flipBtn.click();
      await page.waitForTimeout(300);
    }

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
      heartInside,
      heartTop: heartBox.y,
      imgTop: imgBox.y,
      heartRight: heartBox.x + heartBox.width,
      imgRight: imgBox.x + imgBox.width,
      lineFontSize: lineStyles.fontSize,
      lineColor: lineStyles.color,
      nameFontSize: nameStyles.fontSize,
      priceFontSize: priceStyles.fontSize,
      priceFontWeight: priceStyles.fontWeight,
      flipFrontRatio,
      flipFrontCentered,
      flipBackRatio,
      flipBackCentered,
      flipFontSize,
    });
  }

  const heights = measurements.map((m) => m.imageHeight);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const heightDiff = maxHeight - minHeight;
  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length;

  return { measurements, heightDiff, avgHeight };
}

async function main() {
  console.log('Compilando proyecto para preview...');
  const buildResult = spawnSync('npm', ['run', 'build'], {
    shell: true,
    stdio: 'inherit',
  });
  if (buildResult.status !== 0) {
    console.error('Error al compilar proyecto');
    process.exit(1);
  }

  console.log('Iniciando vite preview en puerto 4173...');
  const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    shell: true,
    stdio: 'inherit',
  });

  const ready = await waitUrl('http://localhost:4173/');
  if (!ready) {
    console.error('Error al conectar con vite preview en http://localhost:4173/');
    preview.kill();
    process.exit(1);
  }
  console.log('Vite preview listo en http://localhost:4173/\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  let hasErrors = false;

  try {
    // =========================================================================
    // 1. EVALUACIÓN EN PORTRAIT (1080×1920)
    // =========================================================================
    console.log(
      '========================================================================================',
    );
    console.log('MODO 1: 1080×1920 PORTRAIT');
    console.log(
      '========================================================================================',
    );

    const portraitContext = await browser.newContext({
      viewport: { width: 1080, height: 1920 },
    });
    const portraitPage = await portraitContext.newPage();

    await portraitPage.goto('http://localhost:4173/?layout=portrait');
    await portraitPage.waitForSelector('[data-testid="panel-attract"]', {
      timeout: 15000,
    });

    await portraitPage.evaluate(() => {
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

    const portraitData = await measureCatalog(portraitPage, 'PORTRAIT');

    // Imprimir tabla de portrait
    console.log(
      '\n| SKU         | Prenda                        | Back | Alto Img  | Precio Ok | Corazón Ok | Font Línea | Font Name | Font Precio |',
    );
    console.log(
      '|-------------|-------------------------------|------|-----------|-----------|------------|------------|-----------|-------------|',
    );

    for (const m of portraitData.measurements) {
      const skuPad = m.sku.padEnd(11);
      const namePad = m.name.padEnd(29).slice(0, 29);
      const backPad = (m.hasBack ? 'SÍ' : 'NO').padEnd(4);
      const imgPad = `${m.imageHeight.toFixed(2)}px`.padEnd(9);
      const pricePad = (m.priceVisible ? 'SÍ' : 'NO (CORTADO)').padEnd(9);
      const heartPad = (m.heartInside ? 'DENTRO' : 'FUERA').padEnd(10);
      const linePad = `${m.lineFontSize}`.padEnd(10);
      const nameFPad = `${m.nameFontSize}`.padEnd(9);
      const priceFPad = `${m.priceFontSize} w${m.priceFontWeight}`.padEnd(11);

      console.log(
        `| ${skuPad} | ${namePad} | ${backPad} | ${imgPad} | ${pricePad} | ${heartPad} | ${linePad} | ${nameFPad} | ${priceFPad} |`,
      );
    }

    console.log(
      '\n--- Botón ATRÁS / FRENTE (Ancho texto / Diámetro botón, Centrado, Font Size) ---',
    );
    for (const m of portraitData.measurements.filter((x) => x.hasBack)) {
      const fRatio = m.flipFrontRatio ? `${(m.flipFrontRatio * 100).toFixed(1)}%` : 'N/A';
      const bRatio = m.flipBackRatio ? `${(m.flipBackRatio * 100).toFixed(1)}%` : 'N/A';
      const fSize = m.flipFontSize ? `${m.flipFontSize.toFixed(1)}px` : 'N/A';
      console.log(
        `- ${m.sku}: ATRÁS: ${fRatio} (centrado: ${m.flipFrontCentered}) | FRENTE: ${bRatio} (centrado: ${m.flipBackCentered}, font: ${fSize})`,
      );
      if (m.flipBackRatio && (m.flipBackRatio < 0.55 || m.flipBackRatio > 0.86)) {
        console.error(
          `FALLO: ${m.sku} texto en estado FRENTE fuera de rango 55%-86% (${bRatio})`,
        );
        hasErrors = true;
      }
      if (m.flipFontSize && m.flipFontSize < 11.0) {
        console.error(`FALLO: ${m.sku} font-size de FRENTE < 11px (${fSize})`);
        hasErrors = true;
      }
    }

    console.log(`\nAlto promedio imagen: ${portraitData.avgHeight.toFixed(2)} px`);
    console.log(`Diferencia máx altura imagen: ${portraitData.heightDiff.toFixed(2)} px`);

    if (portraitData.heightDiff > 1.0) {
      console.error(
        `FALLO: Diferencia de alto (${portraitData.heightDiff.toFixed(2)} px) > 1 px.`,
      );
      hasErrors = true;
    }

    const cutPricesPortrait = portraitData.measurements.filter((m) => !m.priceVisible);
    if (cutPricesPortrait.length > 0) {
      console.error(
        'FALLO: Precios cortados en:',
        cutPricesPortrait.map((c) => c.sku),
      );
      hasErrors = true;
    }

    const heartsOutsidePortrait = portraitData.measurements.filter((m) => !m.heartInside);
    if (heartsOutsidePortrait.length > 0) {
      console.error(
        'FALLO: Corazón fuera de .bg-white en:',
        heartsOutsidePortrait.map((c) => c.sku),
      );
      hasErrors = true;
    }

    // Comprobación de tipografía en Portrait
    for (const m of portraitData.measurements) {
      if (m.lineFontSize !== '16px') {
        console.error(
          `FALLO: ${m.sku} tamaño de fuente de línea no es 16px (${m.lineFontSize})`,
        );
        hasErrors = true;
      }
      if (m.nameFontSize !== '30px') {
        console.error(
          `FALLO: ${m.sku} tamaño de fuente de nombre no es 30px (${m.nameFontSize})`,
        );
        hasErrors = true;
      }
      if (m.priceFontSize !== '24px') {
        console.error(
          `FALLO: ${m.sku} tamaño de fuente de precio no es 24px (${m.priceFontSize})`,
        );
        hasErrors = true;
      }
      if (parseInt(m.priceFontWeight) < 600) {
        console.error(
          `FALLO: ${m.sku} peso de fuente de precio es < 600 (${m.priceFontWeight})`,
        );
        hasErrors = true;
      }
    }

    // =========================================================================
    // CAPTURAS DE EVIDENCIA EN PORTRAIT
    // =========================================================================
    console.log('\n--- Generando Capturas de Evidencia ---');

    // 1. catalogo_tshirt_frente_flip.png
    console.log('Capturando catalogo_tshirt_frente_flip.png...');
    const tshirtCard = await portraitPage.$('[data-sku="990F0-BKTM1"]');
    if (tshirtCard) {
      await tshirtCard.scrollIntoViewIfNeeded();
      const flipBtn = await tshirtCard.$(
        'button[aria-label*="trasera"], button[aria-label*="viewBackAria"], button:has(b)',
      );
      if (flipBtn) {
        await flipBtn.click();
        await portraitPage.waitForTimeout(600); // esperar animación de flip
      }
      const p1 = path.join(OUT_DIR, 'catalogo_tshirt_frente_flip.png');
      await tshirtCard.screenshot({ path: p1 });
      console.log(`Guardado: ${p1}`);

      // Restaurar a front
      if (flipBtn) {
        await flipBtn.click();
        await portraitPage.waitForTimeout(600);
      }
    }

    // 2. catalogo_functional_hooded_wishlist.png
    console.log('Capturando catalogo_functional_hooded_wishlist.png...');
    const hoodedCard = await portraitPage.$('[data-sku="990F0-FCHJ0"]');
    if (hoodedCard) {
      await hoodedCard.scrollIntoViewIfNeeded();
      const heartBtn = await hoodedCard.$('.bg-white button');
      if (heartBtn) {
        await heartBtn.click();
        await portraitPage.waitForTimeout(300);
      }
      const p2 = path.join(OUT_DIR, 'catalogo_functional_hooded_wishlist.png');
      await hoodedCard.screenshot({ path: p2 });
      console.log(`Guardado: ${p2}`);
    }

    // 3. catalogo_vest_junto_a_hoodie.png
    console.log('Capturando catalogo_vest_junto_a_hoodie.png...');
    await portraitPage.evaluate(() => {
      const vestCard = document.querySelector('[data-sku="990F0-BKBW5"]');
      if (vestCard) {
        vestCard.scrollIntoView({
          inline: 'center',
          block: 'center',
          behavior: 'instant',
        });
      }
    });
    await portraitPage.waitForTimeout(600);
    const p3 = path.join(OUT_DIR, 'catalogo_vest_junto_a_hoodie.png');
    await portraitPage.screenshot({ path: p3 });
    console.log(`Guardado: ${p3}`);

    await portraitPage.close();
    await portraitContext.close();

    // =========================================================================
    // 2. EVALUACIÓN EN LANDSCAPE (1920×1080)
    // =========================================================================
    console.log(
      '\n========================================================================================',
    );
    console.log('MODO 2: 1920×1080 LANDSCAPE');
    console.log(
      '========================================================================================',
    );

    const landscapeContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const landscapePage = await landscapeContext.newPage();

    await landscapePage.goto('http://localhost:4173/?layout=landscape');
    await landscapePage.waitForSelector('[data-testid="panel-attract"]', {
      timeout: 15000,
    });

    await landscapePage.evaluate(() => {
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

    const landscapeData = await measureCatalog(landscapePage, 'LANDSCAPE');

    console.log(
      '\n| SKU         | Prenda                        | Back | Alto Img  | Precio Ok | Corazón Ok | Font Línea | Font Name | Font Precio |',
    );
    console.log(
      '|-------------|-------------------------------|------|-----------|-----------|------------|------------|-----------|-------------|',
    );

    for (const m of landscapeData.measurements) {
      const skuPad = m.sku.padEnd(11);
      const namePad = m.name.padEnd(29).slice(0, 29);
      const backPad = (m.hasBack ? 'SÍ' : 'NO').padEnd(4);
      const imgPad = `${m.imageHeight.toFixed(2)}px`.padEnd(9);
      const pricePad = (m.priceVisible ? 'SÍ' : 'NO (CORTADO)').padEnd(9);
      const heartPad = (m.heartInside ? 'DENTRO' : 'FUERA').padEnd(10);
      const linePad = `${m.lineFontSize}`.padEnd(10);
      const nameFPad = `${m.nameFontSize}`.padEnd(9);
      const priceFPad = `${m.priceFontSize} w${m.priceFontWeight}`.padEnd(11);

      console.log(
        `| ${skuPad} | ${namePad} | ${backPad} | ${imgPad} | ${pricePad} | ${heartPad} | ${linePad} | ${nameFPad} | ${priceFPad} |`,
      );
    }

    console.log(
      `\nAlto promedio imagen (Landscape): ${landscapeData.avgHeight.toFixed(2)} px`,
    );
    console.log(
      `Diferencia máx altura imagen (Landscape): ${landscapeData.heightDiff.toFixed(2)} px`,
    );

    if (landscapeData.heightDiff > 1.0) {
      console.error(
        `FALLO: Diferencia de alto en landscape (${landscapeData.heightDiff.toFixed(2)} px) > 1 px.`,
      );
      hasErrors = true;
    }

    const cutPricesLandscape = landscapeData.measurements.filter((m) => !m.priceVisible);
    if (cutPricesLandscape.length > 0) {
      console.error(
        'FALLO: Precios cortados en landscape:',
        cutPricesLandscape.map((c) => c.sku),
      );
      hasErrors = true;
    }

    // Comprobación de tipografía en Landscape
    for (const m of landscapeData.measurements) {
      if (m.lineFontSize !== '16px') {
        console.error(
          `FALLO: [Landscape] ${m.sku} tamaño de fuente de línea no es 16px (${m.lineFontSize})`,
        );
        hasErrors = true;
      }
      if (m.nameFontSize !== '30px') {
        console.error(
          `FALLO: [Landscape] ${m.sku} tamaño de fuente de nombre no es 30px (${m.nameFontSize})`,
        );
        hasErrors = true;
      }
      if (m.priceFontSize !== '24px') {
        console.error(
          `FALLO: [Landscape] ${m.sku} tamaño de fuente de precio no es 24px (${m.priceFontSize})`,
        );
        hasErrors = true;
      }
      if (parseInt(m.priceFontWeight) < 600) {
        console.error(
          `FALLO: [Landscape] ${m.sku} peso de fuente de precio es < 600 (${m.priceFontWeight})`,
        );
        hasErrors = true;
      }
    }

    console.log(
      '\n--- Botón ATRÁS / FRENTE [Landscape] (Ancho texto / Diámetro botón, Centrado, Font Size) ---',
    );
    for (const m of landscapeData.measurements.filter((x) => x.hasBack)) {
      const fRatio = m.flipFrontRatio ? `${(m.flipFrontRatio * 100).toFixed(1)}%` : 'N/A';
      const bRatio = m.flipBackRatio ? `${(m.flipBackRatio * 100).toFixed(1)}%` : 'N/A';
      const fSize = m.flipFontSize ? `${m.flipFontSize.toFixed(1)}px` : 'N/A';
      console.log(
        `- ${m.sku}: ATRÁS: ${fRatio} (centrado: ${m.flipFrontCentered}) | FRENTE: ${bRatio} (centrado: ${m.flipBackCentered}, font: ${fSize})`,
      );
      if (m.flipBackRatio && (m.flipBackRatio < 0.55 || m.flipBackRatio > 0.86)) {
        console.error(
          `FALLO: [Landscape] ${m.sku} texto en estado FRENTE fuera de rango 55%-86% (${bRatio})`,
        );
        hasErrors = true;
      }
      if (m.flipFontSize && m.flipFontSize < 11.0) {
        console.error(
          `FALLO: [Landscape] ${m.sku} font-size de FRENTE < 11px (${fSize})`,
        );
        hasErrors = true;
      }
    }

    await landscapePage.close();
    await landscapeContext.close();

    if (hasErrors) {
      throw new Error('La verificación falló con uno o más errores.');
    }

    console.log(
      '\n========================================================================================',
    );
    console.log('✓ VERIFICACIÓN COMPLETA EXITOSA');
    console.log(
      '========================================================================================\n',
    );
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error('\nError en verificación:', err);
  process.exit(1);
});
