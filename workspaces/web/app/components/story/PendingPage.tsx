import { getChapter, LATEST } from '~/story';
import { nextNoon, pacificDate, previousNoon } from '~/story/time';
import { NudgeBox } from './NudgeBox';
import { useNow, useStoryStatus } from './use-story-status';

const STEPS = [
	{ state: 'reading', label: 'Reading your nudges' },
	{ state: 'writing', label: 'Writing the chapter' },
	{ state: 'publishing', label: 'Publishing' }
] as const;

// Until the job's first status lands, the minutes after noon still read as
// being written rather than as a countdown to tomorrow.
const STARTING = 20 * 60 * 1000;

const LOCAL_TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

// The book's last page: the chapter that is not out yet.
export function PendingPage() {
	const chapter = LATEST + 1;
	const now = useNow();
	const { status, setStatus } = useStoryStatus();

	const arrived = status !== null && status.latest >= chapter;
	const outToday = now !== null && getChapter(LATEST)?.date === pacificDate(now);
	const starting =
		now !== null &&
		!outToday &&
		!status?.state &&
		now.getTime() - previousNoon(now).getTime() < STARTING;
	const step =
		status?.state && status.state !== 'late' ? status.state : starting ? 'reading' : null;

	return (
		<section aria-live="polite">
			<p className="text-sm text-foreground/50">Next chapter</p>
			<h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Chapter {chapter}</h1>

			{arrived ? (
				<p className="mt-8 text-lg">
					Chapter {chapter} is here.{' '}
					{/* a full load, as the chapter is in the new deploy, not this page's code */}
					<a href={`/story/${chapter}`} className="font-medium underline underline-offset-4">
						Read it →
					</a>
				</p>
			) : step ? (
				<div className="mt-8">
					<p className="flex items-center gap-2.5 text-lg">
						<span className="relative flex size-2">
							<span className="absolute inline-flex size-full animate-ping rounded-full bg-foreground/40 motion-reduce:animate-none" />
							<span className="relative inline-flex size-2 rounded-full bg-foreground" />
						</span>
						Being written now
					</p>
					<ol className="mt-5 flex flex-col gap-2 text-sm">
						{STEPS.map((item, index) => {
							const current = STEPS.findIndex((s) => s.state === step);
							return (
								<li
									key={item.state}
									className={
										index < current
											? 'text-foreground/50 line-through decoration-foreground/30'
											: index === current
												? 'font-medium'
												: 'text-foreground/40'
									}
								>
									{item.label}
								</li>
							);
						})}
					</ol>
				</div>
			) : status?.state === 'late' ? (
				<p className="mt-8 text-lg text-foreground/70">
					Running a little late today. It will be here soon, and nudges are still open.
				</p>
			) : (
				<Countdown now={now} />
			)}

			{status && !arrived && (
				<>
					<NudgeBox
						status={status}
						onSent={({ chapter: nudged, count }) => setStatus({ ...status, nudged, count })}
					/>
					<p className="mt-6 text-sm text-foreground/50">
						{status.count} {status.count === 1 ? 'nudge' : 'nudges'} so far for Chapter{' '}
						{status.target}
					</p>
				</>
			)}
		</section>
	);
}

function Countdown({ now }: { now: Date | null }) {
	if (!now)
		return (
			<p className="mt-8 h-[4.5rem] text-lg text-foreground/50">Out at noon, California time</p>
		);
	const noon = nextNoon(now);
	const left = Math.max(0, Math.floor((noon.getTime() - now.getTime()) / 1000));
	const hours = Math.floor(left / 3600);
	const minutes = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
	const seconds = String(left % 60).padStart(2, '0');
	return (
		<div className="mt-8">
			<p className="text-3xl font-medium tracking-tight tabular-nums">
				in {hours}:{minutes}:{seconds}
			</p>
			<p className="mt-2 text-sm text-foreground/50">
				noon California time · {LOCAL_TIME.format(noon).toLowerCase()} your time
			</p>
		</div>
	);
}
