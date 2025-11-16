// Clip types
export type ClipType = 'video' | 'audio' | 'image' | 'text';

export interface TimeRange {
  start: number;  // in seconds
  end: number;    // in seconds
}

export interface BaseClip {
  id: string;
  type: ClipType;
  startTime: number;  // position on timeline (seconds)
  duration: number;   // visible duration on timeline (seconds)
  track: number;      // track/layer number
  selected: boolean;
  name: string;
}

export interface VideoClip extends BaseClip {
  type: 'video';
  src: string;
  originalDuration: number;
  trim: TimeRange;  // which part of the original video to use
  speed: number;    // playback speed multiplier (0.25 - 4.0)
  volume: number;   // 0-1
  hasAudio: boolean;
}

export interface AudioClip extends BaseClip {
  type: 'audio';
  src: string;
  originalDuration: number;
  trim: TimeRange;
  speed: number;
  volume: number;
}

export interface ImageClip extends BaseClip {
  type: 'image';
  src: string;
  // duration can be adjusted (no original duration for images)
}

export interface TextClip extends BaseClip {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor?: string;
  position: { x: number; y: number };
}

export type Clip = VideoClip | AudioClip | ImageClip | TextClip;

// Timeline types
export interface Timeline {
  clips: Clip[];
  duration: number;  // total timeline duration
  tracks: number;    // number of tracks
}

// Playback state
export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;  // current playhead position (seconds)
  duration: number;     // total timeline duration
  loop: boolean;
  volume: number;       // master volume 0-1
}

// Zoom state
export interface ZoomState {
  level: number;        // zoom percentage (25% - 400%)
  pixelsPerSecond: number;  // how many pixels represent 1 second
}

// Export settings
export type ExportFormat = 'mp4' | 'webm' | 'mov';
export type ExportResolution = '360p' | '480p' | '720p' | '1080p' | '1440p' | '4k';
export type ExportQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface ExportSettings {
  format: ExportFormat;
  resolution: ExportResolution;
  quality: ExportQuality;
  fps: number;
  includeAudio: boolean;
}

export interface ExportProgress {
  isExporting: boolean;
  progress: number;  // 0-100
  currentStep: string;
  error?: string;
}

// Editor state
export interface EditorState {
  timeline: Timeline;
  playback: PlaybackState;
  zoom: ZoomState;
  selectedClipId: string | null;
  exportSettings: ExportSettings;
  exportProgress: ExportProgress;
}
