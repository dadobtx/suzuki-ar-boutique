import {
  createDecartClient,
  models,
  type DecartSDKError,
  type RealTimeClient,
  type ConnectionState,
} from '@decartai/sdk';
import type {
  LiveTryOnConfig,
  LiveTryOnProvider,
  LiveTryOnManagerState,
  LiveErrorReason,
} from './types';

export const DECART_TRYON_PROMPT =
  'Substitute the current top with the garment from the reference image, matching its color, material, logos and fit';

export class DecartLiveProvider implements LiveTryOnProvider {
  private config: LiveTryOnConfig;
  private realtimeClient: RealTimeClient | null = null;
  private state: LiveTryOnManagerState = 'idle';
  private connectionKey: string;
  public closedAt: number | null = null;
  private lastError: string | null = null;
  private hasReceivedRemoteTrack = false;
  private startTime = Date.now();
  private totalSeconds = 0;

  constructor(config: LiveTryOnConfig) {
    this.config = config;
    this.connectionKey = `decart-lucy-${config.liveId}-${crypto.randomUUID()}`;
  }

  public getState(): LiveTryOnManagerState {
    return this.state;
  }

  public getConnectionKey(): string {
    return this.connectionKey;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public hadRemoteVideo(): boolean {
    return this.hasReceivedRemoteTrack;
  }

  private isClosedOrClosing(): boolean {
    return this.state === 'closing' || this.state === 'closed';
  }

  private log(transition: string, details?: unknown): void {
    const elapsed =
      this.config.triggerTime !== undefined
        ? Math.max(0, Math.round(performance.now() - this.config.triggerTime))
        : Math.max(0, Math.round(Date.now() - this.startTime));
    const prefix = `[live-decart] t+${elapsed}ms ${transition}`;
    if (details !== undefined) {
      console.log(prefix, details);
    } else {
      console.log(prefix);
    }
  }

  private classifyError(err: unknown): LiveErrorReason {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code ?? '')
        : '';

    // 1. Clasificación prioritaria por código del SDK
    if (
      code === 'INVALID_API_KEY' ||
      code === 'TOKEN_EXPIRED' ||
      code === 'TOKEN_INVALID' ||
      code === 'TOKEN_CREATE_ERROR'
    ) {
      return 'token_error';
    }
    if (code === 'WEBRTC_WEBSOCKET_ERROR') {
      return 'ws_error';
    }
    if (
      code.startsWith('WEBRTC_') ||
      code === 'LIVEKIT_INITIALIZATION_ERROR' ||
      code === 'WEB_RTC_ERROR'
    ) {
      return 'webrtc_error';
    }

    // 2. Clasificación por texto con frases completas (sin coincidencias sueltas como 'ws' o 'ice')
    const msg =
      err instanceof Error
        ? err.message
        : typeof (err as { message?: unknown })?.message === 'string'
          ? (err as { message: string }).message
          : String(err);
    const lower = msg.toLowerCase();

    if (
      String(code) === '1013' ||
      lower.includes('concurrent session limit') ||
      lower.includes('session limit reached') ||
      lower.includes('1013')
    ) {
      return 'limit';
    }
    if (lower.includes('busy')) {
      return 'busy';
    }
    if (lower.includes('kiosk_key') || lower.includes('403')) {
      return 'kiosk_key';
    }
    if (lower.includes('websocket')) {
      return 'ws_error';
    }
    if (
      lower.includes('ice connection') ||
      lower.includes('webrtc error') ||
      lower.includes('peer connection')
    ) {
      return 'webrtc_error';
    }

    return 'token_error';
  }

  public async start(): Promise<void> {
    if (this.state !== 'idle') return;
    this.state = 'connecting';
    this.log('connect() called', { connectionKey: this.connectionKey });

    try {
      // Usamos client con apiKey estático del token de un solo uso emitido por el Worker.
      // No usamos apiKeyProvider porque en reconexiones automáticas del SDK invocaría
      // /live/token de nuevo, activando el candado busy 429 o duplicando cobros y sesiones.
      // En su lugar, retries: 0 da control determinista sobre el ciclo de vida y presupuestos.
      const client = createDecartClient({
        apiKey: this.config.token,
      });

      const model = models.realtime('lucy-vton-latest');

      const realtimeClient = await client.realtime.connect(this.config.stream, {
        model,
        mirror: false, // El stream enviado NO debe ir espejado para no invertir logos Suzuki
        retries: 0, // Deshabilitar reconexión automática del SDK para control estricto de cuota
        initialState: {
          prompt: {
            text: DECART_TRYON_PROMPT,
            enhance: false,
          },
          image: this.config.referenceImageUrl,
        },
        onRemoteStream: (remoteStream) => {
          if (this.isClosedOrClosing()) return;
          this.hasReceivedRemoteTrack = true;
          this.state = 'active';
          this.log('track received (remoteStream)');
          this.config.onUpdate(remoteStream);
        },
        onConnectionChange: (connectionState: ConnectionState) => {
          if (this.isClosedOrClosing()) return;
          this.log(`connectionState: ${connectionState}`);
          if (connectionState === 'generating' || connectionState === 'connected') {
            if (this.hasReceivedRemoteTrack) {
              this.state = 'active';
            }
          } else if (connectionState === 'disconnected') {
            if (!this.isClosedOrClosing()) {
              this.log('disconnected');
            }
          }
        },
      });

      if (this.isClosedOrClosing()) {
        realtimeClient.disconnect();
        return;
      }

      this.realtimeClient = realtimeClient;

      // Evento generationTick: signaling-channel.js:307 emite msg.seconds
      realtimeClient.on('generationTick', ({ seconds }) => {
        if (this.isClosedOrClosing()) return;
        if (seconds > this.totalSeconds) {
          this.totalSeconds = seconds;
        } else {
          this.totalSeconds += seconds;
        }
      });

      // Evento generationEnded: signaling-channel.js:310 emite { seconds, reason }
      realtimeClient.on('generationEnded', ({ seconds }) => {
        if (this.isClosedOrClosing()) return;
        if (typeof seconds === 'number' && seconds > 0) {
          this.totalSeconds = Math.max(this.totalSeconds, seconds);
        }
      });

      // Evento sessionEnded: motivos terminales del SDK
      realtimeClient.on('sessionEnded', ({ reason }) => {
        if (this.isClosedOrClosing()) return;
        this.log(`sessionEnded reason: ${reason}`);

        // Motivos normales de finalización por duración/timeout: stop() SIN onError
        const isNormalDurationEnd =
          reason === 'timeout' ||
          reason === 'duration_expired' ||
          reason === 'session_duration_exceeded' ||
          reason === 'max_duration' ||
          reason === 'completed' ||
          reason === 'normal';

        if (isNormalDurationEnd) {
          this.stop();
          return;
        }

        // Límite concurrente
        if (reason === 'session_limit') {
          const err = new Error('Decart: Concurrent session limit reached');
          this.lastError = err.message;
          this.config.onError(err, 'limit');
          this.stop();
          return;
        }

        // Motivos anómalos (moderation_violation, insufficient_credits, policy_violation, etc.)
        const err = new Error(`Decart session ended: ${reason}`);
        this.lastError = err.message;
        this.config.onError(err, 'webrtc_error');
        this.stop();
      });

      // Evento error
      realtimeClient.on('error', (sdkError: DecartSDKError) => {
        if (this.isClosedOrClosing()) return;
        const classified = this.classifyError(sdkError);
        const errMsg = sdkError.message || 'Decart SDK Error';
        this.log('error', { code: sdkError.code, message: errMsg, classified });
        this.lastError = errMsg;
        this.config.onError(new Error(errMsg), classified);
        this.stop();
      });
    } catch (err) {
      if (!this.isClosedOrClosing()) {
        const error = err instanceof Error ? err : new Error(String(err));
        const classified = this.classifyError(error);
        this.log('error on connect()', { message: error.message, classified });
        this.lastError = error.message;
        this.config.onError(error, classified);
        this.stop();
      }
    }
  }

  public sendGarment(referenceImageUrl: string): void {
    if (this.isClosedOrClosing() || !this.realtimeClient) {
      return;
    }

    // set() reemplaza TODO el estado: incluir prompt, image y enhance: false
    this.realtimeClient
      .set({
        prompt: DECART_TRYON_PROMPT,
        image: referenceImageUrl,
        enhance: false,
      })
      .catch((err) => {
        this.log('error sending garment update', err);
      });
  }

  public stop(): void {
    if (this.isClosedOrClosing()) {
      return;
    }
    this.state = 'closing';
    this.log('stop');

    if (this.realtimeClient) {
      try {
        this.realtimeClient.disconnect();
      } catch (err) {
        console.warn('[live-decart] error disconnecting realtime client:', err);
      }
      this.realtimeClient = null;
    }

    this.state = 'closed';
    this.closedAt = Date.now();
    this.log('close');
    console.log('[live] teardown complete', {
      provider: 'decart',
      state: this.state,
      seconds: this.totalSeconds,
    });

    try {
      this.config.onClose(this.totalSeconds);
    } catch (err) {
      console.warn('[live-decart] error in onClose callback:', err);
    }
  }
}
