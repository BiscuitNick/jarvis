import { useState, useCallback, useEffect } from 'react';
import { MediaItem, ApiResponse } from '@/types';

interface UseMediaLibraryOptions {
  autoLoad?: boolean;
}

export function useMediaLibrary(options: UseMediaLibraryOptions = {}) {
  const { autoLoad = true } = options;

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load media from API
  const loadMedia = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/media');
      
      if (!response.ok) {
        throw new Error(`Failed to load media: ${response.statusText}`);
      }

      const result: ApiResponse<MediaItem[]> = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to load media');
      }

      setMediaItems(result.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load media';
      setError(errorMessage);
      console.error('Failed to load media:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add new media item to the library
  const addMedia = useCallback((item: MediaItem) => {
    setMediaItems(prev => [item, ...prev]);
  }, []);

  // Add multiple media items
  const addMediaItems = useCallback((items: MediaItem[]) => {
    setMediaItems(prev => [...items, ...prev]);
  }, []);

  // Remove media item from library
  const removeMedia = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/media/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete media: ${response.statusText}`);
      }

      const result: ApiResponse<void> = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete media');
      }

      setMediaItems(prev => prev.filter(item => item.id !== id));
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete media';
      setError(errorMessage);
      console.error('Failed to delete media:', err);
      return false;
    }
  }, []);

  // Update media item metadata
  const updateMedia = useCallback((id: string, updates: Partial<MediaItem>) => {
    setMediaItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
    );
  }, []);

  // Get media item by ID
  const getMediaById = useCallback((id: string): MediaItem | undefined => {
    return mediaItems.find(item => item.id === id);
  }, [mediaItems]);

  // Filter media by type
  const filterByType = useCallback((type: MediaItem['type']): MediaItem[] => {
    return mediaItems.filter(item => item.type === type);
  }, [mediaItems]);

  // Search media by name
  const searchMedia = useCallback((query: string): MediaItem[] => {
    const lowerQuery = query.toLowerCase();
    return mediaItems.filter(item => 
      item.name.toLowerCase().includes(lowerQuery)
    );
  }, [mediaItems]);

  // Clear all media
  const clearMedia = useCallback(() => {
    setMediaItems([]);
  }, []);

  // Auto-load on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      loadMedia();
    }
  }, [autoLoad, loadMedia]);

  return {
    mediaItems,
    isLoading,
    error,
    loadMedia,
    addMedia,
    addMediaItems,
    removeMedia,
    updateMedia,
    getMediaById,
    filterByType,
    searchMedia,
    clearMedia,
  };
}
