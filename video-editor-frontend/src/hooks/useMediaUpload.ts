import { useState, useCallback } from 'react';
import { uploadMedia, uploadMultipleMedia, getMediaMetadata } from '../lib/api/mediaApi';
import { useMediaStore } from '../store/mediaStore';
import type { MediaItem, UploadMediaResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface UseMediaUploadResult {
  uploading: boolean;
  uploadProgress: Map<string, number>;
  uploadFile: (file: File) => Promise<MediaItem | null>;
  uploadFiles: (files: File[]) => Promise<MediaItem[]>;
  cancelUpload: (fileId: string) => void;
}

export function useMediaUpload(): UseMediaUploadResult {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());

  const addMediaItem = useMediaStore((state) => state.addMediaItem);
  const addUpload = useMediaStore((state) => state.addUpload);
  const updateUpload = useMediaStore((state) => state.updateUpload);
  const removeUpload = useMediaStore((state) => state.removeUpload);

  const uploadFile = useCallback(
    async (file: File): Promise<MediaItem | null> => {
      const fileId = uuidv4();

      // Add to upload tracking
      addUpload({
        fileId,
        fileName: file.name,
        progress: 0,
        status: 'pending',
      });

      try {
        // Update status to uploading
        updateUpload(fileId, { status: 'uploading' });

        // Get metadata
        let metadata: any = {};
        try {
          metadata = await getMediaMetadata(file);
        } catch (error) {
          console.warn('Failed to get metadata:', error);
        }

        // Upload file
        const response = await uploadMedia({
          file,
          onProgress: (progress) => {
            setUploadProgress((prev) => new Map(prev).set(fileId, progress));
            updateUpload(fileId, { progress });
          },
        });

        if (!response.success || !response.data) {
          throw new Error(response.error || 'Upload failed');
        }

        // Update status to processing
        updateUpload(fileId, { status: 'processing' });

        // Create media item
        const mediaItem: MediaItem = {
          id: response.data.id,
          name: response.data.name,
          type: response.data.type,
          url: response.data.url,
          thumbnailUrl: response.data.thumbnailUrl,
          duration: response.data.duration || metadata.duration,
          width: response.data.width || metadata.width,
          height: response.data.height || metadata.height,
          size: response.data.size,
          uploadedAt: new Date().toISOString(),
          metadata,
        };

        // Add to media store
        addMediaItem(mediaItem);

        // Update status to completed
        updateUpload(fileId, { status: 'completed', progress: 100 });

        // Clean up upload tracking after a delay
        setTimeout(() => {
          removeUpload(fileId);
          setUploadProgress((prev) => {
            const newMap = new Map(prev);
            newMap.delete(fileId);
            return newMap;
          });
        }, 2000);

        return mediaItem;
      } catch (error) {
        console.error('Upload error:', error);
        updateUpload(fileId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Upload failed',
        });

        // Clean up upload tracking after a delay
        setTimeout(() => {
          removeUpload(fileId);
          setUploadProgress((prev) => {
            const newMap = new Map(prev);
            newMap.delete(fileId);
            return newMap;
          });
        }, 5000);

        return null;
      }
    },
    [addMediaItem, addUpload, updateUpload, removeUpload]
  );

  const uploadFiles = useCallback(
    async (files: File[]): Promise<MediaItem[]> => {
      setUploading(true);

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const results = await Promise.all(uploadPromises);
        return results.filter((item): item is MediaItem => item !== null);
      } finally {
        setUploading(false);
      }
    },
    [uploadFile]
  );

  const cancelUpload = useCallback(
    (fileId: string) => {
      // Remove from upload tracking
      removeUpload(fileId);
      setUploadProgress((prev) => {
        const newMap = new Map(prev);
        newMap.delete(fileId);
        return newMap;
      });
    },
    [removeUpload]
  );

  return {
    uploading,
    uploadProgress,
    uploadFile,
    uploadFiles,
    cancelUpload,
  };
}
