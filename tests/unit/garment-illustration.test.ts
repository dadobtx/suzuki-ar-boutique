import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveGarmentIllustration } from '@/lib/garment-illustration';
import { resolveGarmentAssets } from '@/lib/garment-assets';
import type { Garment } from '@/types/garment';

describe('resolveGarmentIllustration', () => {
  const garmentWithoutIllustration: Garment = {
    id: '990F0-BKHM0',
    line: 'Team Black',
    name: 'Team Black Hoodie',
    category: 'top',
    sku: '990F0-BKHM0',
    sizes: ['S', 'M', 'L'],
    colors: ['#0F0F0F'],
    overlayUrl: '/garments/990F0-BKHM0.png',
    anchorsUrl: '/garments/990F0-BKHM0.anchors.json',
  };

  const garmentWithIllustration: Garment = {
    id: '990F0-BKTM1',
    line: 'Team Black',
    name: 'Team Black T-Shirt',
    category: 'top',
    sku: '990F0-BKTM1',
    sizes: ['S', 'M', 'L'],
    colors: ['#0A0E12'],
    overlayUrl: '/garments/990F0-BKTM1.png',
    anchorsUrl: '/garments/990F0-BKTM1.anchors.json',
    illustrationUrl: '/garments/illustrations/990F0-BKTM1.png',
    illustrationAnchorsUrl: '/garments/illustrations/990F0-BKTM1.anchors.json',
  };

  const reversibleGarmentWithIllustrations: Garment = {
    id: '990F0-BKQJ5',
    line: 'Team Black',
    name: 'Team Black Reversible Jacket',
    category: 'top',
    sku: '990F0-BKQJ5',
    sizes: ['L'],
    colors: ['#CB1C2A', '#14161B'],
    overlayUrl: '/garments/990F0-BKQJ5.png',
    anchorsUrl: '/garments/990F0-BKQJ5.anchors.json',
    variants: [
      {
        id: 'roja',
        label: 'Roja',
        color: '#CB1C2A',
        overlayUrl: '/garments/990F0-BKQJ5.png',
        anchorsUrl: '/garments/990F0-BKQJ5.anchors.json',
        thumbnailUrl: '/garments/990F0-BKQJ5.thumb.png',
        illustrationUrl: '/garments/illustrations/990F0-BKQJ5.png',
        illustrationAnchorsUrl: '/garments/illustrations/990F0-BKQJ5.anchors.json',
      },
      {
        id: 'negra',
        label: 'Negra',
        color: '#14161B',
        overlayUrl: '/garments/990F0-BKQJ5_2.png',
        anchorsUrl: '/garments/990F0-BKQJ5_2.anchors.json',
        thumbnailUrl: '/garments/990F0-BKQJ5_2.thumb.png',
        illustrationUrl: '/garments/illustrations/990F0-BKQJ5_2.png',
        illustrationAnchorsUrl: '/garments/illustrations/990F0-BKQJ5_2.anchors.json',
      },
    ],
  };

  it('prenda sin illustrationUrl -> devuelve null', () => {
    const illust = resolveGarmentIllustration(garmentWithoutIllustration);
    expect(illust).toBeNull();
  });

  it('prenda con illustrationUrl (sin variants) -> la devuelve, key = `illust:${sku}`', () => {
    const illust = resolveGarmentIllustration(garmentWithIllustration);
    expect(illust).not.toBeNull();
    expect(illust?.key).toBe('illust:990F0-BKTM1');
    expect(illust?.illustrationUrl).toBe('/garments/illustrations/990F0-BKTM1.png');
    expect(illust?.illustrationAnchorsUrl).toBe(
      '/garments/illustrations/990F0-BKTM1.anchors.json',
    );
  });

  it('prenda con variants e illustrationUrl en variante activa -> la devuelve con key = `illust:${sku}#${variantId}`', () => {
    const illust = resolveGarmentIllustration(
      reversibleGarmentWithIllustrations,
      'negra',
    );
    expect(illust).not.toBeNull();
    expect(illust?.key).toBe('illust:990F0-BKQJ5#negra');
    expect(illust?.illustrationUrl).toBe('/garments/illustrations/990F0-BKQJ5_2.png');
    expect(illust?.illustrationAnchorsUrl).toBe(
      '/garments/illustrations/990F0-BKQJ5_2.anchors.json',
    );
  });

  it('variantId null o inexistente con variants -> cae a variants[0]', () => {
    const illustNull = resolveGarmentIllustration(
      reversibleGarmentWithIllustrations,
      null,
    );
    expect(illustNull?.key).toBe('illust:990F0-BKQJ5#roja');

    const illustInexistent = resolveGarmentIllustration(
      reversibleGarmentWithIllustrations,
      'inexistente',
    );
    expect(illustInexistent?.key).toBe('illust:990F0-BKQJ5#roja');
  });

  it('la key de resolveGarmentIllustration es SIEMPRE distinta de resolveGarmentAssets para el mismo sku', () => {
    const photoAssets = resolveGarmentAssets(garmentWithIllustration);
    const illustAssets = resolveGarmentIllustration(garmentWithIllustration);

    expect(illustAssets).not.toBeNull();
    expect(illustAssets?.key).not.toBe(photoAssets.key);
    expect(illustAssets?.key.startsWith('illust:')).toBe(true);
    expect(photoAssets.key.startsWith('illust:')).toBe(false);
  });

  describe('Verificación de aislamiento de motores e integridad', () => {
    it('AIProcessing.tsx no importa garment-illustration ni usa illustrationUrl', () => {
      const aiProcPath = path.resolve(
        __dirname,
        '../../src/components/kiosk/AIProcessing.tsx',
      );
      const aiProcContent = fs.readFileSync(aiProcPath, 'utf-8');
      expect(aiProcContent).not.toContain('garment-illustration');
      expect(aiProcContent).not.toContain('illustrationUrl');
      expect(aiProcContent).not.toContain('resolveGarmentIllustration');
    });

    it('CameraStage.tsx y liveTryon.ts no importan garment-illustration', () => {
      const cameraStagePath = path.resolve(
        __dirname,
        '../../src/components/camera/CameraStage.tsx',
      );
      const cameraStageContent = fs.readFileSync(cameraStagePath, 'utf-8');
      expect(cameraStageContent).not.toContain('garment-illustration');
      expect(cameraStageContent).not.toContain('resolveGarmentIllustration');

      const liveTryonPath = path.resolve(__dirname, '../../src/lib/liveTryon.ts');
      const liveTryonContent = fs.readFileSync(liveTryonPath, 'utf-8');
      expect(liveTryonContent).not.toContain('garment-illustration');
      expect(liveTryonContent).not.toContain('resolveGarmentIllustration');
    });

    it('PhotoCountdown / CameraStage pasa overlayCanvasRef (esqueleto debug), no el de GarmentOverlay', () => {
      const cameraStagePath = path.resolve(
        __dirname,
        '../../src/components/camera/CameraStage.tsx',
      );
      const content = fs.readFileSync(cameraStagePath, 'utf-8');
      // Verificamos que PhotoCountdown recibe overlayCanvasRef
      expect(content).toMatch(
        /<PhotoCountdown[\s\S]*?overlayCanvasRef=\{overlayCanvasRef\}/,
      );
      // Y que overlayCanvasRef es el asignado a PoseDebug
      expect(content).toMatch(/<PoseDebug[\s\S]*?canvasRef=\{overlayCanvasRef\}/);
    });

    it('cada prenda o variante del catálogo con ilustración tiene sus archivos PNG y .anchors.json existentes en disco', () => {
      const catalogPath = path.resolve(__dirname, '../../public/catalog.json');
      const catalog: Garment[] = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

      let illustrationCount = 0;
      for (const garment of catalog) {
        if (garment.variants && garment.variants.length > 0) {
          for (const variant of garment.variants) {
            if (variant.illustrationUrl) {
              illustrationCount++;
              expect(variant.illustrationAnchorsUrl).toBeDefined();
              const pngPath = path.resolve(
                __dirname,
                '../../public',
                variant.illustrationUrl.replace(/^\//, ''),
              );
              const anchorsPath = path.resolve(
                __dirname,
                '../../public',
                variant.illustrationAnchorsUrl!.replace(/^\//, ''),
              );
              expect(fs.existsSync(pngPath), `PNG no encontrado: ${pngPath}`).toBe(true);
              expect(
                fs.existsSync(anchorsPath),
                `Anchors no encontrado: ${anchorsPath}`,
              ).toBe(true);
            }
          }
        } else if (garment.illustrationUrl) {
          illustrationCount++;
          expect(garment.illustrationAnchorsUrl).toBeDefined();
          const pngPath = path.resolve(
            __dirname,
            '../../public',
            garment.illustrationUrl.replace(/^\//, ''),
          );
          const anchorsPath = path.resolve(
            __dirname,
            '../../public',
            garment.illustrationAnchorsUrl!.replace(/^\//, ''),
          );
          expect(fs.existsSync(pngPath), `PNG no encontrado: ${pngPath}`).toBe(true);
          expect(
            fs.existsSync(anchorsPath),
            `Anchors no encontrado: ${anchorsPath}`,
          ).toBe(true);
        }
      }

      // Las 11 ilustraciones deben estar presentes en el catálogo (9 prendas simples + 2 variantes en BKQJ5)
      expect(illustrationCount).toBe(11);
    });

    it('las dos caras de 990F0-BKQJ5 resuelven a ilustraciones y keys distintas', () => {
      const catalogPath = path.resolve(__dirname, '../../public/catalog.json');
      const catalog: Garment[] = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      const reversible = catalog.find((g) => g.id === '990F0-BKQJ5');
      expect(reversible).toBeDefined();

      const illustRoja = resolveGarmentIllustration(reversible!, 'roja');
      const illustNegra = resolveGarmentIllustration(reversible!, 'negra');

      expect(illustRoja).not.toBeNull();
      expect(illustNegra).not.toBeNull();
      expect(illustRoja?.key).toBe('illust:990F0-BKQJ5#roja');
      expect(illustNegra?.key).toBe('illust:990F0-BKQJ5#negra');
      expect(illustRoja?.illustrationUrl).toBe('/garments/illustrations/990F0-BKQJ5.png');
      expect(illustNegra?.illustrationUrl).toBe(
        '/garments/illustrations/990F0-BKQJ5_2.png',
      );
      expect(illustRoja?.illustrationUrl).not.toBe(illustNegra?.illustrationUrl);
    });

    it('todos los 11 .anchors.json tienen resolución 1254x1254, shoulderL/R (11/12) y neck (-1)', () => {
      const illustrationsDir = path.resolve(
        __dirname,
        '../../public/garments/illustrations',
      );
      const files = fs
        .readdirSync(illustrationsDir)
        .filter((f) => f.endsWith('.anchors.json'));
      expect(files.length).toBe(11);

      for (const file of files) {
        const filePath = path.join(illustrationsDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        expect(data.overlayWidth, `${file} overlayWidth`).toBe(1254);
        expect(data.overlayHeight, `${file} overlayHeight`).toBe(1254);

        const shoulderL = data.anchors.find((a: { id: string }) => a.id === 'shoulderL');
        const shoulderR = data.anchors.find((a: { id: string }) => a.id === 'shoulderR');
        const neck = data.anchors.find((a: { id: string }) => a.id === 'neck');

        expect(shoulderL, `${file} shoulderL`).toBeDefined();
        expect(shoulderL.landmarkIndex).toBe(11);
        expect(shoulderL.offset).toEqual({ x: 0, y: -0.02 });
        expect(shoulderL.overlayX).toBeGreaterThan(200);
        expect(shoulderL.overlayX).toBeLessThan(400);

        expect(shoulderR, `${file} shoulderR`).toBeDefined();
        expect(shoulderR.landmarkIndex).toBe(12);
        expect(shoulderR.offset).toEqual({ x: 0, y: -0.02 });
        expect(shoulderR.overlayX).toBeGreaterThan(800);
        expect(shoulderR.overlayX).toBeLessThan(1000);

        expect(neck, `${file} neck`).toBeDefined();
        expect(neck.landmarkIndex).toBe(-1);
        expect(neck.overlayX).toBeGreaterThan(600);
        expect(neck.overlayX).toBeLessThan(650);
      }
    });

    it('todos los 11 .anchors.json tienen headExclusion EXPLÍCITO (con rx/ryUp/ryDown o con enabled:false)', () => {
      const illustrationsDir = path.resolve(
        __dirname,
        '../../public/garments/illustrations',
      );
      const files = fs
        .readdirSync(illustrationsDir)
        .filter((f) => f.endsWith('.anchors.json'));
      expect(files.length).toBe(11);

      const requiredHoods = [
        '990F0-BKHM0.anchors.json',
        '990F0-BKBW5.anchors.json',
        '990F0-BKQJ5.anchors.json',
        '990F0-BKQJ5_2.anchors.json',
        '990F0-BLMJ4.anchors.json',
        '990F0-BLPK0.anchors.json',
      ];

      const collarItems = [
        '990F0-BKPM5.anchors.json',
        '990F0-RSSM0.anchors.json',
        '990F0-JYFJ1.anchors.json',
        '990F0-FCHJ0.anchors.json',
      ];

      const disabledItems = ['990F0-BKTM1.anchors.json'];

      for (const file of files) {
        const filePath = path.join(illustrationsDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        expect(
          data.headExclusion,
          `${file} debe tener campo headExclusion explícito`,
        ).toBeDefined();

        if (requiredHoods.includes(file)) {
          expect(
            data.headExclusion.enabled,
            `${file} con capucha no debe tener enabled: false`,
          ).not.toBe(false);
          expect(data.headExclusion.rx, `${file} rx`).toBeGreaterThanOrEqual(0.85);
          expect(data.headExclusion.ryUp, `${file} ryUp`).toBeGreaterThanOrEqual(1.1);
          expect(data.headExclusion.ryDown, `${file} ryDown`).toBeGreaterThanOrEqual(1.3);
        } else if (collarItems.includes(file)) {
          expect(
            data.headExclusion.enabled,
            `${file} con cuello no debe tener enabled: false`,
          ).not.toBe(false);
          expect(data.headExclusion.rx, `${file} rx`).toBeGreaterThanOrEqual(0.75);
          expect(data.headExclusion.ryUp, `${file} ryUp`).toBeGreaterThanOrEqual(1.05);
          expect(data.headExclusion.ryDown, `${file} ryDown`).toBeGreaterThanOrEqual(1.1);
        } else if (disabledItems.includes(file)) {
          expect(
            data.headExclusion.enabled,
            `${file} sin capucha debe tener enabled: false`,
          ).toBe(false);
        } else {
          throw new Error(`Archivo no clasificado: ${file}`);
        }
      }
    });

    it('con VITE_AR_RECORTABLES apagado, el renderizador no usa ilustración y recurre a la foto real', () => {
      // Simulamos la lógica de targetAsset de useGarmentRenderer
      const activeGarmentWithIllust: Garment = {
        id: '990F0-BKTM1',
        line: 'Team Black',
        name: 'Team Black T-Shirt',
        category: 'top',
        sku: '990F0-BKTM1',
        sizes: ['S', 'M', 'L'],
        colors: ['#0A0E12'],
        overlayUrl: '/garments/990F0-BKTM1.png',
        anchorsUrl: '/garments/990F0-BKTM1.anchors.json',
        illustrationUrl: '/garments/illustrations/990F0-BKTM1.png',
        illustrationAnchorsUrl: '/garments/illustrations/990F0-BKTM1.anchors.json',
      };

      // Si el flag está apagado (o cualquier valor distinto de 'on')
      const flagOffValues = ['off', '', undefined, 'false', '0'];
      for (const flag of flagOffValues) {
        const isRecortablesEnabled = flag === 'on';
        const illust = isRecortablesEnabled
          ? resolveGarmentIllustration(activeGarmentWithIllust, null)
          : null;
        expect(illust).toBeNull();

        const assets = resolveGarmentAssets(activeGarmentWithIllust, null);
        const targetAsset = illust
          ? { isIllustration: true, overlayUrl: illust.illustrationUrl }
          : { isIllustration: false, overlayUrl: assets.overlayUrl };

        expect(targetAsset.isIllustration).toBe(false);
        expect(targetAsset.overlayUrl).toBe('/garments/990F0-BKTM1.png');
      }

      // Con el flag en 'on', se selecciona la ilustración
      const isRecortablesEnabled = 'on' === 'on';
      const illust = isRecortablesEnabled
        ? resolveGarmentIllustration(activeGarmentWithIllust, null)
        : null;
      expect(illust).not.toBeNull();
      expect(illust?.illustrationUrl).toBe('/garments/illustrations/990F0-BKTM1.png');
    });
  });
});
