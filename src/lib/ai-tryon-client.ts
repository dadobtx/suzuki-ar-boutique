export interface TryOnResponse {
  status: 'success' | 'error';
  imageUrl?: string;
  durationMs?: number;
  error?: string;
  /** Number of attempts that were made (1 if first try succeeded, 2 if a retry happened). */
  attempts?: number;
}

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1500;

/**
 * Returns true if the given error message describes a problem that retrying
 * the same input would NOT fix. We bail out on:
 *  - PoseError, NSFW, content moderation: FASHN rejected the input itself,
 *    a second attempt with the same photo will produce the same rejection.
 *  - Rate-limit: another attempt will fail the rate-limit check again.
 *  - Timeouts: if the first 30s call timed out, the retry will too, doubling
 *    the user's wait without realistic chance of success.
 * Anything else (network blip, 5xx, transient FASHN submit failure) IS worth
 * one extra attempt — those are typically caused by a hiccup that's already
 * resolved by the time we retry.
 */
function isNonRetryableError(errorMessage: string | undefined): boolean {
  if (!errorMessage) return false;
  return /(pose|nsfw|content|moderation|invalid_image|rate.?limit|too.?many|timed.?out|timeout)/i.test(
    errorMessage,
  );
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single attempt at calling the try-on backend. Pulled out of the public
 * function so we can retry it with the same already-encoded garment.
 */
async function singleAttempt(
  personImageBase64: string,
  garmentImageBase64: string,
  garmentDescription: string,
  backendUrl: string,
): Promise<TryOnResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(`${backendUrl}/tryon`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personImage: personImageBase64,
        garmentImageUrl: garmentImageBase64,
        garmentDescription,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

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

    return (await response.json()) as TryOnResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    const err = error as Error;
    if (err.name === 'AbortError') {
      return { status: 'error', error: 'Request timed out' };
    }
    return { status: 'error', error: err.message || 'Unknown error' };
  }
}

export async function generateTryOnPhoto(
  personImageBase64: string,
  garmentImageUrl: string,
  garmentDescription: string,
  backendUrl: string = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787',
): Promise<TryOnResponse> {
  // Pre-encode the garment ONCE so we don't pay the fetch+blob+reader cost
  // again on a retry. The garment is loaded from BASE_URL/garments/*.png which
  // is fast but still adds latency we don't want on the retry path.
  let garmentImageBase64: string;
  try {
    const resp = await fetch(garmentImageUrl);
    const blob = await resp.blob();
    garmentImageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return {
      status: 'error',
      error: `Failed to load garment image: ${(err as Error).message}`,
      attempts: 0,
    };
  }

  let lastResult: TryOnResponse = {
    status: 'error',
    error: 'No attempts made',
  };

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    lastResult = await singleAttempt(
      personImageBase64,
      garmentImageBase64,
      garmentDescription,
      backendUrl,
    );

    // Success — return immediately.
    if (lastResult.status === 'success') {
      return { ...lastResult, attempts: attempt };
    }

    // Non-retryable error (PoseError, NSFW, rate-limit, etc.) — don't waste
    // another call on the same input.
    if (isNonRetryableError(lastResult.error)) {
      return { ...lastResult, attempts: attempt };
    }

    // Retryable error but we've exhausted our budget — give up.
    if (attempt > MAX_RETRIES) {
      break;
    }

    // Retryable transient error — wait briefly and try once more.
    console.warn(
      `[ai-tryon] attempt ${attempt} failed with retryable error: ${lastResult.error}. Retrying in ${RETRY_DELAY_MS}ms...`,
    );
    await delay(RETRY_DELAY_MS);
  }

  return { ...lastResult, attempts: MAX_RETRIES + 1 };
}
