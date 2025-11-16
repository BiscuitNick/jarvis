import type { AppConfig } from '../types';

// Load environment variables
const getEnvVar = (key: string, defaultValue: string = ''): string => {
  return import.meta.env[key] || defaultValue;
};

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = import.meta.env[key];
  return value ? Number(value) : defaultValue;
};

const getEnvArray = (key: string, defaultValue: string[]): string[] => {
  const value = import.meta.env[key];
  return value ? value.split(',').map((s: string) => s.trim()) : defaultValue;
};

// Application configuration
export const config: AppConfig = {
  // API endpoints
  apiBaseUrl: getEnvVar('VITE_API_BASE_URL', 'http://localhost:3000/api'),
  nanoBananaApiUrl: getEnvVar('VITE_NANO_BANANA_API_URL', 'http://localhost:3000/api/nano-banana'),

  // Upload settings
  maxUploadSize: getEnvNumber('VITE_MAX_UPLOAD_SIZE', 500 * 1024 * 1024), // 500MB default

  // Supported formats
  supportedVideoFormats: getEnvArray('VITE_SUPPORTED_VIDEO_FORMATS', [
    'mp4',
    'webm',
    'mov',
    'avi',
    'mkv',
  ]),
  supportedImageFormats: getEnvArray('VITE_SUPPORTED_IMAGE_FORMATS', [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'svg',
  ]),
  supportedAudioFormats: getEnvArray('VITE_SUPPORTED_AUDIO_FORMATS', [
    'mp3',
    'wav',
    'ogg',
    'aac',
    'm4a',
  ]),

  // Timeline defaults
  snapInterval: getEnvNumber('VITE_SNAP_INTERVAL', 0.1), // 100ms
  defaultImageDuration: getEnvNumber('VITE_DEFAULT_IMAGE_DURATION', 5), // 5 seconds
  defaultZoom: getEnvNumber('VITE_DEFAULT_ZOOM', 50), // 50 pixels per second
  minZoom: 10,
  maxZoom: 500,
  defaultTrackHeight: 120,
};

// Validation
export const validateFile = (file: File): { valid: boolean; error?: string } => {
  // Check file size
  if (file.size > config.maxUploadSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${config.maxUploadSize / 1024 / 1024}MB`,
    };
  }

  // Get file extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension) {
    return { valid: false, error: 'File has no extension' };
  }

  // Check if format is supported
  const allSupportedFormats = [
    ...config.supportedVideoFormats,
    ...config.supportedImageFormats,
    ...config.supportedAudioFormats,
  ];

  if (!allSupportedFormats.includes(extension)) {
    return {
      valid: false,
      error: `File format .${extension} is not supported`,
    };
  }

  return { valid: true };
};

// Get media type from file extension
export const getMediaType = (filename: string): 'video' | 'image' | 'audio' | null => {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension) return null;

  if (config.supportedVideoFormats.includes(extension)) return 'video';
  if (config.supportedImageFormats.includes(extension)) return 'image';
  if (config.supportedAudioFormats.includes(extension)) return 'audio';

  return null;
};

// Format bytes to human readable
export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Format duration to timecode (HH:MM:SS:FF)
export const formatTimecode = (seconds: number, framerate: number = 30): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * framerate);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
};

// Parse timecode to seconds
export const parseTimecode = (timecode: string, framerate: number = 30): number => {
  const parts = timecode.split(':');
  if (parts.length !== 4) return 0;

  const [hours, minutes, seconds, frames] = parts.map(Number);
  return hours * 3600 + minutes * 60 + seconds + frames / framerate;
};

// Format duration to readable time (MM:SS)
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default config;
