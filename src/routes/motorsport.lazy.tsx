import IRacingCarsGraph from '@/components/motorsport/i-racing-cars-graph';
import IRacingLapsGraph from '@/components/motorsport/i-racing-laps-graph';
import IRacingTracksGraph from '@/components/motorsport/i-racing-tracks-graph';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { H3, P } from '@/components/ui/typography';
import { getYearsSince } from '@/lib/time';
import { createLazyFileRoute } from '@tanstack/react-router';

export const Route = createLazyFileRoute('/motorsport')({
  component: Motorsport,
});

function Motorsport() {
  const yearsSimRacing = getYearsSince('14-08-2023');
  return (
    <div className="mt-4 p-2">
      <H3>my interest in motorsports</H3>
      <P>
        my first exposure to sim racing was at a porsche dealership in
        switzerland. instead of letting me test drive ( joy ride ) a porsche,
        they let me hop into their equally expensive sim rig.
      </P>
      <P>
        i got home and immediately bought a 5nm direct drive wheel that i could
        clamp to my desk and signed up for a free iRacing subscription. i
        practice all the time (see lap performance stats).
      </P>
      <P>
        i have since upgraded to an aluminum extrusion rig with heusinkveld
        pedals and a 15nm direct drive wheel.
      </P>
      <P>
        i have been doing this for {yearsSimRacing}{' '}
        {yearsSimRacing > 1 ? 'years' : 'year'}.
      </P>
      <Card className="mt-10 mb-5">
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
