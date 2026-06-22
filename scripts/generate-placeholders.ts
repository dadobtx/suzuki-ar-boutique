import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const GARMENTS_DIR = path.join(PUBLIC_DIR, 'garments');

// Ensure directories exist
if (!fs.existsSync(GARMENTS_DIR)) {
  fs.mkdirSync(GARMENTS_DIR, { recursive: true });
}

// 16 garments config
const ITEMS = [
  // 4 GSX-R
  {
    sku: 'GSXR-JKT-01',
    name: 'GSX-R Racing Jacket',
    line: 'GSX-R',
    color: '#1565C0',
    category: 'top',
  },
  {
    sku: 'GSXR-HD-02',
    name: 'GSX-R Hoodie',
    line: 'GSX-R',
    color: '#1565C0',
    category: 'top',
  },
  {
    sku: 'GSXR-TS-03',
    name: 'GSX-R T-Shirt',
    line: 'GSX-R',
    color: '#000000',
    category: 'top',
  },
  {
    sku: 'GSXR-PNT-04',
    name: 'GSX-R Track Pants',
    line: 'GSX-R',
    color: '#000000',
    category: 'bottom',
  },

  // 3 Ecstar
  {
    sku: 'ECS-PL-01',
    name: 'Ecstar Team Polo',
    line: 'Ecstar',
    color: '#0033A0',
    category: 'top',
  },
  {
    sku: 'ECS-JKT-02',
    name: 'Ecstar Softshell',
    line: 'Ecstar',
    color: '#0033A0',
    category: 'top',
  },
  {
    sku: 'ECS-CP-03',
    name: 'Ecstar Cap',
    line: 'Ecstar',
    color: '#C0C0C0',
    category: 'cap',
  },

  // 3 Hayabusa
  {
    sku: 'HYB-LTH-01',
    name: 'Hayabusa Leather Jacket',
    line: 'Hayabusa',
    color: '#424242',
    category: 'top',
  },
  {
    sku: 'HYB-TS-02',
    name: 'Hayabusa Logo T-Shirt',
    line: 'Hayabusa',
    color: '#FFD700',
    category: 'top',
  },
  {
    sku: 'HYB-GLV-03',
    name: 'Hayabusa Riding Gloves',
    line: 'Hayabusa',
    color: '#424242',
    category: 'accessory',
  },

  // 2 Swift Sport
  {
    sku: 'SWF-HD-01',
    name: 'Swift Sport Hoodie',
    line: 'Swift Sport',
    color: '#FFD400',
    category: 'top',
  },
  {
    sku: 'SWF-TS-02',
    name: 'Swift Sport T-Shirt',
    line: 'Swift Sport',
    color: '#FFD400',
    category: 'top',
  },

  // 2 Jimny
  {
    sku: 'JMN-VT-01',
    name: 'Jimny Adventure Vest',
    line: 'Jimny',
    color: '#2E7D32',
    category: 'top',
  },
  {
    sku: 'JMN-PN-02',
    name: 'Jimny Cargo Pants',
    line: 'Jimny',
    color: '#8B7355',
    category: 'bottom',
  },

  // 1 Marine
  {
    sku: 'MAR-TS-01',
    name: 'Suzuki Marine Tee',
    line: 'Marine',
    color: '#1A237E',
    category: 'top',
  },

  // 1 Lifestyle
  {
    sku: 'LFS-JKT-01',
    name: 'Suzuki Urban Jacket',
    line: 'Lifestyle',
    color: '#424242',
    category: 'top',
  },
];

async function generateAssets() {
  console.log(`Generating placeholders (skipping SKUs with real images)...`);

  // Umbral en bytes para detectar imagen real vs placeholder.
  // Los placeholders SVG generados por este script pesan ~10-30 KB.
  // Las imágenes reales procesadas (1512×1512 transparente) pesan 100+ KB.
  const REAL_IMAGE_MIN_BYTES = 50 * 1024;

  const catalog = [];

  for (const item of ITEMS) {
    const pngPath = path.join(GARMENTS_DIR, `${item.sku}.png`);
    const anchorsPath = path.join(GARMENTS_DIR, `${item.sku}.anchors.json`);

    // Detectar si ya hay imagen real para este SKU
    let hasRealImage = false;
    if (fs.existsSync(pngPath)) {
      const stat = fs.statSync(pngPath);
      if (stat.size > REAL_IMAGE_MIN_BYTES) {
        hasRealImage = true;
        console.log(
          `  ⊘ Skip ${item.sku} — imagen real detectada (${Math.round(stat.size / 1024)}KB)`,
        );
      }
    }

    // Si hay imagen real, NO regenerar PNG ni anchors (preservamos lo que ya está integrado)
    if (hasRealImage) {
      // Pero sí agregamos la entry al catálogo para que no desaparezca
      catalog.push({
        id: item.sku,
        line: item.line,
        name: item.name,
        category: item.category,
        sku: item.sku,
        sizes: ['XS', 'S', 'M', 'L', 'XL'],
        colors: [item.color],
        priceCents: 5900,
        overlayUrl: `/garments/${item.sku}.png`,
        anchorsUrl: `/garments/${item.sku}.anchors.json`,
        thumbnailUrl: `/garments/${item.sku}.png`,
        badges: ['NEW'],
      });
      continue;
    }

    // 1. Generate SVG -> PNG with sharp
    const svg = `
      <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <!-- Transparent background -->
        <rect width="1024" height="1024" fill="transparent" />

        <defs>
          <!-- Grid pattern for unambiguous identification -->
          <pattern id="grid-${item.sku}" patternUnits="userSpaceOnUse" width="64" height="64">
            <path d="M 64 0 L 0 0 0 64" fill="none" stroke="white" stroke-opacity="0.15" stroke-width="1"/>
            <path d="M 0 0 L 64 64" fill="none" stroke="white" stroke-opacity="0.1" stroke-width="1"/>
          </pattern>
        </defs>
        
        <!-- Garment Body (T-pose approx) -->
        <!-- Torso -->
        <path d="M 320 200 L 704 200 L 730 850 L 294 850 Z" fill="${item.color}" fill-opacity="0.9" stroke="white" stroke-width="8"/>
        <!-- Grid overlay inside torso -->
        <path d="M 320 200 L 704 200 L 730 850 L 294 850 Z" fill="url(#grid-${item.sku})" />
        
        <!-- Sleeves -->
        <path d="M 320 200 L 130 420 L 180 470 L 300 350 Z" fill="${item.color}" fill-opacity="0.9" stroke="white" stroke-width="8"/>
        <path d="M 704 200 L 894 420 L 844 470 L 724 350 Z" fill="${item.color}" fill-opacity="0.9" stroke="white" stroke-width="8"/>
        
        <!-- Neck cutout -->
        <ellipse cx="512" cy="200" rx="80" ry="40" fill="transparent" stroke="white" stroke-width="8"/>

        <!-- Text Label -->
        <text x="512" y="480" font-family="monospace" font-size="64" fill="white" font-weight="bold" text-anchor="middle" dominant-baseline="middle">
          ${item.line}
        </text>
        <text x="512" y="560" font-family="monospace" font-size="48" fill="white" text-anchor="middle" dominant-baseline="middle">
          ${item.sku}
        </text>
        
        <!-- Anchor markers (for visual debugging) -->
        <circle cx="200" cy="260" r="12" fill="red" />
        <text x="200" y="240" font-family="sans-serif" font-size="16" fill="red" text-anchor="middle">ShoulderL</text>
        
        <circle cx="824" cy="260" r="12" fill="red" />
        <text x="824" y="240" font-family="sans-serif" font-size="16" fill="red" text-anchor="middle">ShoulderR</text>

        <circle cx="280" cy="820" r="12" fill="red" />
        <text x="280" y="840" font-family="sans-serif" font-size="16" fill="red" text-anchor="middle">HipL</text>

        <circle cx="744" cy="820" r="12" fill="red" />
        <text x="744" y="840" font-family="sans-serif" font-size="16" fill="red" text-anchor="middle">HipR</text>

        <circle cx="130" cy="420" r="12" fill="red" />
        <text x="130" y="400" font-family="sans-serif" font-size="16" fill="red" text-anchor="middle">ElbowL</text>

        <circle cx="894" cy="420" r="12" fill="red" />
        <text x="894" y="400" font-family="sans-serif" font-size="16" fill="red" text-anchor="middle">ElbowR</text>
      </svg>
    `;

    await sharp(Buffer.from(svg)).png().toFile(pngPath);

    // 2. Generate anchors JSON
    const anchorsData = {
      overlay: `/garments/${item.sku}.png`,
      overlayWidth: 1024,
      overlayHeight: 1024,
      anchors: [
        {
          id: 'shoulderL',
          landmarkIndex: 11,
          overlayX: 200,
          overlayY: 260,
          offset: { x: 0, y: -0.02 },
        },
        {
          id: 'shoulderR',
          landmarkIndex: 12,
          overlayX: 824,
          overlayY: 260,
          offset: { x: 0, y: -0.02 },
        },
        {
          id: 'hipL',
          landmarkIndex: 23,
          overlayX: 280,
          overlayY: 820,
          offset: { x: 0, y: 0 },
        },
        {
          id: 'hipR',
          landmarkIndex: 24,
          overlayX: 744,
          overlayY: 820,
          offset: { x: 0, y: 0 },
        },
        {
          id: 'elbowL',
          landmarkIndex: 13,
          overlayX: 130,
          overlayY: 420,
          offset: { x: 0, y: 0 },
        },
        {
          id: 'elbowR',
          landmarkIndex: 14,
          overlayX: 894,
          overlayY: 420,
          offset: { x: 0, y: 0 },
        },
      ],
    };

    fs.writeFileSync(anchorsPath, JSON.stringify(anchorsData, null, 2));

    // 3. Add to catalog
    catalog.push({
      id: item.sku,
      line: item.line,
      name: item.name,
      category: item.category,
      sku: item.sku,
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [item.color],
      priceCents: 5900,
      overlayUrl: `/garments/${item.sku}.png`,
      anchorsUrl: `/garments/${item.sku}.anchors.json`,
      thumbnailUrl: `/garments/${item.sku}.png`,
      badges: ['NEW'],
    });
  }

  // 4. Write catalog.json — MERGE con entradas existentes (preserva SKUs
  //    nuevos agregados por integrate-real-garments u otros scripts)
  const catalogPath = path.join(PUBLIC_DIR, 'catalog.json');
  let existingCatalog: typeof catalog = [];
  if (fs.existsSync(catalogPath)) {
    try {
      existingCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    } catch {
      existingCatalog = [];
    }
  }

  // SKUs que este script maneja (los 16 base)
  const managedSkus = new Set(catalog.map((c) => c.sku));
  // Preservar entradas existentes cuyos SKUs NO están en los 16 base
  const extraEntries = existingCatalog.filter((c) => !managedSkus.has(c.sku));

  const mergedCatalog = [...catalog, ...extraEntries];
  fs.writeFileSync(catalogPath, JSON.stringify(mergedCatalog, null, 2));

  console.log(
    `✅ Catálogo escrito: ${catalog.length} base + ${extraEntries.length} preservados = ${mergedCatalog.length} total`,
  );
}

generateAssets().catch(console.error);
