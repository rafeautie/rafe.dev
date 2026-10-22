import { Link as RouterLink, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RssIcon } from 'lucide-react';
import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeToggle } from '~/components/ThemeToggle';
import { CHAPTERS, getChapter, LATEST, TOTAL_NUDGES } from '~/story';
import { ChapterPage } from './ChapterPage';
import { PendingPage } from './PendingPage';

export const LAST_READ_KEY = 'story-last';

// The story as one book: a page per chapter, and a last page for the chapter
// still to come. Flip with the buttons, a swipe, or the arrow keys.
export function Book({ page, html }: { page: number; html: string | null }) {
	const navigate = useNavigate();
	const reduceMotion = useReducedMotion();
	const pages = LATEST + 1;
	const chapter = getChapter(page);

	// which way the last flip went, for the slide
	const [shown, setShown] = useState(page);
	const [direction, setDirection] = useState(1);
	if (page !== shown) {
		setDirection(page > shown ? 1 : -1);
		setShown(page);
	}

	const first = useRef(true);
	useEffect(() => {
		if (!first.current) window.scrollTo({ top: 0 });
		first.current = false;
		try {
			localStorage.setItem(LAST_READ_KEY, String(page));
		} catch {
			// private window
		}
	}, [page]);

	const flip = (to: number) => {
		if (to >= 1 && to <= pages && to !== page) {
			navigate({ to: '/story/$chapter', params: { chapter: String(to) } });
		}
	};

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
			if (target.closest('input, textarea, select, [contenteditable], dialog')) return;
			if (event.key === 'ArrowLeft') flip(page - 1);
			if (event.key === 'ArrowRight') flip(page + 1);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// A swipe is a mostly sideways drag; anything steeper is a scroll.
	const touch = useRef<{ x: number; y: number } | null>(null);
	const onTouchStart = (event: TouchEvent) => {
		const target = event.target as HTMLElement;
		touch.current = target.closest('input, button, a, form')
			? null
			: { x: event.touches[0].clientX, y: event.touches[0].clientY };
	};
	const onTouchEnd = (event: TouchEvent) => {
		if (!touch.current) return;
		const dx = event.changedTouches[0].clientX - touch.current.x;
		const dy = event.changedTouches[0].clientY - touch.current.y;
		touch.current = null;
		if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) flip(dx < 0 ? page + 1 : page - 1);
	};

	const slide = reduceMotion ? 0 : 40;

	return (
		<div
			className="overflow-x-clip px-6 py-8 text-base text-foreground sm:px-8"
			style={{ touchAction: 'pan-y' }}
			onTouchStart={onTouchStart}
			onTouchEnd={onTouchEnd}
		>
			<div className="mx-auto max-w-2xl">
				<div className="flex items-center justify-between gap-4">
					<SlashNav className="text-xl font-medium">
						<Link href="/">rafe</Link>
						story
					</SlashNav>
					<div className="flex items-center gap-5">
						<Link href="/story/feed.xml" className="inline-flex items-center gap-1.5 text-sm">
							<RssIcon className="size-4" />
							Feed
						</Link>
						<ThemeToggle />
					</div>
				</div>
				<p className="mt-16 text-sm font-medium tracking-tight sm:mt-24">The Long Way Out</p>
				<AnimatePresence mode="wait" initial={false} custom={direction}>
					<motion.div
						key={page}
						custom={direction}
						variants={{
							enter: (d: number) => ({ opacity: 0, x: d * slide }),
							center: { opacity: 1, x: 0 },
							exit: (d: number) => ({ opacity: 0, x: d * -slide })
						}}
						initial="enter"
						animate="center"
						exit="exit"
						transition={{ duration: 0.25, ease: 'easeOut' }}
						className="mt-6"
					>
						{chapter && html !== null ? (
							<ChapterPage chapter={chapter} html={html} />
						) : (
							<PendingPage />
						)}
					</motion.div>
				</AnimatePresence>
				<nav
					aria-label="Chapters"
					className="mt-16 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-foreground/10 pt-6 text-sm"
				>
					<div>
						{page > 1 && (
							<PageLink to={page - 1} rel="prev">
								← Chapter {page - 1}
							</PageLink>
						)}
					</div>
					<Contents page={page} pages={pages} onPick={flip} />
					<div className="text-right">
						{page < pages && (
							<PageLink to={page + 1} rel="next">
								{page + 1 === pages ? 'Next chapter' : `Chapter ${page + 1}`} →
							</PageLink>
						)}
					</div>
				</nav>
			</div>
		</div>
	);
}

function PageLink({ to, rel, children }: { to: number; rel: string; children: React.ReactNode }) {
	return (
		<RouterLink
			to="/story/$chapter"
			params={{ chapter: String(to) }}
			rel={rel}
			className="font-medium transition-opacity hover:opacity-60"
		>
			{children}
		</RouterLink>
	);
}

function Contents({
	page,
	pages,
	onPick
}: {
	page: number;
	pages: number;
	onPick: (page: number) => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [open, setOpen] = useState(false);

	const pick = (to: number) => {
		dialog.current?.close();
		onPick(to);
	};

	return (
		<>
			<button
				type="button"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => {
					dialog.current?.showModal();
					setOpen(true);
				}}
				className="cursor-pointer text-foreground/60 tabular-nums transition-colors hover:text-foreground"
			>
				{page} of {pages}
			</button>
			<dialog
				ref={dialog}
				onClose={() => setOpen(false)}
				onClick={(event) => event.target === dialog.current && dialog.current?.close()}
				className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl bg-background p-0 text-foreground shadow-xl ring-1 ring-foreground/10 backdrop:bg-black/30"
			>
				<div className="p-6">
					<div className="flex items-baseline justify-between gap-4">
						<h2 className="font-medium">Contents</h2>
						<button
							type="button"
							onClick={() => dialog.current?.close()}
							className="cursor-pointer text-sm text-foreground/50 hover:text-foreground"
						>
							Close
						</button>
					</div>
					<p className="mt-1 text-sm text-foreground/50">
						{TOTAL_NUDGES} {TOTAL_NUDGES === 1 ? 'nudge' : 'nudges'} from readers so far
					</p>
					<ol className="mt-5 flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
						{CHAPTERS.map((chapter) => (
							<li key={chapter.chapter}>
								<button
									type="button"
									onClick={() => pick(chapter.chapter)}
									aria-current={chapter.chapter === page ? 'page' : undefined}
									className="flex w-full cursor-pointer gap-3 rounded-md px-2 py-1.5 text-left hover:bg-foreground/5 aria-[current]:bg-foreground/5"
								>
									<span className="w-6 shrink-0 text-foreground/40 tabular-nums">
										{chapter.chapter}
									</span>
									<span>{chapter.title}</span>
								</button>
							</li>
						))}
						<li>
							<button
								type="button"
								onClick={() => pick(pages)}
								aria-current={page === pages ? 'page' : undefined}
								className="flex w-full cursor-pointer gap-3 rounded-md px-2 py-1.5 text-left text-foreground/50 hover:bg-foreground/5 aria-[current]:bg-foreground/5"
							>
								<span className="w-6 shrink-0 tabular-nums">{pages}</span>
								<span>Coming at noon</span>
							</button>
						</li>
					</ol>
				</div>
			</dialog>
		</>
	);
}
