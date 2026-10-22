import type { CSSProperties, ReactNode } from 'react';
import { squareTint, targetDot, THREAT } from './Board';

// What the marks on the board mean, for the key beside "Show its thinking":
// each one drawn small, the way the board draws it, beside a line on what it
// is. The first two come from the model's considering; the last two are yours.

const light: CSSProperties = { backgroundColor: 'var(--chess-light)' };
const dark: CSSProperties = { backgroundColor: 'var(--chess-dark)' };

function Swatch({ style, children }: { style: CSSProperties; children?: ReactNode }) {
	return (
		<span className="relative size-8 shrink-0 overflow-hidden rounded-sm" style={style}>
			{children}
		</span>
	);
}

const Arrow = ({ color }: { color: string }) => (
	<Swatch style={light}>
		<svg viewBox="0 0 32 32" className="size-full text-(--chess-accent)" aria-hidden>
			<path d="M6 26 L22 10" stroke={color} strokeWidth="4" opacity="0.65" />
			<polygon points="27,5 15,9 23,17" fill={color} opacity="0.65" />
		</svg>
	</Swatch>
);

const MARKS: { swatch: ReactNode; title: string; detail: string }[] = [
	{
		swatch: <Arrow color="currentColor" />,
		title: 'A move it’s considering',
		detail: 'its three best, as it lists them'
	},
	{
		swatch: <Arrow color={THREAT} />,
		title: 'The threat it sees',
		detail: 'the move it fears most from you'
	}
];

const YOURS: { swatch: ReactNode; title: string }[] = [
	{
		swatch: (
			<Swatch
				style={{
					...light,
					backgroundColor: undefined,
					background: `linear-gradient(${squareTint}, ${squareTint}), var(--chess-light)`
				}}
			/>
		),
		title: 'The last move, or the piece you picked up'
	},
	{
		swatch: (
			<Swatch
				style={{
					...dark,
					backgroundImage: targetDot
				}}
			/>
		),
		title: 'Where your piece can go'
	}
];

export function MarksKey() {
	return (
		<div className="flex flex-col gap-3 text-sm">
			<div className="flex flex-col gap-0.5">
				<p className="font-medium">Reading its thinking</p>
				<p className="text-xs text-muted-foreground">
					As it thinks, what it mentions lights up on the board, and fades a couple of seconds after
					it moves on.
				</p>
			</div>
			<ul className="flex flex-col gap-2">
				{MARKS.map((mark) => (
					<li key={mark.title} className="flex items-center gap-3">
						{mark.swatch}
						<div className="flex min-w-0 flex-col">
							<span>{mark.title}</span>
							<span className="text-xs text-muted-foreground">{mark.detail}</span>
						</div>
					</li>
				))}
			</ul>
			<div className="h-px bg-border" />
			<ul className="flex flex-col gap-2">
				{YOURS.map((mark) => (
					<li key={mark.title} className="flex items-center gap-3">
						{mark.swatch}
						<span className="text-muted-foreground">{mark.title}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
