import IRacingCarsGraph from '@/components/motorsport/i-racing-cars-graph';
import IRacingLapsGraph from '@/components/motorsport/i-racing-laps-graph';
import IRacingTracksGraph from '@/components/motorsport/i-racing-tracks-graph';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createLazyFileRoute } from '@tanstack/react-router';

export const Route = createLazyFileRoute('/iracing')({
  component: Motorsport,
});

function Motorsport() {
  return (
    <div className="p-2">
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>iRacing Stats</CardTitle>
          <CardDescription>Updated Hourly</CardDescription>
        </CardHeader>
      </Card>
      <div className="flex flex-col xl:flex-row w-full gap-5 ">
        <IRacingTracksGraph />
        <IRacingCarsGraph />
        <IRacingLapsGraph />
      </div>
    </div>
  );
}
