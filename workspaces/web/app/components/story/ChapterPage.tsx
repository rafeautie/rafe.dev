import { formatDate, type Chapter } from '~/story';

export function ChapterPage({ chapter, html }: { chapter: Chapter; html: string }) {
	const top = Math.max(1, ...chapter.themes.map((theme) => theme.count));
	return (
		<article>
			<p className="text-sm text-foreground/50">
				Chapter {chapter.chapter} · <time dateTime={chapter.date}>{formatDate(chapter.date)}</time>
			</p>
			<h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
				{chapter.title}
			</h1>
			<div
				className="post prose mt-12 max-w-none prose-neutral sm:prose-lg"
				dangerouslySetInnerHTML={{ __html: html }}
			/>
			{chapter.nudges > 0 && (
				<section className="mt-16 border-t border-foreground/10 pt-8">
					<h2 className="font-medium">
						Shaped by {chapter.nudges} {chapter.nudges === 1 ? 'reader' : 'readers'}
					</h2>
					{chapter.themes.length > 0 && (
						<ul className="mt-5 flex flex-col gap-3 text-sm">
							{chapter.themes.map((theme) => (
								<li key={theme.label}>
									<div className="flex justify-between gap-4">
										<span className="text-foreground/80">{theme.label}</span>
										<span className="text-foreground/50 tabular-nums">{theme.count}</span>
									</div>
									<div className="mt-1.5 h-px bg-foreground/10">
										<div
											className="h-px bg-foreground/60"
											style={{ width: `${(theme.count / top) * 100}%` }}
										/>
									</div>
								</li>
							))}
						</ul>
					)}
					{chapter.shaped && <p className="mt-5 text-sm text-foreground/60">{chapter.shaped}</p>}
				</section>
			)}
			<p className="mt-12 text-sm text-foreground/50">Written by Claude, an AI model.</p>
		</article>
	);
}
