import { useEffect } from 'react';
import {
  useSelectionUiStore,
  resolveConfiguredSelectionUi,
  type SelectionUi,
} from '@/store/selectionUi';
import { useLayoutStore } from '@/store/layout';

export function useSelectionUi() {
  const { ui, source, setUi } = useSelectionUiStore();
  const layout = useLayoutStore((s) => s.mode);

  useEffect(() => {
    const current = useSelectionUiStore.getState();
    if (current.source !== 'manual') {
      const resolved = resolveConfiguredSelectionUi();
      if (resolved.ui !== current.ui || resolved.source !== current.source) {
        setUi(resolved.ui, resolved.source);
      }
    }
  }, [setUi]);

  // If chosen is 'perchero' but layout is 'landscape', effective UI is 'clasico'
  const effectiveSelectionUi: SelectionUi =
    ui === 'perchero' && layout === 'landscape' ? 'clasico' : ui;

  return {
    selectionUi: ui,
    effectiveSelectionUi,
    source,
    setSelectionUi: setUi,
  };
}
