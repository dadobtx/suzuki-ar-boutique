export type LiveProviderName = 'decart' | 'fal';

export type LiveTryOnManagerState =
  | 'idle'
  | 'connecting'
  | 'active'
  | 'closing'
  | 'closed';

export type LiveErrorReason =
  | 'token_error'
  | 'kiosk_key'
  | 'busy'
  | 'limit'
  | 'ws_error'
  | 'webrtc_error'
  | 'no_video_timeout';

export interface LiveTryOnConfig {
  token: string;
  maxSeconds: number;
  liveId: number;
  stream: MediaStream;
  referenceImageUrl: string;
  triggerTime?: number;
  provider?: LiveProviderName;
  onUpdate: (stream: MediaStream) => void;
  onError: (error: Error, reason?: LiveErrorReason) => void;
  onClose: (finalSeconds?: number) => void;
}

export interface LiveTryOnProvider {
  start(): Promise<void>;
  stop(): void;
  sendGarment(referenceImageUrl: string): void;
  getState(): LiveTryOnManagerState;
  getConnectionKey(): string;
  getLastError(): string | null;
  hadRemoteVideo(): boolean;
  closedAt: number | null;
}
