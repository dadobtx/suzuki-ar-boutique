import { describe, it, expect } from 'vitest';
import { shouldApplyUpdate } from '@/lib/pwa-update';

describe('shouldApplyUpdate logic', () => {
  const now = 100000;

  it('returns true only when kioskState is ATTRACT, presence is absent, and absent duration >= 10000ms', () => {
    // Exactly 10000ms
    expect(shouldApplyUpdate('ATTRACT', 'absent', now - 10000, now)).toBe(true);

    // Over 10000ms (e.g. 15000ms)
    expect(shouldApplyUpdate('ATTRACT', 'absent', now - 15000, now)).toBe(true);

    // 25000ms
    expect(shouldApplyUpdate('ATTRACT', 'absent', now - 25000, now)).toBe(true);
  });

  it('returns false when absent duration is less than 10000ms', () => {
    // 0ms
    expect(shouldApplyUpdate('ATTRACT', 'absent', now, now)).toBe(false);

    // 5000ms
    expect(shouldApplyUpdate('ATTRACT', 'absent', now - 5000, now)).toBe(false);

    // 9999ms
    expect(shouldApplyUpdate('ATTRACT', 'absent', now - 9999, now)).toBe(false);
  });

  it('returns false if absentSinceMs is null or undefined', () => {
    expect(shouldApplyUpdate('ATTRACT', 'absent', null, now)).toBe(false);
    expect(shouldApplyUpdate('ATTRACT', 'absent', undefined, now)).toBe(false);
  });

  it('returns false if now is before absentSinceMs (clock skew)', () => {
    expect(shouldApplyUpdate('ATTRACT', 'absent', now + 1000, now)).toBe(false);
  });

  it('returns false if kioskState is not ATTRACT, even if absent for >= 10000ms', () => {
    const states = [
      'AWAKENING',
      'CALIBRATING',
      'TRYON',
      'COOLDOWN',
      'PHOTO_COUNTDOWN',
      'PHOTO_SHARE',
      'AI_STYLIZING',
      'AI_ERROR',
    ];

    for (const state of states) {
      expect(shouldApplyUpdate(state, 'absent', now - 15000, now)).toBe(false);
    }
  });

  it('returns false if presence is not absent, even if in ATTRACT and duration >= 10000ms', () => {
    const nonAbsentPresence = ['present', 'arriving', 'leaving', 'unknown'];

    for (const presence of nonAbsentPresence) {
      expect(shouldApplyUpdate('ATTRACT', presence, now - 15000, now)).toBe(false);
    }
  });

  it('returns false if neither kioskState nor presence match', () => {
    expect(shouldApplyUpdate('TRYON', 'present', now - 15000, now)).toBe(false);
    expect(shouldApplyUpdate('TRYON', 'arriving', now - 15000, now)).toBe(false);
  });
});
