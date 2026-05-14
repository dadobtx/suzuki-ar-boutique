/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __GIT_SHA__: string;
declare const __BUILD_DATE__: string;

// requestVideoFrameCallback API (not yet in default TS lib)
interface VideoFrameCallbackMetadata {
  presentationTime: DOMHighResTimeStamp;
  expectedDisplayTime: DOMHighResTimeStamp;
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
  processingDuration?: number;
  captureTime?: DOMHighResTimeStamp;
  receiveTime?: DOMHighResTimeStamp;
  rtpTimestamp?: number;
}

interface HTMLVideoElement {
  requestVideoFrameCallback(
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void,
  ): number;
  cancelVideoFrameCallback(handle: number): void;
}

// Vite worker imports
declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module '*?worker&inline' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module '*?sharedworker' {
  const workerConstructor: {
    new (): SharedWorker;
  };
  export default workerConstructor;
}
