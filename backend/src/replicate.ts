export interface ReplicateResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string | null;
}

export async function runReplicateStylize(
  token: string,
  imageUrl: string,
  prompt: string,
): Promise<ReplicateResult> {
  const submitUrl = 'https://api.replicate.com/v1/models/google/nano-banana/predictions';
  const max429Retries = 3;
  let attempt429 = 0;
  let accumulatedWaitMs = 0;

  while (attempt429 <= max429Retries) {
    try {
      const response = await fetch(submitUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'wait',
        },
        body: JSON.stringify({
          input: {
            prompt,
            image_input: [imageUrl],
            aspect_ratio: 'match_input_image',
            output_format: 'jpg',
          },
        }),
      });

      if (response.status === 429) {
        attempt429++;
        if (attempt429 > max429Retries) {
          return {
            success: false,
            error: 'Replicate API rate limit exceeded. Retries exhausted. Status 429.',
          };
        }

        let retryAfterSecs = 10;
        try {
          const body = (await response.json()) as { retry_after?: unknown };
          if (body && typeof body.retry_after === 'number') {
            retryAfterSecs = body.retry_after;
          } else if (body && typeof body.retry_after === 'string') {
            const parsed = parseFloat(body.retry_after);
            if (!isNaN(parsed)) {
              retryAfterSecs = parsed;
            }
          }
        } catch {
          // ignore parsing error, default to 10
        }

        const waitMs = (retryAfterSecs + 1) * 1000;
        accumulatedWaitMs += waitMs;
        console.warn(
          `[replicate] 429 throttled, retrying in ${retryAfterSecs + 1}s (attempt ${attempt429}/3).`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Replicate API error: ${response.status} ${errorText}`,
        };
      }

      const prediction = (await response.json()) as ReplicatePrediction;

      if (prediction.status === 'succeeded') {
        const outputUrl = extractOutputUrl(prediction.output);
        if (outputUrl) {
          return { success: true, imageUrl: outputUrl };
        }
        return { success: false, error: 'Succeeded but no output image returned' };
      }

      if (prediction.status === 'failed') {
        return { success: false, error: prediction.error || 'Model execution failed' };
      }

      // Max total budget for stylize is 60s
      const maxBudgetMs = 60000;
      const remainingBudgetMs = Math.max(1000, maxBudgetMs - accumulatedWaitMs);

      // If still starting/processing, poll
      return await pollReplicate(prediction.id, token, remainingBudgetMs);
    } catch (error) {
      const err = error as Error;
      return { success: false, error: err.message || 'Unknown Replicate error' };
    }
  }

  return { success: false, error: 'Unexpected end of loop' };
}

function extractOutputUrl(output: unknown): string | undefined {
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === 'string') {
      return first;
    }
  }
  if (typeof output === 'string') {
    return output;
  }
  return undefined;
}

async function pollReplicate(
  predictionId: string,
  token: string,
  maxBudgetMs: number,
): Promise<ReplicateResult> {
  const POLL_INTERVAL_MS = 1500;
  const maxPolls = Math.max(1, Math.floor(maxBudgetMs / POLL_INTERVAL_MS));
  let pollCount = 0;

  while (pollCount < maxPolls) {
    const response = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Replicate API poll error: ${response.status} ${errorText}`,
      };
    }

    const prediction = (await response.json()) as ReplicatePrediction;
    console.log(`[replicate-poll] ${predictionId}: status=${prediction.status}`);

    if (prediction.status === 'succeeded') {
      const outputUrl = extractOutputUrl(prediction.output);
      if (outputUrl) {
        return { success: true, imageUrl: outputUrl };
      }
      return { success: false, error: 'Succeeded but no output image returned' };
    }

    if (prediction.status === 'failed') {
      return { success: false, error: prediction.error || 'Model execution failed' };
    }

    pollCount++;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return {
    success: false,
    error: `Polling timeout after ${maxPolls * POLL_INTERVAL_MS}ms`,
  };
}
