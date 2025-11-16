import type { TimelineState, TimelineItem, Track } from '../../types';

/**
 * Export and data transformation utilities for timeline
 */

// Prepare timeline data for export/rendering
export function prepareTimelineForExport(timeline: TimelineState): {
  tracks: Track[];
  items: TimelineItem[];
  duration: number;
} {
  // Sort tracks by order
  const sortedTracks = [...timeline.tracks].sort((a, b) => a.order - b.order);

  // Sort items by start time and track order
  const sortedItems = [...timeline.items].sort((a, b) => {
    // First sort by start time
    if (a.startTime !== b.startTime) {
      return a.startTime - b.startTime;
    }

    // Then by track order
    const trackA = sortedTracks.find((t) => t.id === a.trackId);
    const trackB = sortedTracks.find((t) => t.id === b.trackId);

    return (trackA?.order || 0) - (trackB?.order || 0);
  });

  return {
    tracks: sortedTracks,
    items: sortedItems,
    duration: timeline.duration,
  };
}

// Convert timeline to EDL (Edit Decision List) format
export function timelineToEDL(timeline: TimelineState, framerate: number = 30): string {
  const { tracks, items } = prepareTimelineForExport(timeline);

  let edl = `TITLE: Video Timeline Export\n`;
  edl += `FCM: NON-DROP FRAME\n\n`;

  items.forEach((item, index) => {
    const eventNumber = String(index + 1).padStart(3, '0');
    const track = tracks.find((t) => t.id === item.trackId);
    const trackType = track?.type === 'audio' ? 'A' : 'V';

    const sourceStart = formatTimecode(item.trimStart || 0, framerate);
    const sourceEnd = formatTimecode(
      (item.trimEnd || item.duration) + (item.trimStart || 0),
      framerate
    );
    const recordStart = formatTimecode(item.startTime, framerate);
    const recordEnd = formatTimecode(item.startTime + item.duration, framerate);

    edl += `${eventNumber}  ${item.name.substring(0, 8).padEnd(8)} ${trackType}     C        ${sourceStart} ${sourceEnd} ${recordStart} ${recordEnd}\n`;
    edl += `* FROM CLIP NAME: ${item.name}\n`;
    if (item.mediaUrl) {
      edl += `* SOURCE FILE: ${item.mediaUrl}\n`;
    }
    edl += `\n`;
  });

  return edl;
}

// Convert timeline to Final Cut Pro XML
export function timelineToFCPXML(timeline: TimelineState, framerate: number = 30): string {
  const { tracks, items } = prepareTimelineForExport(timeline);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<!DOCTYPE fcpxml>\n`;
  xml += `<fcpxml version="1.9">\n`;
  xml += `  <resources>\n`;

  // Add resources (media files)
  const mediaResources = new Map<string, TimelineItem>();
  items.forEach((item) => {
    if (item.mediaUrl && !mediaResources.has(item.mediaUrl)) {
      mediaResources.set(item.mediaUrl, item);
    }
  });

  mediaResources.forEach((item, url) => {
    xml += `    <asset id="${item.id}" name="${item.name}" src="${url}"/>\n`;
  });

  xml += `  </resources>\n`;
  xml += `  <library>\n`;
  xml += `    <event name="Timeline Export">\n`;
  xml += `      <project name="Video Timeline">\n`;
  xml += `        <sequence format="r1" duration="${framesToDuration(Math.floor(timeline.duration * framerate))}s">\n`;
  xml += `          <spine>\n`;

  // Add clips
  items.forEach((item) => {
    const offset = framesToDuration(Math.floor(item.startTime * framerate));
    const duration = framesToDuration(Math.floor(item.duration * framerate));

    xml += `            <${item.type === 'video' ? 'video' : item.type === 'audio' ? 'audio' : 'title'} `;
    xml += `offset="${offset}s" `;
    xml += `duration="${duration}s" `;
    xml += `name="${escapeXml(item.name)}"`;

    if (item.mediaUrl) {
      xml += ` ref="${item.id}"`;
    }

    xml += `/>\n`;
  });

  xml += `          </spine>\n`;
  xml += `        </sequence>\n`;
  xml += `      </project>\n`;
  xml += `    </event>\n`;
  xml += `  </library>\n`;
  xml += `</fcpxml>\n`;

  return xml;
}

// Convert timeline to DaVinci Resolve compatible XML
export function timelineToResolveXML(timeline: TimelineState, framerate: number = 30): string {
  const { tracks, items } = prepareTimelineForExport(timeline);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<xmeml version="5">\n`;
  xml += `  <sequence>\n`;
  xml += `    <name>Timeline Export</name>\n`;
  xml += `    <duration>${Math.floor(timeline.duration * framerate)}</duration>\n`;
  xml += `    <rate>\n`;
  xml += `      <timebase>${framerate}</timebase>\n`;
  xml += `    </rate>\n`;

  // Add tracks
  tracks.forEach((track) => {
    const trackItems = items.filter((i) => i.trackId === track.id);

    xml += `    <media>\n`;
    xml += `      <${track.type}>\n`;
    xml += `        <track>\n`;

    trackItems.forEach((item) => {
      xml += `          <clipitem>\n`;
      xml += `            <name>${escapeXml(item.name)}</name>\n`;
      xml += `            <start>${Math.floor(item.startTime * framerate)}</start>\n`;
      xml += `            <end>${Math.floor((item.startTime + item.duration) * framerate)}</end>\n`;

      if (item.mediaUrl) {
        xml += `            <file>\n`;
        xml += `              <pathurl>${escapeXml(item.mediaUrl)}</pathurl>\n`;
        xml += `            </file>\n`;
      }

      xml += `          </clipitem>\n`;
    });

    xml += `        </track>\n`;
    xml += `      </${track.type}>\n`;
    xml += `    </media>\n`;
  });

  xml += `  </sequence>\n`;
  xml += `</xmeml>\n`;

  return xml;
}

// Export timeline as JSON
export function timelineToJSON(timeline: TimelineState): string {
  return JSON.stringify(prepareTimelineForExport(timeline), null, 2);
}

// Export timeline metadata
export interface TimelineMetadata {
  totalDuration: number;
  trackCount: number;
  itemCount: number;
  videoItems: number;
  audioItems: number;
  imageItems: number;
  textItems: number;
  totalSize?: number;
}

export function getTimelineMetadata(timeline: TimelineState): TimelineMetadata {
  return {
    totalDuration: timeline.duration,
    trackCount: timeline.tracks.length,
    itemCount: timeline.items.length,
    videoItems: timeline.items.filter((i) => i.type === 'video').length,
    audioItems: timeline.items.filter((i) => i.type === 'audio').length,
    imageItems: timeline.items.filter((i) => i.type === 'image').length,
    textItems: timeline.items.filter((i) => i.type === 'text').length,
  };
}

// Helper functions

function formatTimecode(seconds: number, framerate: number): string {
  const totalFrames = Math.floor(seconds * framerate);
  const hours = Math.floor(totalFrames / (framerate * 3600));
  const minutes = Math.floor((totalFrames % (framerate * 3600)) / (framerate * 60));
  const secs = Math.floor((totalFrames % (framerate * 60)) / framerate);
  const frames = totalFrames % framerate;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

function framesToDuration(frames: number): string {
  return `${frames}/30`; // Simplified, should use actual framerate
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Download exported data as file
export function downloadTimelineExport(
  content: string,
  filename: string,
  mimeType: string = 'text/plain'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// Export functions with auto-download
export const exportFunctions = {
  exportAsJSON: (timeline: TimelineState, filename: string = 'timeline.json') => {
    const json = timelineToJSON(timeline);
    downloadTimelineExport(json, filename, 'application/json');
  },

  exportAsEDL: (timeline: TimelineState, filename: string = 'timeline.edl', framerate: number = 30) => {
    const edl = timelineToEDL(timeline, framerate);
    downloadTimelineExport(edl, filename, 'text/plain');
  },

  exportAsFCPXML: (timeline: TimelineState, filename: string = 'timeline.fcpxml', framerate: number = 30) => {
    const xml = timelineToFCPXML(timeline, framerate);
    downloadTimelineExport(xml, filename, 'application/xml');
  },

  exportAsResolveXML: (timeline: TimelineState, filename: string = 'timeline.xml', framerate: number = 30) => {
    const xml = timelineToResolveXML(timeline, framerate);
    downloadTimelineExport(xml, filename, 'application/xml');
  },
};
