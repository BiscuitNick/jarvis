import { useState, useCallback } from 'react';
import {
  exportTimeline,
  exportWithProgress,
  getExportStatus,
  cancelExportJob,
  downloadExport,
  type ExportPreset,
  exportPresets,
  getPreset,
} from '../lib/api/exportApi';
import type {
  ExportTimelineRequest,
  ExportTimelineResponse,
  ExportJobStatus,
  TimelineState,
} from '../types';

interface UseTimelineExportResult {
  exporting: boolean;
  progress: number;
  error: string | null;
  jobId: string | null;
  status: ExportJobStatus | null;
  startExport: (request: ExportTimelineRequest) => Promise<ExportTimelineResponse | null>;
  startExportWithProgress: (
    request: ExportTimelineRequest
  ) => Promise<ExportJobStatus | null>;
  checkStatus: (jobId: string) => Promise<ExportJobStatus | null>;
  cancel: (jobId: string) => Promise<boolean>;
  download: (outputUrl: string, filename?: string) => void;
  reset: () => void;
  presets: ExportPreset[];
  getPresetById: (id: string) => ExportPreset | undefined;
}

export function useTimelineExport(): UseTimelineExportResult {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<ExportJobStatus | null>(null);

  const startExport = useCallback(
    async (request: ExportTimelineRequest): Promise<ExportTimelineResponse | null> => {
      setExporting(true);
      setError(null);
      setProgress(0);

      try {
        const response = await exportTimeline(request);

        if (!response.success || !response.data) {
          throw new Error(response.error || 'Export failed to start');
        }

        setJobId(response.data.jobId);
        return response.data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Export failed';
        setError(errorMessage);
        return null;
      } finally {
        setExporting(false);
      }
    },
    []
  );

  const startExportWithProgress = useCallback(
    async (request: ExportTimelineRequest): Promise<ExportJobStatus | null> => {
      setExporting(true);
      setError(null);
      setProgress(0);
      setStatus(null);

      try {
        const response = await exportWithProgress(request, (prog, stat) => {
          setProgress(prog);
          setStatus(stat);
        });

        if (!response.success || !response.data) {
          throw new Error(response.error || 'Export failed');
        }

        setJobId(response.data.jobId);
        setStatus(response.data);

        return response.data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Export failed';
        setError(errorMessage);
        return null;
      } finally {
        setExporting(false);
      }
    },
    []
  );

  const checkStatus = useCallback(async (jobId: string): Promise<ExportJobStatus | null> => {
    try {
      const response = await getExportStatus(jobId);

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to get export status');
      }

      setStatus(response.data);
      setProgress(response.data.progress);

      return response.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Status check failed';
      setError(errorMessage);
      return null;
    }
  }, []);

  const cancel = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      const response = await cancelExportJob(jobId);

      if (!response.success) {
        throw new Error(response.error || 'Failed to cancel export');
      }

      setExporting(false);
      setProgress(0);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Cancel failed';
      setError(errorMessage);
      return false;
    }
  }, []);

  const download = useCallback((outputUrl: string, filename?: string) => {
    downloadExport(outputUrl, filename);
  }, []);

  const reset = useCallback(() => {
    setExporting(false);
    setProgress(0);
    setError(null);
    setJobId(null);
    setStatus(null);
  }, []);

  const getPresetById = useCallback((id: string) => {
    return getPreset(id);
  }, []);

  return {
    exporting,
    progress,
    error,
    jobId,
    status,
    startExport,
    startExportWithProgress,
    checkStatus,
    cancel,
    download,
    reset,
    presets: exportPresets,
    getPresetById,
  };
}

// Helper hook to create export request from timeline
export function useCreateExportRequest() {
  return useCallback(
    (
      timeline: TimelineState,
      presetId?: string,
      customSettings?: Partial<ExportTimelineRequest['settings']>
    ): ExportTimelineRequest => {
      const preset = presetId ? getPreset(presetId) : exportPresets[0];

      return {
        timeline: {
          tracks: timeline.tracks,
          items: timeline.items,
          duration: timeline.duration,
        },
        settings: {
          width: preset?.width || 1920,
          height: preset?.height || 1080,
          framerate: preset?.framerate || 30,
          format: preset?.format || 'mp4',
          quality: preset?.quality || 'high',
          videoCodec: preset?.videoCodec,
          audioCodec: preset?.audioCodec,
          ...customSettings,
        },
      };
    },
    []
  );
}
