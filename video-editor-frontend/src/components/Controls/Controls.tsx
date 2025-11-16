import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';

interface ControlsProps {
  isPlaying?: boolean;
  onPlayPause?: () => void;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
  onCut?: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isPlaying = false,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onCut,
}) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={onSkipBack}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={onPlayPause}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onSkipForward}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 px-4">
            <Slider
              defaultValue={[0]}
              max={100}
              step={1}
              className="w-full"
            />
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={onCut}
          >
            <Scissors className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
