import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TrackListProps {
  // Add props as needed
}

export const TrackList: React.FC<TrackListProps> = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tracks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="bg-timeline-track p-3 rounded-md">
            <p className="text-sm font-medium">Track 1</p>
          </div>
          <div className="bg-timeline-track p-3 rounded-md">
            <p className="text-sm font-medium">Track 2</p>
          </div>
          <div className="bg-timeline-track p-3 rounded-md">
            <p className="text-sm font-medium">Track 3</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
