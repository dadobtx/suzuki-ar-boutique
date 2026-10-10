import { fal } from '@fal-ai/client';

export type LiveTryOnManagerState =
  | 'idle'
  | 'connecting'
  | 'active'
  | 'closing'
  | 'closed';

export interface LiveTryOnConfig {
  token: string;
  maxSeconds: number;
  liveId: number;
  stream: MediaStream; // Stream reused from CameraView
  referenceImageUrl: string;
  onUpdate: (stream: MediaStream) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

export class LiveTryOnManager {
  private static activeInstances = new Set<LiveTryOnManager>();

  private config: LiveTryOnConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any | null = null;
  private pc: RTCPeerConnection | null = null;
  private state: LiveTryOnManagerState = 'idle';
  private connectionKey: string;
  public closedAt: number | null = null;
  private lastError: string | null = null;
  private hasReceivedRemoteTrack = false;

  constructor(config: LiveTryOnConfig) {
    this.config = config;
    this.connectionKey = `lucy2-vton-${config.liveId}-${crypto.randomUUID()}`;
    LiveTryOnManager.activeInstances.add(this);
  }

  public static activeCount(): number {
    return LiveTryOnManager.activeInstances.size;
  }

  public static _resetActiveInstancesForTesting(): void {
    LiveTryOnManager.activeInstances.clear();
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
    if (details !== undefined) {
      console.log(`[live] ${transition}`, details);
    } else {
      console.log(`[live] ${transition}`);
    }
  }

  public async start(): Promise<void> {
    if (this.state !== 'idle') return;
    this.state = 'connecting';
    this.log('connect', { connectionKey: this.connectionKey });

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
            this.log('iceservers', { count: servers?.length ?? 0 });
            await this.setupWebRTC(servers);
          } else if (result.type === 'answer' && this.pc) {
            this.log('answer');
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
            this.config.onError(new Error(errorMsg));
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
          this.config.onError(new Error(errorMsg));
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
        this.config.onError(error);
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
          this.log('track');
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
      this.log('offer');
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
    LiveTryOnManager.activeInstances.delete(this);
    this.log('close');

    try {
      this.config.onClose();
    } catch (err) {
      console.warn('[live] error in onClose callback:', err);
    }
  }
}
