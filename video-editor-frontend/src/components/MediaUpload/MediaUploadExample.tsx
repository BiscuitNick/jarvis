import React, { useState } from 'react';
import { MediaUpload } from './MediaUpload';
import { MediaLibrary } from './MediaLibrary';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';
import { MediaItem, UploadMediaResponse } from '@/types';

export function MediaUploadExample() {
  const {
    mediaItems,
    addMedia,
    removeMedia,
  } = useMediaLibrary({ autoLoad: false });

  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);

  const handleUploadComplete = (response: UploadMediaResponse) => {
    const newMediaItem: MediaItem = {
      id: response.id,
      name: response.name,
      type: response.type,
      url: response.url,
      thumbnailUrl: response.thumbnailUrl,
      duration: response.duration,
      width: response.width,
      height: response.height,
      size: response.size,
      uploadedAt: new Date().toISOString(),
    };

    addMedia(newMediaItem);
  };

  const handleUploadError = (error: string) => {
    console.error('Upload error:', error);
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this media?');
    if (confirmed) {
      await removeMedia(id);
    }
  };

  const handleMediaDragStart = (media: MediaItem) => {
    setSelectedMedia(media);
    console.log('Started dragging:', media.name);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="max-w-2xl mx-auto">
        <MediaUpload
          onUploadComplete={handleUploadComplete}
          onUploadError={handleUploadError}
          maxFileSize={100 * 1024 * 1024}
          allowedTypes={['video/*', 'image/*']}
        />
      </div>

      <MediaLibrary
        mediaItems={mediaItems}
        onDelete={handleDelete}
        onMediaDragStart={handleMediaDragStart}
      />

      {selectedMedia && (
        <div className="fixed bottom-4 right-4 p-4 bg-card border rounded-lg shadow-lg max-w-xs">
          <p className="text-sm font-medium mb-1">Selected Media:</p>
          <p className="text-xs text-muted-foreground truncate">
            {selectedMedia.name}
          </p>
        </div>
      )}
    </div>
  );
}
