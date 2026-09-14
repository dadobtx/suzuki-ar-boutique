export type GarmentLine =
  // Líneas reales de la boutique (catálogo 2026)
  | 'Team Black'
  | 'Team Blue'
  | 'GSX-R'
  | 'Jimny'
  | 'Lifestyle'
  // Líneas del catálogo de demo anterior (sin stock actual)
  | 'Ecstar'
  | 'Hayabusa'
  | 'Swift Sport'
  | 'Marine';

export type GarmentCategory = 'top' | 'bottom' | 'full' | 'cap' | 'accessory';

export interface GarmentAnchor {
  /** Anchor name in semantic terms */
  id:
    | 'shoulderL'
    | 'shoulderR'
    | 'neck'
    | 'hipL'
    | 'hipR'
    | 'elbowL'
    | 'elbowR'
    | 'wristL'
    | 'wristR';
  /** MediaPipe landmark index */
  landmarkIndex: number;
  /** Normalized offset from landmark in image coords (0-1).
   *  Used to fine-tune anchor placement (e.g., a few px above shoulder). */
  offset: { x: number; y: number };
}

export interface GarmentVariant {
  /** Clave estable de la variante, p.ej. 'roja' | 'negra' */
  id: string;
  /** Etiqueta corta para el botón del kiosko */
  label: string;
  /** Color hex para el chip */
  color: string;
  overlayUrl: string;
  anchorsUrl: string;
  thumbnailUrl: string;
  backImageUrl?: string;
  backThumbnailUrl?: string;
  flip?: boolean;
}

export interface Garment {
  id: string;
  line: GarmentLine;
  name: string;
  category: GarmentCategory;
  sku: string;
  sizes: ('XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'Única')[];
  colors: string[];
  priceCents?: number;
  overlayUrl: string; // path to PNG in /public/garments/
  anchorsUrl: string; // path to .anchors.json in /public/garments/
  thumbnailUrl?: string;
  /** Foto de la ESPALDA. Solo catálogo: nunca se manda al overlay AR,
   *  a FASHN ni a Lucy 2, que esperan la vista frontal. */
  backImageUrl?: string;
  backThumbnailUrl?: string;
  /** true si el par frente/espalda pasó la comprobación de encuadre y
   *  aguanta la animación de volteo. Lo calcula scripts/normalize_back_views.py;
   *  no se pone a mano. */
  flip?: boolean;
  /** Caras/variantes de una misma prenda (p.ej. chompa reversible).
   *  Si existe, variants[0] es la variante por defecto y coincide con
   *  overlayUrl/anchorsUrl/thumbnailUrl de la prenda. */
  variants?: GarmentVariant[];
  badges?: ('NEW' | 'RACING' | 'LIMITED')[];
}

export interface GarmentAnchorsFile {
  /** Path of overlayUrl this anchors set is for */
  overlay: string;
  /** Native pixel dimensions of the overlay PNG */
  overlayWidth: number;
  overlayHeight: number;
  /**
   * Optional: source-Y coordinate (in PNG pixels) above which the garment is
   * NOT warped to the user. Lets each garment tune how much collar/neck area
   * to project above the shoulder landmarks. If omitted, the renderer falls
   * back to (shoulderY - 150px) which is a sensible default for most jackets.
   * Use a SMALLER value (closer to 0) for hoodies/turtlenecks that have tall
   * collars or hoods that should reach higher. Use a LARGER value (closer to
   * shoulderY) for tight crew necks or polos that shouldn't extend above the
   * collarbone.
   */
  topClipY?: number;
  /**
   * Optional: source-Y coordinate (in PNG pixels) below which the garment is
   * NOT warped. Lets each garment tune how much fabric to project below the
   * hip landmarks.
   */
  bottomClipY?: number;
  /** Anchor points: pixel position in overlay → MediaPipe landmark */
  anchors: Array<
    GarmentAnchor & {
      overlayX: number; // pixel position in PNG
      overlayY: number;
    }
  >;
}
