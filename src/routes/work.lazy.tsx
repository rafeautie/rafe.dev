import { H3, P } from '@/components/ui/typography';
import { getYearsSince } from '@/lib/time';
import { createLazyFileRoute } from '@tanstack/react-router';

export const Route = createLazyFileRoute('/work')({
  component: Work,
});

function Work() {
  const yearsEmployed = getYearsSince('13-01-2020');
  return (
    <div className="mt-4 p-2">
      <H3>about my work</H3>
      <P>i have worked for tesla for the past {yearsEmployed} years roughly</P>
      <P>i work on the tesla mobile app</P>
    </div>
  );
}
