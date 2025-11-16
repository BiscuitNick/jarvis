import React, { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFileUpload } from '@/hooks/useFileUpload';
import { UploadMediaResponse } from '@/types';
import { cn } from '@/lib/utils';
import { Upload, Link as LinkIcon, X, CheckCircle, AlertCircle } from 'lucide-react';

interface MediaUploadProps {
  onUploadComplete?: (media: UploadMediaResponse) => void;
  onUploadError?: (error: string) => void;
  maxFileSize?: number;
  allowedTypes?: string[];
  className?: string;
}

export function MediaUpload({
  onUploadComplete,
  onUploadError,
  maxFileSize,
  allowedTypes,
  className,
}: MediaUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const { uploads, isUploading, uploadFiles, uploadFromUrl } = useFileUpload({
    onSuccess: onUploadComplete,
    onError: onUploadError,
    maxFileSize,
    allowedTypes,
  });

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    uploadFiles(fileArray);
  }, [uploadFiles]);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    handleFileSelect(files);
  };

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);

    if (!urlInput.trim()) {
      setUrlError('Please enter a URL');
      return;
    }

    if (!validateUrl(urlInput)) {
      setUrlError('Please enter a valid URL');
      return;
    }

    const result = await uploadFromUrl(urlInput);
    if (result) {
      setUrlInput('');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Upload Media</CardTitle>
        <CardDescription>
          Upload videos or images, or provide a URL
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-8 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50',
            isUploading && 'opacity-50 pointer-events-none'
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Drag and drop files here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Supports videos and images
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleButtonClick}
              disabled={isUploading}
            >
              Choose Files
            </Button>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <form onSubmit={handleUrlSubmit} className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="url"
                placeholder="Enter media URL"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setUrlError(null);
                }}
                className="pl-9"
                disabled={isUploading}
              />
            </div>
            <Button type="submit" disabled={isUploading || !urlInput.trim()}>
              Upload
            </Button>
          </div>
          {urlError && (
            <p className="text-sm text-destructive">{urlError}</p>
          )}
        </form>

        {uploads.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <h4 className="text-sm font-medium">Uploads</h4>
            {uploads.map((upload) => (
              <div
                key={upload.fileId}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium truncate">
                      {upload.fileName}
                    </p>
                    {getStatusIcon(upload.status)}
                  </div>
                  
                  {upload.status === 'uploading' && (
                    <Progress value={upload.progress} className="h-1" />
                  )}
                  
                  {upload.error && (
                    <p className="text-xs text-destructive mt-1">
                      {upload.error}
                    </p>
                  )}
                  
                  {upload.status === 'completed' && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Upload complete
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
