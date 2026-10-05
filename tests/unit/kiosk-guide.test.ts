import { describe, it, expect } from 'vitest';
import { resolveGuide } from '@/lib/kiosk-guide';

describe('kiosk-guide resolveGuide logic', () => {
  it('returns null for non-interactive states', () => {
    expect(
      resolveGuide({
        kioskState: 'AWAKENING',
        hasProfile: false,
        presence: 'present',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'ok',
        layout: 'portrait',
      }),
    ).toBeNull();

    expect(
      resolveGuide({
        kioskState: 'PHOTO_COUNTDOWN',
        hasProfile: true,
        presence: 'present',
        activeGarmentId: 'garment-1',
        trackingLostSustained: false,
        framing: 'ok',
        layout: 'landscape',
      }),
    ).toBeNull();

    expect(
      resolveGuide({
        kioskState: 'ATTRACT',
        hasProfile: false,
        presence: 'absent',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'ok',
        layout: 'portrait',
      }),
    ).toBeNull();
  });

  describe('onboarding guidance (kioskState ATTRACT, !hasProfile, presence !== absent)', () => {
    it('shows Step 1 guide when presence is present and framing is ok', () => {
      const resultPortrait = resolveGuide({
        kioskState: 'ATTRACT',
        hasProfile: false,
        presence: 'present',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'ok',
        layout: 'portrait',
      });

      expect(resultPortrait).toEqual({
        step: 1,
        title: 'ELIGE TU TALLA',
        hint: 'y cómo te gusta que te quede',
        arrow: 'down',
        kind: 'step',
      });

      const resultLandscape = resolveGuide({
        kioskState: 'ATTRACT',
        hasProfile: false,
        presence: 'present',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'ok',
        layout: 'landscape',
      });

      expect(resultLandscape?.arrow).toBe('right');
    });

    it('shows body warning "PÁRATE FRENTE AL ESPEJO" when presence is arriving', () => {
      const result = resolveGuide({
        kioskState: 'ATTRACT',
        hasProfile: false,
        presence: 'arriving',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'ok',
        layout: 'portrait',
      });

      expect(result).toEqual({
        step: 1,
        title: 'PÁRATE FRENTE AL ESPEJO',
        hint: null,
        arrow: null,
        kind: 'body',
      });
    });

    it('shows body warning "DA UN PASO ATRÁS" when too close or head cut', () => {
      const tooClose = resolveGuide({
        kioskState: 'ATTRACT',
        hasProfile: false,
        presence: 'present',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'tooClose',
        layout: 'portrait',
      });
      expect(tooClose).toEqual({
        step: 1,
        title: 'DA UN PASO ATRÁS',
        hint: null,
        arrow: null,
        kind: 'body',
      });

      const headCut = resolveGuide({
        kioskState: 'ATTRACT',
        hasProfile: false,
        presence: 'present',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'headCut',
        layout: 'portrait',
      });
      expect(headCut?.title).toBe('DA UN PASO ATRÁS');
    });

    it('shows body warning "ACÉRCATE UN PASO" when too far', () => {
      const tooFar = resolveGuide({
        kioskState: 'ATTRACT',
        hasProfile: false,
        presence: 'present',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'tooFar',
        layout: 'portrait',
      });
      expect(tooFar).toEqual({
        step: 1,
        title: 'ACÉRCATE UN PASO',
        hint: null,
        arrow: null,
        kind: 'body',
      });
    });
  });

  describe('TRYON guidance', () => {
    it('shows Step 2 guide when no garment is selected', () => {
      const resultPortrait = resolveGuide({
        kioskState: 'TRYON',
        hasProfile: true,
        presence: 'present',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'ok',
        layout: 'portrait',
      });

      expect(resultPortrait).toEqual({
        step: 2,
        title: 'TOCA UNA PRENDA PARA PROBÁRTELA',
        hint: 'Desliza para ver más · cambia de línea arriba',
        arrow: 'down',
        kind: 'step',
      });

      const resultLandscape = resolveGuide({
        kioskState: 'TRYON',
        hasProfile: true,
        presence: 'present',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'ok',
        layout: 'landscape',
      });

      expect(resultLandscape?.arrow).toBe('right');
    });

    it('shows Step 3 guide when a garment is selected (without live button)', () => {
      const result = resolveGuide({
        kioskState: 'TRYON',
        hasProfile: true,
        presence: 'present',
        activeGarmentId: 'garment-1',
        trackingLostSustained: false,
        framing: 'ok',
        showLiveButton: false,
        layout: 'portrait',
      });

      expect(result).toEqual({
        step: 3,
        title: 'TÓMATE LA FOTO',
        hint: null,
        arrow: 'down',
        kind: 'step',
      });
    });

    it('shows Step 3 guide with live primary title when showLiveButton is true', () => {
      const result = resolveGuide({
        kioskState: 'TRYON',
        hasProfile: true,
        presence: 'present',
        activeGarmentId: 'garment-1',
        trackingLostSustained: false,
        framing: 'ok',
        showLiveButton: true,
        layout: 'landscape',
      });

      expect(result).toEqual({
        step: 3,
        title: 'PRUÉBALA EN VIVO',
        hint: 'o tómate la foto',
        arrow: 'down',
        kind: 'step',
      });
    });

    it('shows body warning "MUESTRA TUS HOMBROS" when trackingLostSustained with active garment', () => {
      const result = resolveGuide({
        kioskState: 'TRYON',
        hasProfile: true,
        presence: 'present',
        activeGarmentId: 'garment-1',
        trackingLostSustained: true,
        framing: 'ok',
        layout: 'portrait',
      });

      expect(result).toEqual({
        step: 3,
        title: 'MUESTRA TUS HOMBROS',
        hint: null,
        arrow: null,
        kind: 'body',
      });
    });

    it('shows body warning "PÁRATE FRENTE AL ESPEJO" when user leaves during TRYON', () => {
      const result = resolveGuide({
        kioskState: 'TRYON',
        hasProfile: true,
        presence: 'absent',
        activeGarmentId: 'garment-1',
        trackingLostSustained: false,
        framing: 'ok',
        layout: 'portrait',
      });

      expect(result).toEqual({
        step: 3,
        title: 'PÁRATE FRENTE AL ESPEJO',
        hint: null,
        arrow: null,
        kind: 'body',
      });
    });
  });

  describe('custom translation function', () => {
    it('uses translated values if t function is provided', () => {
      const mockT = (key: string, fallback?: string) => {
        if (key === 'kiosk.guide.step1.title') return 'CHOOSE SIZE (EN)';
        return fallback || key;
      };

      const result = resolveGuide({
        kioskState: 'ATTRACT',
        hasProfile: false,
        presence: 'present',
        activeGarmentId: null,
        trackingLostSustained: false,
        framing: 'ok',
        layout: 'portrait',
        t: mockT,
      });

      expect(result?.title).toBe('CHOOSE SIZE (EN)');
    });
  });
});
