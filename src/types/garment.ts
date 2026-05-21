export type GarmentLine =
  | 'GSX-R'
  | 'Ecstar'
  | 'Hayabusa'
  | 'Swift Sport'
  | 'Jimny'
  | 'Marine'
  | 'Lifestyle';

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
  /** Anchor points: pixel position in overlay → MediaPipe landmark */
  anchors: Array<
    GarmentAnchor & {
      overlayX: number; // pixel position in PNG
      overlayY: number;
    }
  >;
}
