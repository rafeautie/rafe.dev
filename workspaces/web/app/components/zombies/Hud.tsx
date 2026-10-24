import { useSyncExternalStore } from 'react';
import { Button } from '~/components/ui/button';
import type { GameClient, HudState } from '~/lib/zombies/game/client';
import type { GameStats } from '~/lib/zombies/protocol';
import { PERKS } from '~/lib/zombies/rules';
import { cn } from '~/lib/utils';
import { SettingsForm } from './Settings';
import { Controls } from './Zombies';

const NUMBER = new Intl.NumberFormat('en-US');

// Everything drawn over the game, kept as quiet as the rest of the site:
// Geist in title case on white panels, one panel per thing, with numbers that do
// not jump as they change.
export function Hud({ client, onLeave }: { client: GameClient; onLeave: () => void }) {
	const hud = useSyncExternalStore(client.subscribe, client.getHud);
	const hurt = Math.max(0, 1 - hud.hp / hud.maxHp);
	const over = hud.phase === 'over';
	// before the mouse is first captured there is nothing to pause, just a click to start
	const waiting = !hud.locked && !hud.played && !over;
	const paused = !hud.locked && hud.played && !over;
	const pausedCount = hud.players.filter((p) => p.paused).length;
	const awayCount = hud.players.filter((p) => p.away).length;

	return (
		<div className="pointer-events-none absolute inset-0 font-medium text-foreground tabular-nums">
			{/* damage: the edges close in as health drops */}
			<div
				className="absolute inset-0 transition-opacity duration-300"
				style={{
					opacity: hud.life === 'downed' ? 0.9 : hurt * 0.85,
					background:
						'radial-gradient(ellipse at center, transparent 45%, color-mix(in oklch, var(--destructive) 35%, black 20%) 130%)'
				}}
			/>
			<div
				key={`hurt-${hud.hurts}`}
				className={cn(
					'absolute inset-0 bg-destructive/15',
					hud.hurts ? 'animate-out duration-500 fill-mode-forwards fade-out' : 'opacity-0'
				)}
			/>

			{/* where you are */}
			<Panel className="absolute top-5 left-5 px-3 py-1.5 text-sm text-muted-foreground">
				{hud.area}
			</Panel>

			{/* who's on the pause screen, when playing with others */}
			{hud.players.length > 1 && pausedCount + awayCount > 0 && !paused && !over && (
				<Panel className="absolute top-5 left-1/2 -translate-x-1/2 px-3 py-1.5 text-sm text-muted-foreground">
					{pausedLine(pausedCount, awayCount, hud.players.length)}
				</Panel>
			)}

			{/* the host dropped out, or this player lost them for a moment */}
			{hud.reconnecting && !over && (
				<Panel className="absolute top-[30%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 px-6 py-4 text-center">
					<p className="animate-pulse text-xl tracking-tight">Reconnecting</p>
					<p className="text-sm text-muted-foreground">Your Points and Guns Are Kept</p>
				</Panel>
			)}

			{/* which way each recent hit came from */}
			{hud.danger.map((d) => (
				<div
					key={d.id}
					className="absolute top-1/2 left-1/2 size-0"
					style={{ transform: `rotate(${d.angle}deg)`, opacity: Math.min(1, d.left * 1.6) }}
				>
					<div className="absolute -top-36 -left-14 h-6 w-28 rounded-[50%] border-t-[5px] border-destructive drop-shadow-[0_0_6px_rgb(0_0_0/0.4)]" />
				</div>
			))}

			{/* crosshair, with a mark for each hit */}
			{hud.life !== 'dead' && !over && (
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
					<div className="size-1.5 rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.35)]" />
					<div
						key={`hit-${hud.hits}`}
						className={cn(
							'absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-[0_0_1px_rgb(0_0_0/0.6)]',
							hud.hits ? 'animate-out duration-300 fill-mode-forwards fade-out' : 'opacity-0'
						)}
					>
						<HitMark />
					</div>
					<div
						key={`kill-${hud.kills}`}
						className={cn(
							'absolute top-1/2 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 text-destructive',
							hud.kills ? 'animate-out duration-500 fill-mode-forwards fade-out' : 'opacity-0'
						)}
					>
						<HitMark />
					</div>
				</div>
			)}

			{/* what can be bought or done here */}
			<div className="absolute top-[62%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
				{hud.hint && (
					<Panel className={cn('px-3.5 py-2 text-sm', hud.hint.muted && 'text-muted-foreground')}>
						{hud.hint.text}
						{hud.reviving > 0 && <Progress value={hud.reviving} className="mt-2" />}
						{hud.hint.progress !== undefined && hud.reviving <= 0 && (
							<Progress value={hud.hint.progress} className="mt-2" />
						)}
					</Panel>
				)}
				{hud.note && (
					<Panel
						className={cn(
							'px-3.5 py-2 text-sm',
							hud.note.warning ? 'text-destructive' : 'text-base tracking-wide uppercase'
						)}
					>
						{hud.note.text}
					</Panel>
				)}
			</div>

			{/* downed or dead */}
			{hud.life !== 'alive' && !over && (
				<Panel className="absolute top-[24%] left-1/2 flex min-w-56 -translate-x-1/2 flex-col items-center gap-1 px-6 py-4 text-center">
					<p className="text-2xl tracking-tight">
						{hud.life === 'downed' ? 'Downed' : 'You Bled Out'}
					</p>
					<p className="text-sm text-muted-foreground">
						{hud.life === 'dead'
							? 'Back Next Round'
							: hud.beingRevived > 0
								? 'Being Revived'
								: hud.players.length > 1
									? `Bleeding Out ${hud.bleed}`
									: `Back Up in ${hud.bleed}`}
					</p>
					{hud.beingRevived > 0 && <Progress value={hud.beingRevived} className="mt-2" />}
				</Panel>
			)}

			{/* power-ups running, top middle */}
			{(hud.instakill > 0 || hud.double > 0) && !over && (
				<div className="absolute top-14 left-1/2 flex -translate-x-1/2 gap-2">
					{hud.instakill > 0 && <Boost label="Insta-Kill" left={hud.instakill} />}
					{hud.double > 0 && <Boost label="Double Points" left={hud.double} />}
				</div>
			)}

			{/* perks held, above the round */}
			{hud.perks.length > 0 && (
				<div className="absolute bottom-[7.5rem] left-5 flex gap-1.5">
					{hud.perks.map((perk) => (
						<span
							key={perk}
							title={PERKS[perk].name}
							className="flex size-8 items-center justify-center rounded-md text-xs font-semibold text-white shadow-sm"
							style={{ background: PERKS[perk].color }}
						>
							{PERKS[perk].short}
						</span>
					))}
				</div>
			)}

			{/* round, bottom left */}
			<Panel className="absolute bottom-5 left-5 flex min-w-28 flex-col px-4 pt-3 pb-2.5">
				<p
					key={`round-${hud.round}`}
					className="animate-in text-5xl leading-none tracking-tight duration-1000 fade-in"
				>
					{hud.round || '–'}
				</p>
				<p className="mt-1.5 text-sm text-muted-foreground">
					{hud.phase === 'break'
						? hud.round
							? `Next Round in ${hud.timer}`
							: `Starting in ${hud.timer}`
						: `Round · ${hud.left} Left`}
				</p>
			</Panel>

			{/* points and ammo, bottom right */}
			<div className="absolute right-5 bottom-5 flex flex-col items-end gap-2">
				<Panel className="px-4 py-2.5">
					<ul className="flex flex-col items-end gap-0.5 text-sm">
						{hud.players.map((p) => (
							<li key={p.id} className="relative flex items-baseline gap-3">
								{p.you &&
									hud.pops.map((pop) => (
										<span
											key={pop.id}
											className={cn(
												'absolute right-full mr-7 animate-out duration-1000 fill-mode-forwards fade-out slide-out-to-top-3',
												pop.amount < 0 ? 'text-destructive' : 'text-muted-foreground'
											)}
										>
											{pop.amount > 0 ? '+' : '−'}
											{Math.abs(pop.amount)}
										</span>
									))}
								{(p.paused || p.away) && (
									<span className="text-xs tracking-wide text-muted-foreground uppercase">
										{p.away ? 'Away' : 'Paused'}
									</span>
								)}
								<span
									className={cn('text-muted-foreground', p.state !== 'alive' && 'line-through')}
								>
									{p.name}
								</span>
								<span className={cn(p.you ? 'text-base' : 'text-muted-foreground')}>
									{NUMBER.format(p.points)}
								</span>
							</li>
						))}
					</ul>
				</Panel>
				{hud.life !== 'dead' && (
					<Panel className="flex min-w-40 flex-col items-end px-4 pt-2.5 pb-3">
						<p className="text-sm text-muted-foreground">
							{hud.reloading ? 'Reloading' : hud.weapon}
						</p>
						<p className="text-4xl leading-none tracking-tight">
							<span className={cn(hud.mag === 0 && 'text-destructive')}>{hud.mag}</span>
							<span className="text-muted-foreground"> / {hud.reserve}</span>
						</p>
					</Panel>
				)}
			</div>

			{waiting && (
				<Panel className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-6 px-3.5 py-2 text-sm">
					Click to Play
				</Panel>
			)}

			{paused && <PauseMenu hud={hud} client={client} onLeave={onLeave} />}

			{over && <GameOver hud={hud} client={client} onLeave={onLeave} />}
		</div>
	);
}

const TIME = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const HEAD = 'pb-1.5 pl-3 text-right font-medium';
const CELL = 'py-1.5 pl-3 text-right';

// The game in numbers: each player's totals, then round by round. Shown on
// the pause screen as it goes, and at the end.
function Stats({ stats, you }: { stats: GameStats; you?: string }) {
	const solo = stats.players.length < 2;
	return (
		<>
			{/* scrolls sideways rather than squashing on a narrow window */}
			<div className="w-full overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="text-muted-foreground">
						<tr>
							<th className="pb-1.5 text-left font-medium">Player</th>
							{['Kills', 'Headshots', 'Earned', 'Spent', 'Downs', 'Revives'].map((h) => (
								<th key={h} className={HEAD}>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{stats.players.map((p) => (
							<tr key={p.id} className="border-t border-border">
								<td className={cn('py-1.5', p.id !== you && 'text-muted-foreground')}>{p.name}</td>
								{[p.kills, p.headshots, p.earned, p.spent, p.downs, p.revives].map((v, i) => (
									<td key={i} className={CELL}>
										{NUMBER.format(v)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{stats.rounds.length > 0 && (
				<>
					<p className="mt-5 text-sm">By Round</p>
					<div className="mt-1.5 max-h-56 w-full overflow-y-auto">
						<table className="w-full text-sm">
							<thead className="sticky top-0 bg-background text-muted-foreground">
								<tr>
									<th className="pb-1.5 text-left font-medium">Round</th>
									<th className={HEAD}>Time</th>
									{solo ? (
										<>
											<th className={HEAD}>Kills</th>
											<th className={HEAD}>Earned</th>
										</>
									) : (
										stats.players.map((p) => (
											<th key={p.id} className={HEAD}>
												{p.name}
											</th>
										))
									)}
								</tr>
							</thead>
							<tbody>
								{/* latest first, so the round being played is on top */}
								{stats.rounds
									.map((r, i) => ({ ...r, n: i + 1 }))
									.reverse()
									.map((r) => (
										<tr key={r.n} className="border-t border-border">
											<td className="py-1.5">{r.n}</td>
											<td className={cn(CELL, 'text-muted-foreground')}>{TIME(r.time)}</td>
											{solo ? (
												<>
													<td className={CELL}>{r.kills[0] ?? 0}</td>
													<td className={CELL}>{NUMBER.format(r.earned[0] ?? 0)}</td>
												</>
											) : (
												r.kills.map((k, j) => (
													<td key={j} className={CELL}>
														{k}
														<span className="text-muted-foreground">
															{' · '}
															{NUMBER.format(r.earned[j])}
														</span>
													</td>
												))
											)}
										</tr>
									))}
							</tbody>
						</table>
					</div>
					<p className="mt-1.5 text-[0.8125rem] text-muted-foreground">
						{solo
							? 'Time is spent fighting, not counting breaks.'
							: "Each player's kills · points earned that round. Time is spent fighting, not counting breaks."}
					</p>
				</>
			)}
		</>
	);
}

const STATS_WIDTH = 'w-[min(48rem,calc(100vw-2rem))]';

function GameOver({
	hud,
	client,
	onLeave
}: {
	hud: HudState;
	client: GameClient;
	onLeave: () => void;
}) {
	return (
		<Card className={STATS_WIDTH}>
			<p className="text-2xl tracking-tight">Game Over</p>
			<p className="mb-4 text-sm text-muted-foreground">
				{hud.round === 1 ? 'You Survived 1 Round' : `You Survived ${hud.round} Rounds`}
			</p>
			{hud.stats && <Stats stats={hud.stats} you={hud.players.find((p) => p.you)?.id} />}
			<div className="mt-4 flex gap-2">
				{hud.isHost && <Button onClick={() => client.restart()}>Play Again</Button>}
				<Button variant="outline" onClick={onLeave}>
					Leave
				</Button>
			</div>
		</Card>
	);
}

// how many are paused, and how many have dropped out and may be back
function pausedLine(paused: number, away: number, players: number) {
	if (!away) return `${paused} of ${players} Paused`;
	if (!paused) return `${away} of ${players} Away`;
	return `${paused} Paused, ${away} Away`;
}

// The pause screen: the menu and the settings side by side, with the game's
// numbers so far in a card below, as wide as the two together.
function PauseMenu({
	hud,
	client,
	onLeave
}: {
	hud: HudState;
	client: GameClient;
	onLeave: () => void;
}) {
	return (
		<Overlay>
			<div className={cn('grid gap-4 md:grid-cols-2', STATS_WIDTH)}>
				<Box>
					<p className="text-2xl tracking-tight">Paused</p>
					<p className="text-sm text-muted-foreground">
						{hud.players.length < 2
							? 'The game is paused'
							: hud.held
								? hud.players.some((p) => p.away)
									? 'Everyone is paused or away, so the game is too'
									: `All ${hud.players.length} Paused, so the game is too`
								: `${pausedLine(
										Math.max(1, hud.players.filter((p) => p.paused).length),
										hud.players.filter((p) => p.away).length,
										hud.players.length
									)}. The game keeps going until everyone is`}
					</p>
					<Controls className="mt-2 w-full" />
					<div className="mt-auto flex gap-2 pt-3">
						<Button onClick={() => client.lock()}>Play</Button>
						<Button variant="outline" onClick={onLeave}>
							Leave
						</Button>
					</div>
				</Box>
				<Box>
					<p className="text-2xl tracking-tight">Settings</p>
					<SettingsForm className="mt-3 w-full" />
				</Box>
				<Box className="md:col-span-2">
					<p className="text-2xl tracking-tight">Stats</p>
					<p className="mb-4 text-sm text-muted-foreground">
						{hud.round ? `Round ${hud.round} so far` : 'Nothing yet, the first round is coming'}
					</p>
					{hud.stats && <Stats stats={hud.stats} you={hud.players.find((p) => p.you)?.id} />}
				</Box>
			</div>
		</Overlay>
	);
}

// Dims and blurs the game behind one or more boxes, centred, and scrolling
// rather than cut off when they're taller than the window.
function Overlay({ children }: { children: React.ReactNode }) {
	return (
		<div className="pointer-events-auto absolute inset-0 flex overflow-y-auto bg-background/40 p-4 backdrop-blur-sm">
			<div className="m-auto flex flex-wrap justify-center gap-4">{children}</div>
		</div>
	);
}

function Box({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				'flex min-w-72 flex-col items-start gap-1 rounded-xl border border-border bg-background p-6 shadow-lg',
				className
			)}
		>
			{children}
		</div>
	);
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<Overlay>
			<Box className={className}>{children}</Box>
		</Overlay>
	);
}

// One piece of the HUD: frosted glass, so the game shows through, blurred
// enough that the text stays readable over whatever is behind it.
function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<div
			className={cn(
				'rounded-xl border border-white/50 bg-white/55 shadow-sm backdrop-blur-md',
				className
			)}
		>
			{children}
		</div>
	);
}

function Boost({ label, left }: { label: string; left: number }) {
	return (
		<Panel
			className={cn(
				'px-3 py-1.5 text-sm tracking-wide uppercase',
				left <= 5 && 'animate-pulse text-destructive'
			)}
		>
			{label} <span className="text-muted-foreground tabular-nums">{left}</span>
		</Panel>
	);
}

function Progress({ value, className }: { value: number; className?: string }) {
	return (
		<div className={cn('h-0.5 w-40 overflow-hidden rounded-full bg-foreground/15', className)}>
			<div className="h-full bg-foreground" style={{ width: `${Math.min(1, value) * 100}%` }} />
		</div>
	);
}

function HitMark() {
	return (
		<svg
			viewBox="0 0 20 20"
			className="size-full"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
		>
			<path d="M3 3l4.5 4.5M17 3l-4.5 4.5M3 17l4.5-4.5M17 17l-4.5-4.5" />
		</svg>
	);
}
