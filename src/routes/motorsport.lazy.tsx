import IRacingLapsGraph from '@/components/motorsport/i-racing-laps-graph';
import { H3, P } from '@/components/ui/typography';
import { useYearsSince } from '@/hooks/use-years-since';
import { createLazyFileRoute } from '@tanstack/react-router';

export const Route = createLazyFileRoute('/motorsport')({
  component: Motorsport,
});

function Motorsport() {
  const yearsSimRacing = useYearsSince('14-08-2023');
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
        clamp to my desk and signed up for a free iRacing subscription. from
        then i spent many late nights and early mornings honing my craft.
      </P>
      <P>
        i have since upgraded to an aluminum extrusion rig with heusinkveld
        pedals and a 15nm direct drive wheel.
      </P>
      <P>
        it has been {yearsSimRacing} {yearsSimRacing > 1 ? 'years' : 'year'} and
        i have yet to look back.
      </P>
      <IRacingLapsGraph />
    </div>
  );
}
