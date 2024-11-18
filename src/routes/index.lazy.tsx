import { H3, P } from '@/components/ui/typography';
import { createLazyFileRoute } from '@tanstack/react-router';

export const Route = createLazyFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="mt-4 p-2">
      <H3>about me</H3>
      <P>my name is rafe.</P>
      <P>
        i am a self taught software engineer, i compete in amateur sim racing
        and have a mild interest in motorsports.
      </P>
      <P>i also own a miata.</P>
    </div>
  );
}
