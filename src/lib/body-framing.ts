export const FRAMING_TOO_CLOSE = 0.3;
export const FRAMING_TOO_FAR = 0.12;
export const HEAD_CUT = 0.03;

export type FramingState = 'ok' | 'tooClose' | 'tooFar' | 'headCut';

export interface FramingMetrics {
  framing: FramingState;
  sw: number | null;
  headTop: number | null;
}

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/**
 * Computes body framing metrics from 2D normalized pose landmarks.
 * - sw: shoulder width |x11 - x12|
 * - headTop: min(y0, y2, y5) [nose, left eye, right eye]
 *
 * Priority:
 * 1. headCut: headTop < 0.03
 * 2. tooClose: sw > 0.30
 * 3. tooFar: sw < 0.12
 * 4. ok
 */
export function computeFramingMetrics(
  landmarks: LandmarkPoint[] | null | undefined,
): FramingMetrics {
  if (!landmarks || landmarks.length < 13) {
    return { framing: 'ok', sw: null, headTop: null };
  }

  const p0 = landmarks[0];
  const p2 = landmarks[2];
  const p5 = landmarks[5];
  const p11 = landmarks[11];
  const p12 = landmarks[12];

  if (!p0 || !p2 || !p5 || !p11 || !p12) {
    return { framing: 'ok', sw: null, headTop: null };
  }

  const sw = Math.abs(p11.x - p12.x);
  const headTop = Math.min(p0.y, p2.y, p5.y);

  let framing: FramingState = 'ok';
  if (headTop < HEAD_CUT) {
    framing = 'headCut';
  } else if (sw > FRAMING_TOO_CLOSE) {
    framing = 'tooClose';
  } else if (sw < FRAMING_TOO_FAR) {
    framing = 'tooFar';
  }

  return { framing, sw, headTop };
}

export function computeFraming(
  landmarks: LandmarkPoint[] | null | undefined,
): FramingState {
  return computeFramingMetrics(landmarks).framing;
}

/**
 * Hysteresis filter requiring a candidate framing state to persist
 * continuously for at least `delayMs` (default 1000ms) before committing.
 */
export class FramingHysteresis {
  private current: FramingState;
  private candidate: FramingState;
  private candidateSince: number = 0;
  private readonly delayMs: number;

  constructor(delayMs: number = 1000, initial: FramingState = 'ok') {
    this.delayMs = delayMs;
    this.current = initial;
    this.candidate = initial;
  }

  public update(raw: FramingState, now: number = performance.now()): FramingState {
    if (raw === this.current) {
      this.candidate = raw;
      return this.current;
    }

    if (raw !== this.candidate) {
      this.candidate = raw;
      this.candidateSince = now;
      return this.current;
    }

    if (now - this.candidateSince >= this.delayMs) {
      this.current = raw;
    }

    return this.current;
  }

  public getCurrent(): FramingState {
    return this.current;
  }

  public reset(initial: FramingState = 'ok'): void {
    this.current = initial;
    this.candidate = initial;
    this.candidateSince = 0;
  }
}
