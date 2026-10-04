// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AIError } from '@/components/kiosk/AIError';
import { useKioskStore } from '@/store/kiosk';
import { usePhotoStore } from '@/store/photo';

describe('AIError retry behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useKioskStore.setState({ state: 'AI_ERROR' });
    usePhotoStore.setState({
      photoOriginal: 'blob:test-original',
      photoComposed: 'blob:test-composed',
      aiGenerationStatus: 'error',
      aiGenerationError: 'Network request failed: fetch error',
    });
  });

  it('retries network error with the same photo, without calling clearPhoto()', () => {
    const clearPhotoSpy = vi.spyOn(usePhotoStore.getState(), 'clearPhoto');
    const setAiDataSpy = vi.spyOn(usePhotoStore.getState(), 'setAiData');
    const transitionSpy = vi.spyOn(useKioskStore.getState(), 'transition');

    render(<AIError />);

    expect(screen.getByText(/SE NOS CAYÓ LA CONEXIÓN/i)).toBeTruthy();

    const retryButton = screen.getByRole('button', { name: /INTENTAR DE NUEVO/i });
    expect(retryButton).toBeTruthy();

    fireEvent.click(retryButton);

    expect(clearPhotoSpy).not.toHaveBeenCalled();
    expect(setAiDataSpy).toHaveBeenCalledWith({ status: 'idle', error: undefined });
    expect(transitionSpy).toHaveBeenCalledWith('AI_PROCESSING');
    expect(usePhotoStore.getState().photoOriginal).toBe('blob:test-original');
  });

  it('retries pose error by clearing photo and transitioning to TRYON', () => {
    usePhotoStore.setState({
      aiGenerationError: 'No human pose detected in image',
    });

    const clearPhotoSpy = vi.spyOn(usePhotoStore.getState(), 'clearPhoto');
    const transitionSpy = vi.spyOn(useKioskStore.getState(), 'transition');

    render(<AIError />);

    expect(screen.getByText(/NO VEMOS BIEN TU POSE/i)).toBeTruthy();

    const retakeButton = screen.getByRole('button', { name: /TOMAR LA FOTO DE NUEVO/i });
    expect(retakeButton).toBeTruthy();

    fireEvent.click(retakeButton);

    expect(clearPhotoSpy).toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledWith('TRYON');
  });

  it('finalizes by clearing photo and starting cooldown', () => {
    const clearPhotoSpy = vi.spyOn(usePhotoStore.getState(), 'clearPhoto');
    const startCooldownSpy = vi.spyOn(useKioskStore.getState(), 'startCooldown');

    render(<AIError />);

    const finishButton = screen.getByRole('button', { name: /TERMINAR/i });
    fireEvent.click(finishButton);

    expect(clearPhotoSpy).toHaveBeenCalled();
    expect(startCooldownSpy).toHaveBeenCalled();
  });
});
