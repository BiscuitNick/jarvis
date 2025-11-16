import { api } from './client';
import type {
  ApiResponse,
  MediaItem,
  UploadMediaRequest,
  UploadMediaResponse,
} from '../../types';
import { validateFile } from '../config';

// Upload media file
export async function uploadMedia({
  file,
  onProgress,
}: UploadMediaRequest): Promise<ApiResponse<UploadMediaResponse>> {
  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Create form data
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', file.name);
  formData.append('size', file.size.toString());

  // Upload
  return api.upload<UploadMediaResponse>('/media/upload', formData, onProgress);
}

// Upload multiple media files
export async function uploadMultipleMedia(
  files: File[],
  onProgress?: (fileId: string, progress: number) => void
): Promise<ApiResponse<UploadMediaResponse[]>> {
  const uploads = files.map((file) =>
    uploadMedia({
      file,
      onProgress: onProgress ? (progress) => onProgress(file.name, progress) : undefined,
    })
  );

  const results = await Promise.all(uploads);

  // Check if all uploads succeeded
  const failedUploads = results.filter((r) => !r.success);
  if (failedUploads.length > 0) {
    return {
      success: false,
      error: `${failedUploads.length} upload(s) failed`,
    };
  }

  const data = results.map((r) => r.data!);
  return {
    success: true,
    data,
  };
}

// Get all media items
export async function getMediaItems(): Promise<ApiResponse<MediaItem[]>> {
  return api.get<MediaItem[]>('/media');
}

// Get media item by ID
export async function getMediaItem(id: string): Promise<ApiResponse<MediaItem>> {
  return api.get<MediaItem>(`/media/${id}`);
}

// Delete media item
export async function deleteMediaItem(id: string): Promise<ApiResponse<void>> {
  return api.delete<void>(`/media/${id}`);
}

// Delete multiple media items
export async function deleteMultipleMedia(ids: string[]): Promise<ApiResponse<void>> {
  return api.post<void>('/media/delete-multiple', { ids });
}

// Update media item metadata
export async function updateMediaItem(
  id: string,
  updates: Partial<MediaItem>
): Promise<ApiResponse<MediaItem>> {
  return api.patch<MediaItem>(`/media/${id}`, updates);
}

// Get media URL (for streaming/download)
export function getMediaUrl(id: string, type: 'stream' | 'download' = 'stream'): string {
  return `/media/${id}/${type}`;
}

// Generate thumbnail for video
export async function generateThumbnail(
  mediaId: string,
  timeOffset: number = 0
): Promise<ApiResponse<{ thumbnailUrl: string }>> {
  return api.post<{ thumbnailUrl: string }>(`/media/${mediaId}/thumbnail`, {
    timeOffset,
  });
}

// Get media metadata (duration, dimensions, etc.)
export async function getMediaMetadata(
  file: File
): Promise<{
  duration?: number;
  width?: number;
  height?: number;
  type: 'video' | 'image' | 'audio';
}> {
  return new Promise((resolve, reject) => {
    const fileType = file.type.split('/')[0];

    if (fileType === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          type: 'video',
        });
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Failed to load video metadata'));
      };

      video.src = URL.createObjectURL(file);
    } else if (fileType === 'image') {
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve({
          width: img.width,
          height: img.height,
          type: 'image',
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image metadata'));
      };

      img.src = URL.createObjectURL(file);
    } else if (fileType === 'audio') {
      const audio = new Audio();
      audio.preload = 'metadata';

      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);
        resolve({
          duration: audio.duration,
          type: 'audio',
        });
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        reject(new Error('Failed to load audio metadata'));
      };

      audio.src = URL.createObjectURL(file);
    } else {
      reject(new Error('Unsupported file type'));
    }
  });
}
