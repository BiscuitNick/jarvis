import React, { useState, useRef, useEffect } from 'react';
import { MediaItem } from '@/types';
import { cn } from '@/lib/utils';

interface MediaPreviewProps {
  media: MediaItem;
  className?: string;
  showDuration?: boolean;
  showDimensions?: boolean;
  lazy?: boolean;
}

export function MediaPreview({
  media,
  className,
  showDuration = true,
  showDimensions = false,
  lazy = true,
}: MediaPreviewProps) {
  const [isInView, setIsInView] = useState(!lazy);
  const [isLoaded, setIsLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lazy) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
          }
        });
      },
      {
        rootMargin: '50px',
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [lazy]);

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins + ':' + secs.toString().padStart(2, '0');
  };

  const formatDimensions = (width?: number, height?: number): string => {
    if (!width || !height) return '';
    return width + 'x' + height;
  };

  const getThumbnailUrl = (): string => {
    if (thumbnailError) {
      return media.url;
    }
    return media.thumbnailUrl || media.url;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-lg bg-muted',
        'aspect-video',
        className
      )}
    >
      {isInView && (
        <>
          {media.type === 'video' && (
            <>
              <img
                src={getThumbnailUrl()}
                alt={media.name}
                className={cn(
                  'w-full h-full object-cover transition-opacity duration-300',
                  isLoaded ? 'opacity-100' : 'opacity-0'
                )}
                onLoad={() => setIsLoaded(true)}
                onError={() => {
                  setThumbnailError(true);
                  setIsLoaded(true);
                }}
              />
              {showDuration && media.duration && (
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  {formatDuration(media.duration)}
                </div>
              )}
            </>
          )}

          {media.type === 'image' && (
            <img
              src={media.url}
              alt={media.name}
              className={cn(
                'w-full h-full object-cover transition-opacity duration-300',
                isLoaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={() => setIsLoaded(true)}
              onError={() => setIsLoaded(true)}
            />
          )}

          {media.type === 'audio' && (
            <div className="flex items-center justify-center w-full h-full bg-gradient-to-br from-purple-500 to-pink-500">
              <svg
                className="w-12 h-12 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              {showDuration && media.duration && (
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  {formatDuration(media.duration)}
                </div>
              )}
            </div>
          )}

          {showDimensions && media.width && media.height && (
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              {formatDimensions(media.width, media.height)}
            </div>
          )}

          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </>
      )}

      {!isInView && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="w-8 h-8 border-4 border-muted-foreground border-t-transparent rounded-full animate-spin opacity-50" />
        </div>
      )}
    </div>
  );
}
