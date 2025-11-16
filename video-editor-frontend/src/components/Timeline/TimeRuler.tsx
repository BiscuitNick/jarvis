import React, { useRef } from 'react';

interface TimeRulerProps {
  zoom: number;
  totalDuration: number;
  onSeek: (time: number) => void;
}

export const TimeRuler: React.FC<TimeRulerProps> = ({ zoom, totalDuration, onSeek }) => {
  const rulerRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = x / zoom;
    onSeek(time);
  };

  const renderTimeMarks = () => {
    const marks: React.ReactElement[] = [];
    
    let interval = 1;
    if (zoom < 50) {
      interval = 5;
    } else if (zoom < 100) {
      interval = 2;
    }

    for (let i = 0; i <= totalDuration; i += interval) {
      const x = i * zoom;
      const showLabel = i % (interval * 2) === 0;
      
      marks.push(
        <div
          key={i}
          className="absolute top-0 h-full border-l border-gray-600"
          style={{ left: x + 'px' }}
        >
          {showLabel && (
            <span className="absolute top-0 left-1 text-xs text-gray-400">
              {formatTime(i)}
            </span>
          )}
        </div>
      );
    }

    for (let i = 0; i <= totalDuration; i += interval / 2) {
      if (i % interval !== 0) {
        const x = i * zoom;
        marks.push(
          <div
            key={'half-' + i}
            className="absolute top-4 h-2 border-l border-gray-700"
            style={{ left: x + 'px' }}
          />
        );
      }
    }

    return marks;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ':' + secs.toString().padStart(2, '0');
  };

  return (
    <div
      ref={rulerRef}
      className="relative h-8 bg-timeline-bg border-b border-gray-700 cursor-pointer select-none overflow-hidden"
      onClick={handleClick}
      style={{ width: totalDuration * zoom + 'px' }}
    >
      {renderTimeMarks()}
    </div>
  );
};
