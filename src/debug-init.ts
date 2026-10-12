import { initDebugLogger } from './lib/debug-logger';
import { useKioskStore } from './store/kiosk';
import { useSizingStore } from './store/sizing';
import { useGarmentStore } from './store/garment';
import { useCameraStore } from './store/camera';
import { useHandCursorStore } from './store/handCursor';
import { useLiveTryonStore } from './store/liveTryon';
import { useLayoutStore } from './store/layout';
import { useSelectionUiStore } from './store/selectionUi';

initDebugLogger();

if (typeof window !== 'undefined') {
  (window as unknown as { __stores?: unknown }).__stores = {
    useKioskStore,
    useSizingStore,
    useGarmentStore,
    useCameraStore,
    useHandCursorStore,
    useLiveTryonStore,
    useLayoutStore,
    useSelectionUiStore,
  };
}
