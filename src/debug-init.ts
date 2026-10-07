import { initDebugLogger } from './lib/debug-logger';
import { useKioskStore } from './store/kiosk';
import { useSizingStore } from './store/sizing';
import { useGarmentStore } from './store/garment';
import { useCameraStore } from './store/camera';
import { useHandCursorStore } from './store/handCursor';

initDebugLogger();

if (typeof window !== 'undefined') {
  (window as unknown as { __stores?: unknown }).__stores = {
    useKioskStore,
    useSizingStore,
    useGarmentStore,
    useCameraStore,
    useHandCursorStore,
  };
}
