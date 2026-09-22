import { useEffect, useRef, useCallback } from 'react';
import { useCameraStore } from '@/store/camera';
import { selectCamera } from '@/lib/camera-selector';

/**
 * Camera hook with 5-phase bootstrap:
 *   1. getUserMedia minimal (video:true) — triggers permission prompt
 *   2. Read capabilities & settings from track
 *   3. Release temporary stream
 *   4. enumerateDevices (labels now available)
 *   5. getUserMedia with ideal constraints + deviceId
 *
 * Fallback progression if phase 5 fails:
 *   Attempt 1: drop width/height, keep deviceId + facingMode
 *   Attempt 2: just { video: true }
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const {
    status,
    phase,
    phaseError,
    availableDevices,
    deviceId,
    deviceLabel,
    capabilities,
    settings,
    error,
    setStatus,
    setPhase,
    setAvailableDevices,
    setDevice,
    setCapabilities,
    setSettings,
    setError,
    resetSession,
  } = useCameraStore();

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const assignStream = useCallback(
    (stream: MediaStream) => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onplaying = () => {
          setPhase('ready');
        };
        videoRef.current
          .play()
          .then(() => {
            setPhase('ready');
          })
          .catch((e) => {
            console.warn('[useCamera] video.play() rejected:', e);
          });
      }
    },
    [setPhase],
  );

  const start = useCallback(async () => {
    // Check API availability
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setError('navigator.mediaDevices.getUserMedia not available');
      setPhase('error', {
        name: 'NotSupportedError',
        message: 'navigator.mediaDevices.getUserMedia not available',
      });
      return;
    }

    setStatus('requesting');
    setPhase('requesting');
    setError(null);

    try {
      // ── Phase 1: Minimal getUserMedia to trigger permission ──
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      // ── Phase 2: Read capabilities & settings ──
      const track = tempStream.getVideoTracks()[0];
      let phase1DeviceId: string | undefined = undefined;
      if (track) {
        if (typeof track.getCapabilities === 'function') {
          setCapabilities(track.getCapabilities());
        }
        if (typeof track.getSettings === 'function') {
          const trackSettings = track.getSettings();
          setSettings(trackSettings);
          phase1DeviceId = trackSettings.deviceId;
        }
      }

      // ── Phase 3: Release temporary stream ──
      tempStream.getTracks().forEach((t) => t.stop());

      // ── Phase 4: Enumerate devices (labels now available) ──
      setPhase('enumerating');
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      const deviceList = videoDevices.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || 'Unknown Camera',
      }));
      setAvailableDevices(deviceList);
      setPhase('selecting');

      const envCameraLabel = import.meta.env.VITE_CAMERA_LABEL as string | undefined;
      const selection = selectCamera(deviceList, envCameraLabel, phase1DeviceId);
      const selected = selection.device;
      const selectedId = selected?.deviceId ?? undefined;
      const selectedLabel = selected?.label ?? 'Unknown';

      console.info(
        `[useCamera] Camera selected via rule "${selection.rule}": "${selectedLabel}" (id: ${selectedId ?? 'none'}) [exact=${selection.useExact}]`,
      );

      if (selectedId) {
        setDevice(selectedId, selectedLabel);
      }

      // ── Phase 5: Final getUserMedia with ideal constraints ──
      setPhase('requesting');
      let finalStream: MediaStream | null = null;

      const deviceIdConstraint = selectedId
        ? selection.useExact
          ? { exact: selectedId }
          : { ideal: selectedId }
        : undefined;

      // Attempt 1: Full ideal constraints
      try {
        finalStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: deviceIdConstraint,
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
      } catch (e1) {
        console.warn('[useCamera] Attempt 1 failed (full constraints):', e1);

        // Attempt 2: Drop resolution constraints
        try {
          finalStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: deviceIdConstraint,
              facingMode: 'user',
            },
            audio: false,
          });
        } catch (e2) {
          console.warn('[useCamera] Attempt 2 failed (no resolution):', e2);

          // Attempt 3: Bare minimum
          try {
            finalStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          } catch (e3) {
            console.error('[useCamera] Attempt 3 failed (bare minimum):', e3);
            throw e3;
          }
        }
      }

      if (finalStream) {
        assignStream(finalStream);
        setPhase('playing');

        // Update settings with final stream's actual settings
        const finalTrack = finalStream.getVideoTracks()[0];
        if (finalTrack && typeof finalTrack.getSettings === 'function') {
          setSettings(finalTrack.getSettings());
        }
        if (finalTrack && typeof finalTrack.getCapabilities === 'function') {
          setCapabilities(finalTrack.getCapabilities());
        }

        setStatus('granted');
      }
    } catch (err) {
      const e = err as DOMException;
      const errName = e?.name || 'Error';
      const errMsg = e?.message || 'Unknown camera error';
      console.warn('[useCamera] Camera error caught:', err);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setStatus('denied');
        setError(e.message);
        setPhase('error', { name: errName, message: errMsg });
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        setStatus('unsupported');
        setError('No camera found');
        setPhase('error', { name: errName, message: 'No camera found' });
      } else {
        setStatus('error');
        setError(e.message || 'Unknown camera error');
        setPhase('error', { name: errName, message: errMsg });
      }
    }
  }, [
    setStatus,
    setError,
    setPhase,
    setAvailableDevices,
    setCapabilities,
    setSettings,
    setDevice,
    assignStream,
  ]);

  const retry = useCallback(() => {
    stopTracks();
    resetSession();
    start();
  }, [stopTracks, resetSession, start]);

  // Start on mount
  useEffect(() => {
    start();
    return () => {
      stopTracks();
      useCameraStore.getState().setStatus('idle');
      useCameraStore.getState().setPhase('idle');
    };
  }, [start, stopTracks]);

  // Protective attach: ensure video gets the stream if it was rendered late
  // and re-trigger play if Chrome silently paused it due to CSS mutations (like objectFit flips).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || status !== 'granted' || !streamRef.current) return;

    // 1. Re-atar stream si se desconectó
    if (video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
    }

    // 2. Re-disparar play si Chrome lo pausó
    if (video.paused) {
      video.play().catch((e) => {
        console.warn('[useCamera] play() retry failed:', e);
      });
    }
  });

  // Pause/resume on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        // Pause: detach stream from video but don't stop tracks
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      } else {
        // Resume: reattach stream
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return {
    videoRef,
    status,
    phase,
    phaseError,
    availableDevices,
    error,
    capabilities,
    settings,
    deviceId,
    deviceLabel,
    retry,
  };
}
