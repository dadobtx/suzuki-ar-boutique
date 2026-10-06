// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useSelectionUiStore,
  resolveConfiguredSelectionUi,
  SELECTION_UI_STORAGE_KEY,
} from '@/store/selectionUi';
import { useSelectionUi } from '@/hooks/useSelectionUi';
import { useLayoutStore } from '@/store/layout';

describe('selectionUi and useSelectionUi', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    delete (window as unknown as { location: unknown }).location;
    window.location = new URL('http://localhost/') as unknown as Location;
    useLayoutStore.setState({ mode: 'portrait', source: 'manual' });
  });

  afterEach(() => {
    sessionStorage.clear();
    window.location = originalLocation;
    vi.unstubAllEnvs();
  });

  it('defaults to "clasico" when no parameter, session or env is set', () => {
    const resolved = resolveConfiguredSelectionUi();
    expect(resolved.ui).toBe('clasico');
    expect(resolved.source).toBe('default');
  });

  it('detects "?ui=perchero" from search params', () => {
    window.location = new URL('http://localhost/?ui=perchero') as unknown as Location;
    const resolved = resolveConfiguredSelectionUi();
    expect(resolved.ui).toBe('perchero');
    expect(resolved.source).toBe('url');
  });

  it('detects "#/?ui=perchero" from hash params', () => {
    window.location = new URL('http://localhost/#/?ui=perchero') as unknown as Location;
    const resolved = resolveConfiguredSelectionUi();
    expect(resolved.ui).toBe('perchero');
    expect(resolved.source).toBe('url');
  });

  it('falls back to "clasico" on invalid param "?ui=xyz"', () => {
    window.location = new URL('http://localhost/?ui=xyz') as unknown as Location;
    const resolved = resolveConfiguredSelectionUi();
    expect(resolved.ui).toBe('clasico');
    expect(resolved.source).toBe('default');
  });

  it('gives sessionStorage priority over URL parameter', () => {
    sessionStorage.setItem(SELECTION_UI_STORAGE_KEY, 'clasico');
    window.location = new URL('http://localhost/?ui=perchero') as unknown as Location;
    const resolved = resolveConfiguredSelectionUi();
    expect(resolved.ui).toBe('clasico');
    expect(resolved.source).toBe('session');
  });

  it('uses VITE_SELECTION_UI when no session or URL parameter is set', () => {
    vi.stubEnv('VITE_SELECTION_UI', 'perchero');
    const resolved = resolveConfiguredSelectionUi();
    expect(resolved.ui).toBe('perchero');
    expect(resolved.source).toBe('env');
  });

  it('returns effective "clasico" when chosen is "perchero" but layout is "landscape"', () => {
    useSelectionUiStore.setState({ ui: 'perchero', source: 'manual' });
    useLayoutStore.setState({ mode: 'landscape', source: 'manual' });

    const { result } = renderHook(() => useSelectionUi());
    expect(result.current.selectionUi).toBe('perchero');
    expect(result.current.effectiveSelectionUi).toBe('clasico');

    act(() => {
      useLayoutStore.setState({ mode: 'portrait', source: 'manual' });
    });

    expect(result.current.effectiveSelectionUi).toBe('perchero');
  });
});
