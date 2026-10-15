import { FalLiveProvider } from './live/falProvider';
import { DecartLiveProvider } from './live/decartProvider';
import type {
  LiveTryOnConfig,
  LiveTryOnProvider,
  LiveTryOnManagerState,
  LiveProviderName,
  LiveErrorReason,
} from './live/types';

export type {
  LiveTryOnConfig,
  LiveTryOnProvider,
  LiveTryOnManagerState,
  LiveProviderName,
  LiveErrorReason,
};

export class LiveTryOnManager implements LiveTryOnProvider {
  private static activeInstances = new Set<LiveTryOnManager>();

  private provider: LiveTryOnProvider;

  constructor(config: LiveTryOnConfig) {
    const providerName: LiveProviderName =
      (
        config.provider ||
        (typeof import.meta !== 'undefined' && import.meta.env
          ? import.meta.env.VITE_LIVE_PROVIDER
          : undefined) ||
        'decart'
      ).toLowerCase() === 'fal'
        ? 'fal'
        : 'decart';

    // Wrap onClose to ensure activeInstances cleanup
    const originalOnClose = config.onClose;
    const wrappedConfig: LiveTryOnConfig = {
      ...config,
      onClose: (seconds?: number) => {
        LiveTryOnManager.activeInstances.delete(this);
        originalOnClose(seconds);
      },
    };

    if (providerName === 'fal') {
      this.provider = new FalLiveProvider(wrappedConfig);
    } else {
      this.provider = new DecartLiveProvider(wrappedConfig);
    }

    LiveTryOnManager.activeInstances.add(this);
  }

  public static activeCount(): number {
    return LiveTryOnManager.activeInstances.size;
  }

  public static _resetActiveInstancesForTesting(): void {
    LiveTryOnManager.activeInstances.clear();
  }

  public getState(): LiveTryOnManagerState {
    return this.provider.getState();
  }

  public getConnectionKey(): string {
    return this.provider.getConnectionKey();
  }

  public getLastError(): string | null {
    return this.provider.getLastError();
  }

  public hadRemoteVideo(): boolean {
    return this.provider.hadRemoteVideo();
  }

  public get closedAt(): number | null {
    return this.provider.closedAt;
  }

  public async start(): Promise<void> {
    return this.provider.start();
  }

  public sendGarment(referenceImageUrl: string): void {
    this.provider.sendGarment(referenceImageUrl);
  }

  public stop(): void {
    LiveTryOnManager.activeInstances.delete(this);
    this.provider.stop();
  }
}
