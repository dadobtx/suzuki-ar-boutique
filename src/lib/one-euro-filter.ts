/**
 * One-Euro Filter implementation in pure TypeScript.
 * Useful for filtering noisy signals (like AR landmarks) with minimal lag.
 */

export interface OneEuroConfig {
  fcmin: number; // Minimum cutoff frequency (1.0 default)
  beta: number; // Cutoff slope (0.007 default)
  dcutoff: number; // Cutoff frequency for derivate (1.0 default)
}

export const DEFAULT_CONFIG: OneEuroConfig = {
  fcmin: 1.0,
  beta: 0.007,
  dcutoff: 1.0,
};

function alpha(cutoff: number, te: number): number {
  const r = 2.0 * Math.PI * cutoff * te;
  return r / (r + 1.0);
}

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  reset() {
    this.y = null;
    this.s = null;
  }

  filter(value: number, alpha: number): number {
    if (this.y === null || this.s === null) {
      this.y = value;
      this.s = value;
      return value;
    }
    this.y = value;
    this.s = alpha * value + (1.0 - alpha) * this.s;
    return this.s;
  }
}

export class OneEuroFilter {
  private config: OneEuroConfig;
  private xFilt = new LowPassFilter();
  private dxFilt = new LowPassFilter();
  private prevTime = -1;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset() {
    this.xFilt.reset();
    this.dxFilt.reset();
    this.prevTime = -1;
  }

  filter(x: number, t: number): number {
    // If invalid input, return original and reset
    if (!Number.isFinite(x) || !Number.isFinite(t)) {
      this.reset();
      return x;
    }

    if (this.prevTime === -1 || t <= this.prevTime) {
      this.prevTime = t;
      this.xFilt.filter(x, 1.0);
      this.dxFilt.filter(0.0, 1.0);
      return x;
    }

    const te = (t - this.prevTime) / 1000.0; // Assume t is in ms, delta in seconds
    this.prevTime = t;

    // Estimate derivative
    const dx = (x - (this.xFilt['y'] as number)) / te;
    const dxAlpha = alpha(this.config.dcutoff, te);
    const edx = this.dxFilt.filter(dx, dxAlpha);

    // Compute cutoff frequency
    const cutoff = this.config.fcmin + this.config.beta * Math.abs(edx);
    const xAlpha = alpha(cutoff, te);

    return this.xFilt.filter(x, xAlpha);
  }
}

export class Point3DFilter {
  private x = new OneEuroFilter();
  private y = new OneEuroFilter();
  private z = new OneEuroFilter();
  private config: OneEuroConfig;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.x = new OneEuroFilter(this.config);
    this.y = new OneEuroFilter(this.config);
    this.z = new OneEuroFilter(this.config);
  }

  reset() {
    this.x.reset();
    this.y.reset();
    this.z.reset();
  }

  filterPoint(pt: { x: number; y: number; z: number; visibility?: number }, t: number) {
    return {
      ...pt,
      x: this.x.filter(pt.x, t),
      y: this.y.filter(pt.y, t),
      z: this.z.filter(pt.z, t),
    };
  }
}
