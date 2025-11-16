import { useState, useCallback } from 'react';
import {
  generateImage,
  generateImageFromFile,
  generateImageFromUrl,
  generateVariations,
  checkNanoBananaHealth,
} from '../lib/api/nanoBananaApi';
import type { NanoBananaRequest, NanoBananaResponse } from '../types';

interface UseNanoBananaResult {
  generating: boolean;
  error: string | null;
  result: NanoBananaResponse | null;
  generate: (request: NanoBananaRequest) => Promise<NanoBananaResponse | null>;
  generateFromFile: (
    prompt: string,
    imageFile?: File,
    options?: Partial<NanoBananaRequest>
  ) => Promise<NanoBananaResponse | null>;
  generateFromUrl: (
    prompt: string,
    imageUrl?: string,
    options?: Partial<NanoBananaRequest>
  ) => Promise<NanoBananaResponse | null>;
  generateMultiple: (
    prompt: string,
    imageInput?: string,
    count?: number
  ) => Promise<NanoBananaResponse[] | null>;
  checkHealth: () => Promise<boolean>;
  reset: () => void;
}

export function useNanoBanana(): UseNanoBananaResult {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NanoBananaResponse | null>(null);

  const generate = useCallback(async (request: NanoBananaRequest) => {
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const response = await generateImage(request);

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Generation failed');
      }

      setResult(response.data);
      return response.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Generation failed';
      setError(errorMessage);
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const generateFromFile = useCallback(
    async (
      prompt: string,
      imageFile?: File,
      options?: Partial<NanoBananaRequest>
    ): Promise<NanoBananaResponse | null> => {
      setGenerating(true);
      setError(null);
      setResult(null);

      try {
        const response = await generateImageFromFile(prompt, imageFile, options);

        if (!response.success || !response.data) {
          throw new Error(response.error || 'Generation failed');
        }

        setResult(response.data);
        return response.data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Generation failed';
        setError(errorMessage);
        return null;
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const generateFromUrl = useCallback(
    async (
      prompt: string,
      imageUrl?: string,
      options?: Partial<NanoBananaRequest>
    ): Promise<NanoBananaResponse | null> => {
      setGenerating(true);
      setError(null);
      setResult(null);

      try {
        const response = await generateImageFromUrl(prompt, imageUrl, options);

        if (!response.success || !response.data) {
          throw new Error(response.error || 'Generation failed');
        }

        setResult(response.data);
        return response.data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Generation failed';
        setError(errorMessage);
        return null;
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const generateMultiple = useCallback(
    async (
      prompt: string,
      imageInput?: string,
      count: number = 4
    ): Promise<NanoBananaResponse[] | null> => {
      setGenerating(true);
      setError(null);
      setResult(null);

      try {
        const response = await generateVariations(prompt, imageInput, count);

        if (!response.success || !response.data) {
          throw new Error(response.error || 'Generation failed');
        }

        // Set the first result
        if (response.data.length > 0) {
          setResult(response.data[0]);
        }

        return response.data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Generation failed';
        setError(errorMessage);
        return null;
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      return await checkNanoBananaHealth();
    } catch (err) {
      console.error('Health check failed:', err);
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setGenerating(false);
    setError(null);
    setResult(null);
  }, []);

  return {
    generating,
    error,
    result,
    generate,
    generateFromFile,
    generateFromUrl,
    generateMultiple,
    checkHealth,
    reset,
  };
}
