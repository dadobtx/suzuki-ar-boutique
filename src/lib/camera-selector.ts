export type CameraSelectionRule =
  | 'label_match'
  | 'phase1_settings_device_id'
  | 'regex_fallback'
  | 'default_fallback';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface CameraSelectionResult {
  device: CameraDevice | undefined;
  rule: CameraSelectionRule;
  useExact: boolean;
}

/**
 * Selects camera according to priority rules:
 * a) If VITE_CAMERA_LABEL is set, first device whose label contains it (case-insensitive). Uses exact deviceId.
 * b) Else, the deviceId Chrome chose in phase 1 (from getSettings().deviceId). Uses ideal deviceId.
 * c) Else, first device whose label matches /front|frontal|user/i. Uses ideal deviceId.
 * d) Last resort: first available device (videoDevices[0]). Uses ideal deviceId.
 */
export function selectCamera(
  devices: CameraDevice[],
  viteCameraLabel?: string,
  phase1DeviceId?: string,
): CameraSelectionResult {
  if (!devices || devices.length === 0) {
    return {
      device: undefined,
      rule: 'default_fallback',
      useExact: false,
    };
  }

  // a) VITE_CAMERA_LABEL substring match (case-insensitive)
  if (viteCameraLabel && viteCameraLabel.trim().length > 0) {
    const query = viteCameraLabel.trim().toLowerCase();
    const match = devices.find((d) => d.label && d.label.toLowerCase().includes(query));
    if (match) {
      return {
        device: match,
        rule: 'label_match',
        useExact: true,
      };
    }
  }

  // b) Phase 1 default deviceId from Chrome track.getSettings()
  if (phase1DeviceId) {
    const match = devices.find((d) => d.deviceId === phase1DeviceId);
    if (match) {
      return {
        device: match,
        rule: 'phase1_settings_device_id',
        useExact: false,
      };
    }
  }

  // c) Regex fallback: /front|frontal|user/i
  const frontRegex = /front|frontal|user/i;
  const matchFront = devices.find((d) => d.label && frontRegex.test(d.label));
  if (matchFront) {
    return {
      device: matchFront,
      rule: 'regex_fallback',
      useExact: false,
    };
  }

  // d) Last resort: first available device
  return {
    device: devices[0],
    rule: 'default_fallback',
    useExact: false,
  };
}
