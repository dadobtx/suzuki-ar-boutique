export interface StylizeResponse {
  status: 'success' | 'error';
  imageUrl?: string;
  durationMs?: number;
  error?: string;
  attempts?: number;
}

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1500;

function isNonRetryableError(errorMessage: string | undefined): boolean {
  if (!errorMessage) return false;
  return /(rate.?limit|too.?many|timed.?out|timeout|abort)/i.test(errorMessage);
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let activeAbortController: AbortController | null = null;

export function cancelStylizeRequests() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

export function createNewStylizeController(): AbortSignal {
  cancelStylizeRequests();
  activeAbortController = new AbortController();
  return activeAbortController.signal;
}

async function singleAttempt(
  imageUrl: string,
  styleId: string,
  signal: AbortSignal,
  backendUrl: string,
): Promise<StylizeResponse> {
  const controller = new AbortController();

  const abortHandler = () => {
    controller.abort();
  };
  signal.addEventListener('abort', abortHandler);

  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const response = await fetch(`${backendUrl}/stylize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl,
        styleId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    signal.removeEventListener('abort', abortHandler);

    if (!response.ok) {
      if (response.status === 429) {
        return {
          status: 'error',
          error: 'Too many requests. Please try again later.',
        };
      }
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.error || `HTTP error ${response.status}`);
    }

    return (await response.json()) as StylizeResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    signal.removeEventListener('abort', abortHandler);
    const err = error as Error;
    if (err.name === 'AbortError') {
      if (signal.aborted) {
        return { status: 'error', error: 'Request aborted' };
      }
      return { status: 'error', error: 'Request timed out' };
    }
    return { status: 'error', error: err.message || 'Unknown error' };
  }
}

export async function generateStylizedPhoto(
  imageUrl: string,
  styleId: string,
  signal: AbortSignal,
  backendUrl: string = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787',
): Promise<StylizeResponse> {
  let lastResult: StylizeResponse = {
    status: 'error',
    error: 'No attempts made',
  };

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    if (signal.aborted) {
      return { status: 'error', error: 'Request aborted', attempts: attempt - 1 };
    }

    lastResult = await singleAttempt(imageUrl, styleId, signal, backendUrl);

    if (lastResult.status === 'success') {
      return { ...lastResult, attempts: attempt };
    }

    if (isNonRetryableError(lastResult.error) || signal.aborted) {
      return { ...lastResult, attempts: attempt };
    }

    if (attempt > MAX_RETRIES) {
      break;
    }

    console.warn(
      `[ai-stylize] attempt ${attempt} failed with retryable error: ${lastResult.error}. Retrying in ${RETRY_DELAY_MS}ms...`,
    );
    await delay(RETRY_DELAY_MS);
  }

  return { ...lastResult, attempts: MAX_RETRIES + 1 };
}
