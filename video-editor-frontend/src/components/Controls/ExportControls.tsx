import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { UseExportReturn } from '@/hooks/useExport';
import { ExportFormat, ExportResolution, ExportQuality } from '@/types/editor';

interface ExportControlsProps {
  exportHook: UseExportReturn;
  disabled?: boolean;
}

export function ExportControls({ exportHook, disabled = false }: ExportControlsProps) {
  const { exportSettings, exportProgress, updateExportSettings, startExport, cancelExport } = exportHook;

  const handleFormatChange = (value: string) => {
    updateExportSettings({ format: value as ExportFormat });
  };

  const handleResolutionChange = (value: string) => {
    updateExportSettings({ resolution: value as ExportResolution });
  };

  const handleQualityChange = (value: string) => {
    updateExportSettings({ quality: value as ExportQuality });
  };

  const handleFpsChange = (value: string) => {
    updateExportSettings({ fps: parseInt(value, 10) });
  };

  const handleAudioToggle = () => {
    updateExportSettings({ includeAudio: !exportSettings.includeAudio });
  };

  return (
    <div className="space-y-6 p-4 bg-card border rounded-lg">
      {/* Title */}
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Export Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure your video export settings
        </p>
      </div>

      {/* Export Settings Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Format */}
        <div className="space-y-2">
          <Label htmlFor="export-format">Format</Label>
          <Select
            value={exportSettings.format}
            onValueChange={handleFormatChange}
            disabled={disabled || exportProgress.isExporting}
          >
            <SelectTrigger id="export-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4</SelectItem>
              <SelectItem value="webm">WebM</SelectItem>
              <SelectItem value="mov">MOV</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Resolution */}
        <div className="space-y-2">
          <Label htmlFor="export-resolution">Resolution</Label>
          <Select
            value={exportSettings.resolution}
            onValueChange={handleResolutionChange}
            disabled={disabled || exportProgress.isExporting}
          >
            <SelectTrigger id="export-resolution">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="360p">360p (640x360)</SelectItem>
              <SelectItem value="480p">480p (854x480)</SelectItem>
              <SelectItem value="720p">720p (1280x720)</SelectItem>
              <SelectItem value="1080p">1080p (1920x1080)</SelectItem>
              <SelectItem value="1440p">1440p (2560x1440)</SelectItem>
              <SelectItem value="4k">4K (3840x2160)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quality */}
        <div className="space-y-2">
          <Label htmlFor="export-quality">Quality</Label>
          <Select
            value={exportSettings.quality}
            onValueChange={handleQualityChange}
            disabled={disabled || exportProgress.isExporting}
          >
            <SelectTrigger id="export-quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="ultra">Ultra</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* FPS */}
        <div className="space-y-2">
          <Label htmlFor="export-fps">Frame Rate</Label>
          <Select
            value={exportSettings.fps.toString()}
            onValueChange={handleFpsChange}
            disabled={disabled || exportProgress.isExporting}
          >
            <SelectTrigger id="export-fps">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24">24 fps</SelectItem>
              <SelectItem value="25">25 fps</SelectItem>
              <SelectItem value="30">30 fps</SelectItem>
              <SelectItem value="60">60 fps</SelectItem>
              <SelectItem value="120">120 fps</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Audio Toggle */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="include-audio"
          checked={exportSettings.includeAudio}
          onChange={handleAudioToggle}
          disabled={disabled || exportProgress.isExporting}
          className="h-4 w-4 rounded border-gray-300"
        />
        <Label htmlFor="include-audio" className="cursor-pointer">
          Include Audio
        </Label>
      </div>

      {/* Export Progress */}
      {exportProgress.isExporting && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Exporting...</span>
            <span className="text-muted-foreground">{exportProgress.progress}%</span>
          </div>
          <Progress value={exportProgress.progress} max={100} />
          <p className="text-sm text-muted-foreground">{exportProgress.currentStep}</p>
        </div>
      )}

      {/* Error Display */}
      {exportProgress.error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
          <div className="flex items-start gap-2">
            <ErrorIcon className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-destructive">Export Failed</p>
              <p className="text-sm text-destructive/80">{exportProgress.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {!exportProgress.isExporting && exportProgress.progress === 100 && !exportProgress.error && (
        <div className="p-4 bg-green-500/10 border border-green-500 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckIcon className="h-5 w-5 text-green-500" />
            <p className="font-medium text-green-500">Export Completed Successfully!</p>
          </div>
        </div>
      )}

      {/* Export Actions */}
      <div className="flex gap-3">
        {!exportProgress.isExporting ? (
          <Button
            onClick={startExport}
            disabled={disabled}
            className="flex-1"
            size="lg"
          >
            <DownloadIcon className="h-5 w-5 mr-2" />
            Export Video
          </Button>
        ) : (
          <Button
            variant="destructive"
            onClick={cancelExport}
            className="flex-1"
            size="lg"
          >
            <StopIcon className="h-5 w-5 mr-2" />
            Cancel Export
          </Button>
        )}
      </div>

      {/* Estimated File Size (optional enhancement) */}
      <div className="text-xs text-muted-foreground text-center">
        Estimated file size: ~{estimateFileSize(exportSettings)} MB
      </div>
    </div>
  );
}

// Estimate file size based on settings (rough approximation)
function estimateFileSize(settings: {
  resolution: ExportResolution;
  quality: ExportQuality;
  fps: number;
}): number {
  // Base size in MB per minute
  const resolutionMultipliers: Record<ExportResolution, number> = {
    '360p': 10,
    '480p': 20,
    '720p': 50,
    '1080p': 100,
    '1440p': 200,
    '4k': 400,
  };

  const qualityMultipliers: Record<ExportQuality, number> = {
    low: 0.5,
    medium: 1,
    high: 1.5,
    ultra: 2,
  };

  const fpsMultiplier = settings.fps / 30; // Normalize to 30fps

  const baseSize = resolutionMultipliers[settings.resolution] || 50;
  const qualityFactor = qualityMultipliers[settings.quality] || 1;

  // Assuming 1 minute of video for estimation
  const estimatedSize = baseSize * qualityFactor * fpsMultiplier;

  return Math.round(estimatedSize);
}

// Icons
function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <rect x="6" y="6" width="12" height="12" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
