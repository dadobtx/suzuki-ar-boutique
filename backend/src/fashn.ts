export interface FashnSubmitResponse {
  id: string;
}

export interface FashnStatusResponse {
  status: 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed';
  output: string[] | null;
  error: { name: string; message: string } | null;
}

export interface FashnResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export async function runFashnTryOn(
  apiKey: string,
  personImageBase64: string,
  garmentImageBase64: string,
): Promise<FashnSubmitResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for submit

  try {
    const response = await fetch('https://api.fashn.ai/v1/run', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_name: 'tryon-v1.6',
        inputs: {
          model_image: personImageBase64,
          garment_image: garmentImageBase64,
          mode: 'balanced',
          garment_photo_type: 'flat-lay',
          output_format: 'jpeg',
          num_samples: 1,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FASHN API submit error: ${response.status} ${errorText}`);
    }

    return (await response.json()) as FashnSubmitResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function pollFashn(
  predictionId: string,
  apiKey: string,
): Promise<FashnResult> {
  const POLL_INTERVAL_MS = 1500;
  const MAX_POLLS = 20; // 20 * 1500ms = 30s ceiling
  let pollCount = 0;

  while (pollCount < MAX_POLLS) {
    const response = await fetch(`https://api.fashn.ai/v1/status/${predictionId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `FASHN API poll error: ${response.status} ${errorText}`,
      };
    }

    const data = (await response.json()) as FashnStatusResponse;
    console.log(`[poll] ${predictionId}: status=${data.status}`);

    if (data.status === 'completed') {
      if (data.output && data.output.length > 0) {
        return { success: true, imageUrl: data.output[0] };
      }
      return { success: false, error: 'Completed but no output image returned' };
    }

    if (data.status === 'failed') {
      const errMsg = data.error
        ? `${data.error.name}: ${data.error.message}`
        : 'Model execution failed';
      return { success: false, error: errMsg };
    }

    pollCount++;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return {
    success: false,
    error: `Polling timeout after ${MAX_POLLS * POLL_INTERVAL_MS}ms`,
  };
}
