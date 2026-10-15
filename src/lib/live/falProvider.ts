import { fal } from '@fal-ai/client';
import type {
  LiveTryOnConfig,
  LiveTryOnProvider,
  LiveTryOnManagerState,
  LiveErrorReason,
} from './types';

export class FalLiveProvider implements LiveTryOnProvider {
  private config: LiveTryOnConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any | null = null;
  private pc: RTCPeerConnection | null = null;
  private state: LiveTryOnManagerState = 'idle';
  private connectionKey: string;
  public closedAt: number | null = null;
  private lastError: string | null = null;
  private hasReceivedRemoteTrack = false;
  private startTime = Date.now();

  constructor(config: LiveTryOnConfig) {
    this.config = config;
    this.connectionKey = `lucy2-vton-${config.liveId}-${crypto.randomUUID()}`;
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
    const prefix = `[live-fal] t+${elapsed}ms ${transition}`;
    if (details !== undefined) {
      console.log(prefix, details);
    } else {
      console.log(prefix);
    }
  }

  private classifyError(message: string): LiveErrorReason {
    const lower = message.toLowerCase();
    if (lower.includes('concurrent session limit') || lower.includes('limit reached')) {
      return 'limit';
    }
    if (lower.includes('websocket') || lower.includes('ws')) {
      return 'ws_error';
    }
    if (lower.includes('webrtc') || lower.includes('ice') || lower.includes('sdp')) {
      return 'webrtc_error';
    }
    return 'token_error';
  }

  public async start(): Promise<void> {
    if (this.state !== 'idle') return;
    this.state = 'connecting';
    this.log('connect() called', { connectionKey: this.connectionKey });

    try {
      this.connection = await fal.realtime.connect('decart/lucy2-vton/realtime', {
        connectionKey: this.connectionKey,
        throttleInterval: 0,
        tokenProvider: async () => {
          if (this.isClosedOrClosing()) {
            throw new Error('Live try-on session is closed');
          }
          return this.config.token;
        },
        tokenExpirationSeconds: 60,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onResult: async (result: any) => {
          if (this.isClosedOrClosing()) {
            return;
          }
          if (result.type === 'iceservers' || result.type === 'iceServers') {
            const servers = result.iceservers || result.iceServers || result.ice_servers;
            this.log('ice servers ready', { count: servers?.length ?? 0 });
            await this.setupWebRTC(servers);
          } else if (result.type === 'answer' && this.pc) {
            this.log('answer received');
            await this.pc.setRemoteDescription({
              type: 'answer',
              sdp: result.sdp as string,
            });
          } else if (result.type === 'icecandidate' && this.pc) {
            await this.pc.addIceCandidate(result.candidate as RTCIceCandidateInit);
          } else if (result.type === 'ice-restart') {
            const iceServers = [
              { urls: 'stun:stun.l.google.com:19302' },
              {
                urls: result.turn_config.server_url,
                username: result.turn_config.username,
                credential: result.turn_config.credential,
              },
            ];
            await this.setupWebRTC(iceServers, true);
          } else if (result.type === 'generation_started') {
            this.log('generation_started');
          } else if (result.type === 'error') {
            const errorMsg = result.message || 'Error from fal realtime';
            this.log('error', errorMsg);
            this.lastError = errorMsg;
            this.config.onError(new Error(errorMsg), this.classifyError(errorMsg));
            this.stop();
          }
        },
        onError: (err: unknown) => {
          if (this.isClosedOrClosing()) {
            return;
          }
          const errorMsg = err instanceof Error ? err.message : 'Error in fal stream';
          this.log('error', errorMsg);
          this.lastError = errorMsg;
          this.config.onError(new Error(errorMsg), this.classifyError(errorMsg));
          this.stop();
        },
      });

      if (this.isClosedOrClosing()) {
        return;
      }

      // Immediately send the prompt and reference image
      this.sendGarment(this.config.referenceImageUrl);
    } catch (err) {
      if (!this.isClosedOrClosing()) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.log('error', error.message);
        this.lastError = error.message;
        this.config.onError(error, this.classifyError(error.message));
        this.stop();
      }
    }
  }

  private async setupWebRTC(iceServers: RTCIceServer[], iceRestart = false) {
    if (this.isClosedOrClosing()) return;

    if (!this.pc) {
      this.pc = new RTCPeerConnection({ iceServers });

      // Add local stream tracks (do not stop these tracks on close; they belong to CameraView)
      this.config.stream.getTracks().forEach((track) => {
        this.pc?.addTrack(track, this.config.stream);
      });

      this.pc.ontrack = (event) => {
        if (this.isClosedOrClosing()) return;
        if (event.streams && event.streams[0]) {
          this.hasReceivedRemoteTrack = true;
          this.state = 'active';
          this.log('track received');
          this.config.onUpdate(event.streams[0]);
        }
      };

      this.pc.onicecandidate = (event) => {
        if (this.isClosedOrClosing()) return;
        if (event.candidate && this.connection) {
          this.connection.send({
            type: 'icecandidate',
            candidate: {
              candidate: event.candidate.candidate,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              sdpMid: event.candidate.sdpMid,
            },
          });
        }
      };
    } else if (iceServers) {
      this.pc.setConfiguration({ iceServers });
    }

    const offer = await this.pc.createOffer({ iceRestart });
    if (this.isClosedOrClosing()) return;
    await this.pc.setLocalDescription(offer);

    if (this.connection && !this.isClosedOrClosing()) {
      this.log('offer sent');
      this.connection.send({
        type: 'offer',
        sdp: offer.sdp,
      });
    }
  }

  public sendGarment(referenceImageUrl: string): void {
    if (this.isClosedOrClosing() || !this.connection) {
      return;
    }

    this.connection.send({
      prompt:
        'Replace the current top with the garment from the reference image. Preserve the exact logos, text, and graphics from the reference, keeping them sharp and readable',
      reference_image_url: referenceImageUrl,
    });
  }

  public stop(): void {
    if (this.isClosedOrClosing()) {
      return;
    }
    this.state = 'closing';
    this.log('stop');

    if (this.pc) {
      try {
        this.pc.getTransceivers?.().forEach((transceiver) => {
          transceiver.stop?.();
        });
      } catch {
        // Ignore transceiver stop error
      }
      try {
        this.pc.close();
      } catch {
        // Ignore pc close error
      }
      this.pc = null;
    }

    if (this.connection) {
      try {
        this.connection.close?.();
      } catch {
        // Ignore connection close error
      }
      this.connection = null;
    }

    this.state = 'closed';
    this.closedAt = Date.now();
    this.log('close');
    console.log('[live] teardown complete', { provider: 'fal', state: this.state });

    try {
      this.config.onClose();
    } catch (err) {
      console.warn('[live-fal] error in onClose callback:', err);
    }
  }
}
