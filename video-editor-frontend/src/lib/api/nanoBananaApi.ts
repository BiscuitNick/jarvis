import { api } from './client';
import { config } from '../config';
import type { ApiResponse, NanoBananaRequest, NanoBananaResponse } from '../../types';

// Convert image file to base64
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix if present
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Convert URL to base64
export async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Generate image with Nano-Banana model
export async function generateImage(
  request: NanoBananaRequest
): Promise<ApiResponse<NanoBananaResponse>> {
  try {
    // Use custom Nano-Banana API URL if configured
    const endpoint = config.nanoBananaApiUrl || '/api/nano-banana/generate';

    const response = await api.post<NanoBananaResponse>(endpoint, {
      prompt: request.prompt,
      image_input: request.image_input,
      num_inference_steps: request.num_inference_steps || 4,
      guidance_scale: request.guidance_scale || 0,
      seed: request.seed,
    });

    return response;
  } catch (error) {
    console.error('Nano-Banana generation error:', error);
    return {
      success: false,
      error: 'Failed to generate image with Nano-Banana',
    };
  }
}

// Generate image from file
export async function generateImageFromFile(
  prompt: string,
  imageFile?: File,
  options?: {
    num_inference_steps?: number;
    guidance_scale?: number;
    seed?: number;
  }
): Promise<ApiResponse<NanoBananaResponse>> {
  let imageInput: string | undefined;

  if (imageFile) {
    try {
      imageInput = await fileToBase64(imageFile);
    } catch (error) {
      return {
        success: false,
        error: 'Failed to process image file',
      };
    }
  }

  return generateImage({
    prompt,
    image_input: imageInput,
    ...options,
  });
}

// Generate image from URL
export async function generateImageFromUrl(
  prompt: string,
  imageUrl?: string,
  options?: {
    num_inference_steps?: number;
    guidance_scale?: number;
    seed?: number;
  }
): Promise<ApiResponse<NanoBananaResponse>> {
  let imageInput: string | undefined;

  if (imageUrl) {
    try {
      // If it's a data URL, extract base64
      if (imageUrl.startsWith('data:')) {
        imageInput = imageUrl.split(',')[1];
      } else {
        // Otherwise, fetch and convert to base64
        imageInput = await urlToBase64(imageUrl);
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to process image URL',
      };
    }
  }

  return generateImage({
    prompt,
    image_input: imageInput,
    ...options,
  });
}

// Batch generate multiple variations
export async function generateVariations(
  prompt: string,
  imageInput?: string,
  count: number = 4
): Promise<ApiResponse<NanoBananaResponse[]>> {
  const promises = Array.from({ length: count }, (_, i) =>
    generateImage({
      prompt,
      image_input: imageInput,
      seed: Math.floor(Math.random() * 1000000), // Random seed for variations
    })
  );

  const results = await Promise.all(promises);

  const failedResults = results.filter((r) => !r.success);
  if (failedResults.length > 0) {
    return {
      success: false,
      error: `${failedResults.length} generation(s) failed`,
    };
  }

  return {
    success: true,
    data: results.map((r) => r.data!),
  };
}

// Check if Nano-Banana service is available
export async function checkNanoBananaHealth(): Promise<boolean> {
  try {
    const endpoint = config.nanoBananaApiUrl || '/api/nano-banana/health';
    const response = await api.get<{ status: string }>(endpoint);
    return response.success && response.data?.status === 'ok';
  } catch (error) {
    console.error('Nano-Banana health check failed:', error);
    return false;
  }
}

// Get generation history
export async function getGenerationHistory(): Promise<
  ApiResponse<NanoBananaResponse[]>
> {
  return api.get<NanoBananaResponse[]>('/api/nano-banana/history');
}

// Delete generation from history
export async function deleteGeneration(imageUrl: string): Promise<ApiResponse<void>> {
  return api.delete<void>('/api/nano-banana/history', {
    data: { imageUrl },
  });
}
