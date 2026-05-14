/**
 * Integra las imágenes reales de prendas desde public/garments2/ al sistema.
 *
 * - Copia los PNG a public/garments/
 * - Actualiza/crea los .anchors.json con dimensiones correctas (1512×1512)
 * - Escala los anchor coordinates por factor 1512/1024 = 1.476
 * - Agrega nuevas entradas a catalog.json si hay SKUs nuevos
 * - Mantiene los placeholders de SKUs que aún no tienen imagen real
 *
 * Uso:
 *   npm run integrate-real-garments
 * O:
 *   npx tsx scripts/integrate-real-garments.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const GARMENTS_DIR = path.join(PUBLIC_DIR, 'garments');
const GARMENTS2_DIR = path.join(PUBLIC_DIR, 'garments2');
const CATALOG_PATH = path.join(PUBLIC_DIR, 'catalog.json');

// Nuevas dimensiones (las imágenes reales son 1512×1512)
const NEW_W = 1512;
const NEW_H = 1512;

// Metadata para SKUs nuevos (los que no existen aún en catalog.json).
// EDITAR ESTA TABLA si querés ajustar nombres, líneas o categorías.
const NEW_SKU_METADATA: Record<
  string,
  { line: string; name: string; category: string; colors: string[] }
> = {
  'GSXR-JKT-02': {
    line: 'GSX-R',
    name: 'GSX-R Team Jacket',
    category: 'top',
    colors: ['#1565C0'],
  },
  'ECS-PL-02': {
    line: 'Ecstar',
    name: 'Ecstar Race Polo',
    category: 'top',
    colors: ['#0033A0'],
  },
  'SWF-HD-02': {
    line: 'Swift Sport',
    name: 'Swift Sport Hoodie Black',
    category: 'top',
    colors: ['#000000'],
  },
};

interface Anchor {
  id: string;
  landmarkIndex: number;
  overlayX: number;
  overlayY: number;
  offset: { x: number; y: number };
}

interface AnchorsFile {
  overlay: string;
  overlayWidth: number;
  overlayHeight: number;
  anchors: Anchor[];
}

interface CatalogEntry {
  id: string;
  line: string;
  name: string;
  category: string;
  sku: string;
  sizes: string[];
  colors: string[];
  priceCents: number;
  overlayUrl: string;
  anchorsUrl: string;
  thumbnailUrl: string;
  badges: string[];
}

// Anchors por defecto en coordenadas 1024×1024 (de generate-placeholders.ts)
const DEFAULT_ANCHORS_1024: Anchor[] = [
  {
    id: 'shoulderL',
    landmarkIndex: 11,
    overlayX: 256,
    overlayY: 240,
    offset: { x: 0, y: -0.02 },
  },
  {
    id: 'shoulderR',
    landmarkIndex: 12,
    overlayX: 768,
    overlayY: 240,
    offset: { x: 0, y: -0.02 },
  },
  {
    id: 'hipL',
    landmarkIndex: 23,
    overlayX: 320,
    overlayY: 800,
    offset: { x: 0, y: 0 },
  },
  {
    id: 'hipR',
    landmarkIndex: 24,
    overlayX: 704,
    overlayY: 800,
    offset: { x: 0, y: 0 },
  },
];

function loadCatalog(): CatalogEntry[] {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`❌ catalog.json no existe en ${CATALOG_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
}

function buildAnchorsForReal(sku: string, oldAnchors: Anchor[] | null): AnchorsFile {
  // Si existían anchors viejos (de un placeholder previo), tomamos esos.
  // Si no, usamos los defaults de T-pose 1024×1024.
  const baseAnchors = oldAnchors ?? DEFAULT_ANCHORS_1024;

  // Escalamos coordenadas de 1024 → 1512
  const scale = NEW_W / 1024;
  const scaledAnchors: Anchor[] = baseAnchors.map((a) => ({
    ...a,
    overlayX: Math.round(a.overlayX * scale),
    overlayY: Math.round(a.overlayY * scale),
  }));

  return {
    overlay: `/garments/${sku}.png`,
    overlayWidth: NEW_W,
    overlayHeight: NEW_H,
    anchors: scaledAnchors,
  };
}

function main() {
  console.log('🏍️  Suzuki AR Boutique · Integrate Real Garments\n');

  if (!fs.existsSync(GARMENTS2_DIR)) {
    console.error(`❌ public/garments2/ no existe. Nada para integrar.`);
    process.exit(1);
  }

  const realImages = fs.readdirSync(GARMENTS2_DIR).filter((f) => f.endsWith('.png'));

  if (realImages.length === 0) {
    console.error(`❌ No hay PNGs en public/garments2/.`);
    process.exit(1);
  }

  console.log(`📁 Encontradas ${realImages.length} imágenes reales en garments2/\n`);

  const catalog = loadCatalog();
  const catalogBySku = new Map(catalog.map((e) => [e.sku, e]));

  const newEntries: CatalogEntry[] = [];
  const processed: string[] = [];
  const warnings: string[] = [];

  for (const filename of realImages) {
    const sku = path.basename(filename, '.png');
    const srcPath = path.join(GARMENTS2_DIR, filename);
    const destPath = path.join(GARMENTS_DIR, filename);
    const anchorsPath = path.join(GARMENTS_DIR, `${sku}.anchors.json`);

    // 1. Copiar imagen
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ Copiada ${filename}`);

    // 2. Cargar anchors existentes (si hay) o usar defaults
    let oldAnchors: Anchor[] | null = null;
    if (fs.existsSync(anchorsPath)) {
      const oldData: AnchorsFile = JSON.parse(fs.readFileSync(anchorsPath, 'utf-8'));
      // Si dimensiones ya son 1512, asumimos que ya estaban actualizadas
      if (oldData.overlayWidth !== NEW_W) {
        // Re-escalar desde sus dimensiones originales
        const scale = NEW_W / oldData.overlayWidth;
        oldAnchors = oldData.anchors.map((a) => ({
          ...a,
          overlayX: Math.round(a.overlayX * scale),
          overlayY: Math.round(a.overlayY * scale),
        }));
        // Resetear scale a base 1024 para que buildAnchorsForReal re-escale correctamente
        // Más simple: usar oldData.anchors tal cual y dejar que buildAnchorsForReal escale
        oldAnchors = oldData.anchors.map((a) => ({
          ...a,
          overlayX: Math.round((a.overlayX * 1024) / oldData.overlayWidth),
          overlayY: Math.round((a.overlayY * 1024) / oldData.overlayHeight),
        }));
      } else {
        // Ya estaba en 1512, mantenemos
        oldAnchors = oldData.anchors.map((a) => ({
          ...a,
          overlayX: Math.round((a.overlayX * 1024) / NEW_W),
          overlayY: Math.round((a.overlayY * 1024) / NEW_W),
        }));
      }
    }

    // 3. Generar anchors actualizados a 1512×1512
    const newAnchorsData = buildAnchorsForReal(sku, oldAnchors);
    fs.writeFileSync(anchorsPath, JSON.stringify(newAnchorsData, null, 2));
    console.log(`  📐 Anchors actualizados a ${NEW_W}×${NEW_H}`);

    // 4. Agregar entrada al catálogo si es SKU nuevo
    if (!catalogBySku.has(sku)) {
      const meta = NEW_SKU_METADATA[sku];
      if (!meta) {
        warnings.push(
          `⚠️  ${sku} es nuevo pero no tiene metadata en NEW_SKU_METADATA. ` +
            `Agregalo a la tabla del script y volvé a correr. ` +
            `Por ahora se copió la imagen y los anchors pero NO entró al catálogo.`,
        );
        continue;
      }
      const entry: CatalogEntry = {
        id: sku,
        sku,
        sizes: ['S', 'M', 'L', 'XL'],
        priceCents: 5900,
        overlayUrl: `/garments/${sku}.png`,
        anchorsUrl: `/garments/${sku}.anchors.json`,
        thumbnailUrl: `/garments/${sku}.png`,
        badges: ['NEW'],
        line: meta.line,
        name: meta.name,
        category: meta.category,
        colors: meta.colors,
      };
      newEntries.push(entry);
      console.log(`  ➕ Nuevo en catálogo: ${meta.name}`);
    } else {
      console.log(`  📝 Coincide con catálogo existente: ${catalogBySku.get(sku)!.name}`);
    }

    processed.push(sku);
  }

  // 5. Guardar catálogo actualizado
  if (newEntries.length > 0) {
    catalog.push(...newEntries);
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    console.log(
      `\n✅ Catálogo actualizado: +${newEntries.length} entradas, total ${catalog.length}`,
    );
  } else {
    console.log(`\n✅ Catálogo sin cambios (solo reemplazos de imágenes existentes)`);
  }

  // 6. Reporte final
  console.log(`\n📊 Resumen:`);
  console.log(`   Imágenes procesadas: ${processed.length}`);
  console.log(`   SKUs con imagen real: ${processed.join(', ')}`);

  const stillPlaceholders = catalog
    .filter((c) => !processed.includes(c.sku))
    .map((c) => c.sku);
  if (stillPlaceholders.length > 0) {
    console.log(`   SKUs aún con placeholder: ${stillPlaceholders.join(', ')}`);
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  Advertencias:`);
    warnings.forEach((w) => console.log(`   ${w}`));
  }

  console.log(
    `\n🎯 Próximo paso: npm run dev → localhost:5173/?dev=1 → cyclar a las prendas reales`,
  );
}

main();
