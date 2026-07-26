import { describe, it, expect, beforeEach } from 'vitest';
import { usePhotoStore } from '../../src/store/photo';

describe('Photo Store - Stylized Images', () => {
  beforeEach(() => {
    usePhotoStore.getState().clearPhoto();
  });

  it('should initialize with empty stylizedImages', () => {
    const state = usePhotoStore.getState();
    expect(state.stylizedImages).toEqual([]);
  });

  it('should set and update stylized image status correctly', () => {
    const store = usePhotoStore.getState();

    // Set stylized images to pending
    store.setStylizedImages([
      { styleId: 'anime-football', status: 'pending' },
      { styleId: 'kart-arcade', status: 'pending' },
    ]);

    expect(usePhotoStore.getState().stylizedImages).toEqual([
      { styleId: 'anime-football', status: 'pending' },
      { styleId: 'kart-arcade', status: 'pending' },
    ]);

    // Update status to success
    usePhotoStore
      .getState()
      .updateStylizedImageStatus(
        'anime-football',
        'success',
        'http://example.com/anime.jpg',
      );

    expect(usePhotoStore.getState().stylizedImages).toEqual([
      {
        styleId: 'anime-football',
        status: 'success',
        url: 'http://example.com/anime.jpg',
      },
      { styleId: 'kart-arcade', status: 'pending' },
    ]);

    // Update status to error
    usePhotoStore.getState().updateStylizedImageStatus('kart-arcade', 'error');

    expect(usePhotoStore.getState().stylizedImages).toEqual([
      {
        styleId: 'anime-football',
        status: 'success',
        url: 'http://example.com/anime.jpg',
      },
      { styleId: 'kart-arcade', status: 'error' },
    ]);
  });

  it('should clear stylized images when clearPhoto is called', () => {
    const store = usePhotoStore.getState();
    store.setStylizedImages([{ styleId: 'anime-football', status: 'pending' }]);

    store.clearPhoto();
    expect(usePhotoStore.getState().stylizedImages).toEqual([]);
  });

  it('should clear stylized images when setPhoto is called', () => {
    const store = usePhotoStore.getState();
    store.setStylizedImages([{ styleId: 'anime-football', status: 'pending' }]);

    store.setPhoto('composed_url', 'clean_url', '123456', 'SKU_JACKET');
    expect(usePhotoStore.getState().stylizedImages).toEqual([]);
  });
});
