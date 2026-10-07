// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isHandInputEnabled,
  isEffectiveActiveZoneEnabled,
  isHandSimEnabled,
  readUrlHandInput,
  readSessionHandInput,
  writeSessionHandInput,
  HAND_INPUT_STORAGE_KEY,
} from '@/lib/hand-input-flag';
import { ACTIVE_ZONE_STORAGE_KEY } from '@/lib/active-zone';

describe('Hand Input Flag - Interruptor, prioridad y zona activa efectiva', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    delete (window as unknown as { location: unknown }).location;
    window.location = new URL('http://localhost/') as unknown as Location;
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
    window.location = originalLocation;
    vi.unstubAllEnvs();
  });

  it('sin parámetro → OFF (false)', () => {
    expect(isHandInputEnabled()).toBe(false);
  });

  it('?hand=1 en search → ON (true) y fuerza zona ON (isEffectiveActiveZoneEnabled)', () => {
    window.location = new URL('http://localhost/?hand=1') as unknown as Location;
    expect(readUrlHandInput()).toBe(true);
    expect(isHandInputEnabled()).toBe(true);
    expect(isEffectiveActiveZoneEnabled()).toBe(true);
  });

  it('?hand=0 en search → OFF (false)', () => {
    window.location = new URL('http://localhost/?hand=0') as unknown as Location;
    expect(readUrlHandInput()).toBe(false);
    expect(isHandInputEnabled()).toBe(false);
  });

  it('#/?hand=1 en hash → ON (true)', () => {
    window.location = new URL('http://localhost/#/?hand=1') as unknown as Location;
    expect(readUrlHandInput()).toBe(true);
    expect(isHandInputEnabled()).toBe(true);
    expect(isEffectiveActiveZoneEnabled()).toBe(true);
  });

  it('sessionStorage gana sobre default y sobre env cuando no hay parámetro URL', () => {
    // 1. sessionStorage activa hand input aunque default sea OFF
    writeSessionHandInput(true);
    expect(readSessionHandInput()).toBe(true);
    expect(isHandInputEnabled()).toBe(true);

    // 2. sessionStorage desactiva hand input aunque VITE_HAND_INPUT sea 1
    sessionStorage.setItem(HAND_INPUT_STORAGE_KEY, '0');
    vi.stubEnv('VITE_HAND_INPUT', '1');
    expect(isHandInputEnabled()).toBe(false);
  });

  it('VITE_HAND_INPUT activa hand input si no hay URL ni sessionStorage', () => {
    vi.stubEnv('VITE_HAND_INPUT', '1');
    expect(isHandInputEnabled()).toBe(true);
  });

  it('URL tiene máxima prioridad sobre sessionStorage', () => {
    sessionStorage.setItem(HAND_INPUT_STORAGE_KEY, '0');
    window.location = new URL('http://localhost/?hand=1') as unknown as Location;
    expect(isHandInputEnabled()).toBe(true);

    sessionStorage.setItem(HAND_INPUT_STORAGE_KEY, '1');
    window.location = new URL('http://localhost/?hand=0') as unknown as Location;
    expect(isHandInputEnabled()).toBe(false);
  });

  it('isEffectiveActiveZoneEnabled es true si zona=1 o hand=1, y false si ambos están apagados', () => {
    // Ambos apagados
    expect(isEffectiveActiveZoneEnabled()).toBe(false);

    // Solo zona activa
    sessionStorage.setItem(ACTIVE_ZONE_STORAGE_KEY, '1');
    expect(isEffectiveActiveZoneEnabled()).toBe(true);

    // Solo hand activo
    sessionStorage.clear();
    sessionStorage.setItem(HAND_INPUT_STORAGE_KEY, '1');
    expect(isEffectiveActiveZoneEnabled()).toBe(true);
  });

  it('isHandSimEnabled solo activa si debug=1 y hand_sim=1', () => {
    // Sin debug
    window.location = new URL('http://localhost/?hand_sim=1') as unknown as Location;
    expect(isHandSimEnabled()).toBe(false);

    // Con debug=1 pero sin hand_sim
    window.location = new URL('http://localhost/?debug=1') as unknown as Location;
    expect(isHandSimEnabled()).toBe(false);

    // Con ambos en search
    window.location = new URL(
      'http://localhost/?debug=1&hand_sim=1',
    ) as unknown as Location;
    expect(isHandSimEnabled()).toBe(true);

    // Con ambos en hash
    window.location = new URL(
      'http://localhost/#/?debug=1&hand_sim=1',
    ) as unknown as Location;
    expect(isHandSimEnabled()).toBe(true);
  });
});
