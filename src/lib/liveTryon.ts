import { fal } from '@fal-ai/client';

export interface LiveTryOnConfig {
  token: string;
  maxSeconds: number;
  liveId: number;
  stream: MediaStream; // Stream reused from CameraView
  sku: string;
  onUpdate: (stream: MediaStream) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

export class LiveTryOnManager {
  private config: LiveTryOnConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any | null = null;
  private pc: RTCPeerConnection | null = null;

  constructor(config: LiveTryOnConfig) {
    this.config = config;
  }

  public async start() {
    try {
      // The typical signature for fal realtime using WebRTC.
      // The JWT comes from our Worker (/live/token); a custom tokenProvider
      // avoids the client's default token fetch (blocked by CSP and would
      // require exposing credentials in the browser).
      this.connection = await fal.realtime.connect('decart/lucy2-vton/realtime', {
        connectionKey: 'lucy2-vton',
        tokenProvider: async () => this.config.token,
        tokenExpirationSeconds: 60,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onResult: async (result: any) => {
          if (result.type === 'iceservers' || result.type === 'iceServers') {
            await this.setupWebRTC(
              result.iceservers || result.iceServers || result.ice_servers,
            );
          } else if (result.type === 'answer' && this.pc) {
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
            console.log('Live Try-On generation started');
          } else if (result.type === 'error') {
            this.config.onError(new Error(result.message || 'Error from fal realtime'));
            this.stop();
          }
        },
        onError: (err: unknown) => {
          const errorMsg = err instanceof Error ? err.message : 'Error in fal stream';
          this.config.onError(new Error(errorMsg));
          this.stop();
        },
      });

      // 1. Immediately send the prompt and reference image
      this.sendGarment(this.config.sku);
    } catch (err) {
      this.config.onError(err instanceof Error ? err : new Error(String(err)));
      this.stop();
    }
  }

  private async setupWebRTC(iceServers: RTCIceServer[], iceRestart = false) {
    if (!this.pc) {
      this.pc = new RTCPeerConnection({ iceServers });

      // Add local stream tracks
      this.config.stream.getTracks().forEach((track) => {
        this.pc?.addTrack(track, this.config.stream);
      });

      this.pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          this.config.onUpdate(event.streams[0]);
        }
      };

      this.pc.onicecandidate = (event) => {
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
    await this.pc.setLocalDescription(offer);

    if (this.connection) {
      this.connection.send({
        type: 'offer',
        sdp: offer.sdp,
      });
    }
  }

  public sendGarment(sku: string) {
    if (!this.connection) return;

    this.connection.send({
      prompt:
        'Replace the current top with the garment from the reference image. Preserve the exact logos, text, and graphics from the reference, keeping them sharp and readable',
      reference_image_url: `https://dadobtx.github.io/suzuki-ar-boutique/garments/${sku}.png`,
    });
  }

  public stop() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.connection) {
      this.connection.close?.();
      this.connection = null;
    }
    this.config.onClose();
  }
}
