import { api } from './client';
import type {
  ApiResponse,
  ExportTimelineRequest,
  ExportTimelineResponse,
  ExportJobStatus,
} from '../../types';

// Export timeline to video
export async function exportTimeline(
  request: ExportTimelineRequest
): Promise<ApiResponse<ExportTimelineResponse>> {
  try {
    const response = await api.post<ExportTimelineResponse>('/export/timeline', request);
    return response;
  } catch (error) {
    console.error('Export error:', error);
    return {
      success: false,
      error: 'Failed to start export job',
    };
  }
}

// Get export job status
export async function getExportStatus(jobId: string): Promise<ApiResponse<ExportJobStatus>> {
  return api.get<ExportJobStatus>(`/export/jobs/${jobId}`);
}

// Poll export job status until completion
export async function pollExportStatus(
  jobId: string,
  onProgress?: (status: ExportJobStatus) => void,
  pollInterval: number = 2000 // 2 seconds
): Promise<ApiResponse<ExportJobStatus>> {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const response = await getExportStatus(jobId);

      if (!response.success) {
        clearInterval(interval);
        resolve(response);
        return;
      }

      const status = response.data!;

      // Call progress callback
      if (onProgress) {
        onProgress(status);
      }

      // Check if job is complete
      if (status.status === 'completed' || status.status === 'failed') {
        clearInterval(interval);
        resolve(response);
      }
    }, pollInterval);
  });
}

// Cancel export job
export async function cancelExportJob(jobId: string): Promise<ApiResponse<void>> {
  return api.post<void>(`/export/jobs/${jobId}/cancel`);
}

// Get all export jobs
export async function getExportJobs(): Promise<ApiResponse<ExportJobStatus[]>> {
  return api.get<ExportJobStatus[]>('/export/jobs');
}

// Delete export job
export async function deleteExportJob(jobId: string): Promise<ApiResponse<void>> {
  return api.delete<void>(`/export/jobs/${jobId}`);
}

// Download exported file
export function downloadExport(outputUrl: string, filename?: string): void {
  const link = document.createElement('a');
  link.href = outputUrl;
  link.download = filename || 'export.mp4';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export with progress tracking
export async function exportWithProgress(
  request: ExportTimelineRequest,
  onProgress?: (progress: number, status: ExportJobStatus) => void
): Promise<ApiResponse<ExportJobStatus>> {
  // Start export
  const exportResponse = await exportTimeline(request);

  if (!exportResponse.success || !exportResponse.data) {
    return {
      success: false,
      error: exportResponse.error || 'Failed to start export',
    };
  }

  const jobId = exportResponse.data.jobId;

  // Poll for status
  return pollExportStatus(jobId, (status) => {
    if (onProgress) {
      onProgress(status.progress, status);
    }
  });
}

// Get export presets
export interface ExportPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  framerate: number;
  format: 'mp4' | 'webm' | 'mov';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  audioCodec?: string;
  videoCodec?: string;
}

export const exportPresets: ExportPreset[] = [
  {
    id: 'youtube-1080p',
    name: 'YouTube 1080p',
    width: 1920,
    height: 1080,
    framerate: 30,
    format: 'mp4',
    quality: 'high',
    videoCodec: 'h264',
    audioCodec: 'aac',
  },
  {
    id: 'youtube-4k',
    name: 'YouTube 4K',
    width: 3840,
    height: 2160,
    framerate: 60,
    format: 'mp4',
    quality: 'ultra',
    videoCodec: 'h264',
    audioCodec: 'aac',
  },
  {
    id: 'instagram-feed',
    name: 'Instagram Feed',
    width: 1080,
    height: 1080,
    framerate: 30,
    format: 'mp4',
    quality: 'high',
    videoCodec: 'h264',
    audioCodec: 'aac',
  },
  {
    id: 'instagram-story',
    name: 'Instagram Story',
    width: 1080,
    height: 1920,
    framerate: 30,
    format: 'mp4',
    quality: 'high',
    videoCodec: 'h264',
    audioCodec: 'aac',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    width: 1080,
    height: 1920,
    framerate: 30,
    format: 'mp4',
    quality: 'high',
    videoCodec: 'h264',
    audioCodec: 'aac',
  },
  {
    id: 'twitter',
    name: 'Twitter',
    width: 1280,
    height: 720,
    framerate: 30,
    format: 'mp4',
    quality: 'medium',
    videoCodec: 'h264',
    audioCodec: 'aac',
  },
  {
    id: 'custom-hd',
    name: 'Custom HD',
    width: 1920,
    height: 1080,
    framerate: 30,
    format: 'mp4',
    quality: 'high',
  },
];

export function getPreset(id: string): ExportPreset | undefined {
  return exportPresets.find((p) => p.id === id);
}
