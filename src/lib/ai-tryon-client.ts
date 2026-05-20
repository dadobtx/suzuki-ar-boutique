export interface TryOnResponse {
  status: 'success' | 'error';
  imageUrl?: string;
  durationMs?: number;
  error?: string;
}

export async function generateTryOnPhoto(
  personImageBase64: string,
  garmentImageUrl: string,
  garmentDescription: string,
  backendUrl: string = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787',
): Promise<TryOnResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    // Convert garment image to base64 for local dev support
    const resp = await fetch(garmentImageUrl);
    const blob = await resp.blob();
    const garmentImageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

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
        return { status: 'error', error: 'Too many requests. Please try again later.' };
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
