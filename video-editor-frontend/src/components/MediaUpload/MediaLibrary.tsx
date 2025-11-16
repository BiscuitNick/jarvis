import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MediaItem } from '@/types';
import { MediaPreview } from './MediaPreview';
import { cn } from '@/lib/utils';
import { Search, Trash2, Film, Image as ImageIcon, Music, Grid3x3, List } from 'lucide-react';

interface MediaLibraryProps {
  mediaItems: MediaItem[];
  onDelete?: (id: string) => void;
  onMediaDragStart?: (media: MediaItem) => void;
  className?: string;
}

export function MediaLibrary({
  mediaItems,
  onDelete,
  onMediaDragStart,
  className,
}: MediaLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MediaItem['type'] | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredItems = mediaItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || item.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleDragStart = (e: React.DragEvent, media: MediaItem) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(media));
    e.dataTransfer.setData('text/plain', media.id);
    
    onMediaDragStart?.(media);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins + ':' + secs.toString().padStart(2, '0');
  };

  const getTypeIcon = (type: MediaItem['type']) => {
    switch (type) {
      case 'video':
        return <Film className="w-4 h-4" />;
      case 'image':
        return <ImageIcon className="w-4 h-4" />;
      case 'audio':
        return <Music className="w-4 h-4" />;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Media Library</CardTitle>
        <CardDescription>
          {mediaItems.length} {mediaItems.length === 1 ? 'item' : 'items'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex rounded-lg border">
              <Button
                variant={filterType === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilterType('all')}
                className="rounded-r-none"
              >
                All
              </Button>
              <Button
                variant={filterType === 'video' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilterType('video')}
                className="rounded-none border-x"
              >
                <Film className="w-4 h-4" />
              </Button>
              <Button
                variant={filterType === 'image' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilterType('image')}
                className="rounded-none"
              >
                <ImageIcon className="w-4 h-4" />
              </Button>
              <Button
                variant={filterType === 'audio' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilterType('audio')}
                className="rounded-l-none border-l"
              >
                <Music className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex rounded-lg border">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="rounded-r-none"
              >
                <Grid3x3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-l-none border-l"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Film className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {searchQuery || filterType !== 'all'
                ? 'No media found'
                : 'No media uploaded yet'}
            </p>
            {searchQuery && (
              <Button
                variant="link"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="mt-2"
              >
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4'
                : 'space-y-2'
            )}
          >
            {filteredItems.map((media) => (
              <div
                key={media.id}
                draggable
                onDragStart={(e) => handleDragStart(e, media)}
                className={cn(
                  'group relative rounded-lg overflow-hidden transition-all cursor-move',
                  'hover:shadow-lg hover:scale-[1.02]',
                  viewMode === 'list' && 'flex items-center gap-3 p-2 bg-muted/30'
                )}
              >
                {viewMode === 'grid' ? (
                  <>
                    <MediaPreview media={media} showDuration />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate mb-1">
                            {media.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs opacity-90">
                            {getTypeIcon(media.type)}
                            <span>{formatFileSize(media.size)}</span>
                            {media.duration && (
                              <span>{formatDuration(media.duration)}</span>
                            )}
                          </div>
                        </div>
                        {onDelete && (
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(media.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-24 h-16 flex-shrink-0">
                      <MediaPreview media={media} showDuration={false} lazy={false} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate mb-1">
                        {media.name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {getTypeIcon(media.type)}
                        <span>{formatFileSize(media.size)}</span>
                        {media.duration && (
                          <span>{formatDuration(media.duration)}</span>
                        )}
                        {media.width && media.height && (
                          <span>{media.width}x{media.height}</span>
                        )}
                      </div>
                    </div>
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(media.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
