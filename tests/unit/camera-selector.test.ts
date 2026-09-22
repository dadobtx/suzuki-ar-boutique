import { describe, it, expect } from 'vitest';
import { selectCamera, CameraDevice } from '@/lib/camera-selector';

describe('selectCamera', () => {
  const devices: CameraDevice[] = [
    { deviceId: 'back-cam-1', label: 'Rear Main Camera 01' },
    { deviceId: 'front-cam-2', label: 'Front Facing HD WebCam' },
    { deviceId: 'usb-cam-3', label: 'REDRAGON USB Live Stream Cam' },
  ];

  it('rule a: selects camera matching VITE_CAMERA_LABEL (case-insensitive) with useExact: true', () => {
    const result = selectCamera(devices, 'redragon', 'back-cam-1');
    expect(result.rule).toBe('label_match');
    expect(result.device?.deviceId).toBe('usb-cam-3');
    expect(result.device?.label).toBe('REDRAGON USB Live Stream Cam');
    expect(result.useExact).toBe(true);
  });

  it('rule b: selects Chrome phase 1 default deviceId when no env label match with useExact: false', () => {
    // env label does not match anything in devices
    const result = selectCamera(devices, 'LOGITECH_C920', 'front-cam-2');
    expect(result.rule).toBe('phase1_settings_device_id');
    expect(result.device?.deviceId).toBe('front-cam-2');
    expect(result.device?.label).toBe('Front Facing HD WebCam');
    expect(result.useExact).toBe(false);
  });

  it('rule c: falls back to regex /front|frontal|user/i when phase 1 deviceId is missing or unknown', () => {
    const result = selectCamera(devices, undefined, 'unknown-device-99');
    expect(result.rule).toBe('regex_fallback');
    expect(result.device?.deviceId).toBe('front-cam-2');
    expect(result.useExact).toBe(false);

    // Also when phase1DeviceId is undefined
    const resultNoPhase1 = selectCamera(
      [
        { deviceId: 'cam-a', label: 'USB 2.0 General' },
        { deviceId: 'cam-b', label: 'Integrated User Camera' },
      ],
      undefined,
      undefined,
    );
    expect(resultNoPhase1.rule).toBe('regex_fallback');
    expect(resultNoPhase1.device?.deviceId).toBe('cam-b');
    expect(resultNoPhase1.useExact).toBe(false);
  });

  it('rule d: falls back to first available camera devices[0] when no other rule matches', () => {
    const genericDevices: CameraDevice[] = [
      { deviceId: 'gen-1', label: 'Generic Capture Device 1' },
      { deviceId: 'gen-2', label: 'Generic Capture Device 2' },
    ];
    const result = selectCamera(genericDevices, undefined, undefined);
    expect(result.rule).toBe('default_fallback');
    expect(result.device?.deviceId).toBe('gen-1');
    expect(result.useExact).toBe(false);
  });

  it('handles empty device list gracefully', () => {
    const result = selectCamera([], 'REDRAGON', 'some-id');
    expect(result.device).toBeUndefined();
    expect(result.rule).toBe('default_fallback');
    expect(result.useExact).toBe(false);
  });
});
