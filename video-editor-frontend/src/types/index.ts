// Core timeline types
export interface TimelineItem {
  id: string;
  trackId: string;
  type: 'video' | 'image' | 'audio' | 'text';
  startTime: number; // in seconds
  duration: number; // in seconds
  mediaUrl?: string;
  thumbnailUrl?: string;
  name: string;
  locked?: boolean;
  muted?: boolean;
  volume?: number; // 0-100
  opacity?: number; // 0-100

  // Position and transform (for video/image)
  position?: {
    x: number;
    y: number;
  };
  scale?: {
    x: number;
    y: number;
  };
  rotation?: number;

  // Text specific
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;

  // Trim/crop
  trimStart?: number;
  trimEnd?: number;

  // Effects
  effects?: Effect[];
}

export interface Effect {
  id: string;
  type: 'filter' | 'transition' | 'animation';
  name: string;
  parameters: Record<string, any>;
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text';
  order: number;
  locked?: boolean;
  hidden?: boolean;
  height?: number; // in pixels
}

export interface TimelineState {
  tracks: Track[];
  items: TimelineItem[];
  playheadPosition: number; // in seconds
  duration: number; // total timeline duration in seconds
  zoom: number; // pixels per second
  selectedItemIds: string[];
}

// Media library types
export interface MediaItem {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  url: string;
  thumbnailUrl?: string;
  duration?: number; // for video/audio
  width?: number; // for video/image
  height?: number; // for video/image
  size: number; // file size in bytes
  uploadedAt: string;
  metadata?: Record<string, any>;
}

export interface MediaUploadProgress {
  fileId: string;
  fileName: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
}

// Editor state types
export interface EditorState {
  selectedItemIds: string[];
  selectedTrackId: string | null;
  zoom: number; // pixels per second
  snapEnabled: boolean;
  snapInterval: number; // in seconds
  playing: boolean;
  loop: boolean;
  viewportWidth: number;
  viewportHeight: number;
  gridVisible: boolean;
  rulerVisible: boolean;
}

// API types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UploadMediaRequest {
  file: File;
  onProgress?: (progress: number) => void;
}

export interface UploadMediaResponse {
  id: string;
  url: string;
  thumbnailUrl?: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  duration?: number;
  width?: number;
  height?: number;
  size: number;
}

export interface NanoBananaRequest {
  prompt: string;
  image_input?: string; // base64 or URL
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
}

export interface NanoBananaResponse {
  image_url: string;
  s3_url: string;
  seed: number;
  generation_time: number;
}

export interface ExportTimelineRequest {
  timeline: {
    tracks: Track[];
    items: TimelineItem[];
    duration: number;
  };
  settings: {
    width: number;
    height: number;
    framerate: number;
    format: 'mp4' | 'webm' | 'mov';
    quality: 'low' | 'medium' | 'high' | 'ultra';
    audioCodec?: string;
    videoCodec?: string;
  };
}

export interface ExportTimelineResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  outputUrl?: string;
  error?: string;
}

export interface ExportJobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  outputUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// Configuration types
export interface AppConfig {
  apiBaseUrl: string;
  nanoBananaApiUrl: string;
  maxUploadSize: number; // in bytes
  supportedVideoFormats: string[];
  supportedImageFormats: string[];
  supportedAudioFormats: string[];
  snapInterval: number; // in seconds
  defaultImageDuration: number; // in seconds
  defaultZoom: number; // pixels per second
  minZoom: number;
  maxZoom: number;
  defaultTrackHeight: number; // in pixels
}

// Storage types
export interface SavedProject {
  id: string;
  name: string;
  timeline: TimelineState;
  media: MediaItem[];
  savedAt: string;
  version: string;
}

// Utility types
export type TimeFormat = 'seconds' | 'frames' | 'timecode';

export interface TimePosition {
  seconds: number;
  frames: number;
  timecode: string; // HH:MM:SS:FF
}

// Export additional editor control types
export type {
  ClipType,
  TimeRange,
  BaseClip,
  VideoClip,
  AudioClip,
  ImageClip,
  TextClip,
  Clip,
  Timeline,
  PlaybackState,
  ZoomState,
  ExportFormat,
  ExportResolution,
  ExportQuality,
  ExportSettings,
  ExportProgress,
} from './editor';
