import '@fontsource-variable/archivo/standard.css';
import '@fontsource/rubik-dirt';
import { useSyncExternalStore } from 'react';
import { Button } from '~/components/ui/button';
import type { GameClient, HudState } from '~/lib/zombies/game/client';
import type { GameStats } from '~/lib/zombies/protocol';
import { PERKS } from '~/lib/zombies/rules';
import { cn } from '~/lib/utils';
import { SettingsForm } from './Settings';
import { Controls } from './Zombies';

const NUMBER = new Intl.NumberFormat('en-US');

// each player's points in their own colour, in the order they joined
const PLAYER_COLORS = ['#f4f1ea', '#6cb6ff', '#ffd24d', '#7ee08a'];
// the round, scrawled in blood
const BLOOD = '#b3141c';
// white text that stays readable over a bright sky or a dark wall
const SHADOW = '[text-shadow:0_1px_2px_rgb(0_0_0/0.9),0_0_12px_rgb(0_0_0/0.5)]';

// Everything drawn over the game, in the style of the games it's after: no
// boxes in the corners, just condensed capitals with a shadow, the round in a
// rough red scrawl, and dark bands behind prompts, with numbers that do not
// jump as they change. The menus are dark cards.
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
		<div
			className={cn(
				'pointer-events-none absolute inset-0 font-archivo font-semibold tracking-wide text-white uppercase font-stretch-75% tabular-nums',
				SHADOW
			)}
		>
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
			<p
				className="absolute top-5 left-5 border-l-2 pl-2.5 text-sm tracking-[0.2em] text-white/85"
				style={{ borderColor: BLOOD }}
			>
				{hud.area}
			</p>

			{/* who's on the pause screen, when playing with others */}
			{hud.players.length > 1 && pausedCount + awayCount > 0 && !paused && !over && (
				<Panel className="absolute top-5 left-1/2 -translate-x-1/2 px-6 py-1 text-sm text-white/75">
					{pausedLine(pausedCount, awayCount, hud.players.length)}
				</Panel>
			)}

			{/* the host dropped out, or this player lost them for a moment */}
			{hud.reconnecting && !over && (
				<Panel className="absolute top-[30%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 px-14 py-3 text-center">
					<p className="animate-pulse text-2xl">Reconnecting</p>
					<p className="text-sm text-white/70">Your Points and Guns Are Kept</p>
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
					<Panel
						className={cn(
							'flex flex-col items-center px-12 py-1.5 text-base',
							hud.hint.muted && 'text-white/60'
						)}
					>
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
							'px-12 py-1.5',
							hud.note.warning ? 'text-base text-red-400' : 'text-lg tracking-[0.15em]'
						)}
					>
						{hud.note.text}
					</Panel>
				)}
			</div>

			{/* downed or dead */}
			{hud.life !== 'alive' && !over && (
				<Panel className="absolute top-[24%] left-1/2 flex min-w-72 -translate-x-1/2 flex-col items-center gap-1 px-14 py-3 text-center">
					<p
						className="font-[family-name:'Rubik_Dirt'] text-5xl font-normal tracking-normal normal-case"
						style={{ color: BLOOD }}
					>
						{hud.life === 'downed' ? 'Downed' : 'You Bled Out'}
					</p>
					<p className="text-sm text-white/75">
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
				<div className="absolute bottom-[8.5rem] left-5 flex gap-2">
					{hud.perks.map((perk) => (
						<span
							key={perk}
							title={PERKS[perk].name}
							className="flex size-9 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-black/50 [text-shadow:none]"
							style={{
								background: `radial-gradient(circle at 35% 30%, color-mix(in oklch, ${PERKS[perk].color} 70%, white), ${PERKS[perk].color} 55%, color-mix(in oklch, ${PERKS[perk].color} 60%, black))`
							}}
						>
							{PERKS[perk].short}
						</span>
					))}
				</div>
			)}

			{/* round, bottom left */}
			<div className="absolute bottom-5 left-5 flex flex-col">
				<p
					key={`round-${hud.round}`}
					className="animate-in font-[family-name:'Rubik_Dirt'] text-8xl leading-[0.85] font-normal tracking-normal duration-1000 fade-in"
					style={{ color: BLOOD }}
				>
					{hud.round || '–'}
				</p>
				<p className="mt-1 text-sm text-white/75">
					{hud.phase === 'break'
						? hud.round
							? `Next Round in ${hud.timer}`
							: `Starting in ${hud.timer}`
						: `${hud.left} Left`}
				</p>
			</div>

			{/* points and ammo, bottom right */}
			<div className="absolute right-5 bottom-5 flex flex-col items-end gap-2">
				<div>
					<ul className="flex flex-col items-end gap-0.5 text-base">
						{hud.players.map((p, i) => (
							<li key={p.id} className="relative flex items-baseline gap-3">
								{p.you &&
									hud.pops.map((pop) => (
										<span
											key={pop.id}
											className={cn(
												'absolute right-full mr-7 animate-out duration-1000 fill-mode-forwards fade-out slide-out-to-top-3',
												pop.amount < 0 ? 'text-red-400' : 'text-amber-200'
											)}
										>
											{pop.amount > 0 ? '+' : '−'}
											{Math.abs(pop.amount)}
										</span>
									))}
								{(p.paused || p.away) && (
									<span className="text-xs text-white/55">{p.away ? 'Away' : 'Paused'}</span>
								)}
								<span
									className={cn(
										'text-sm text-white/60 normal-case',
										p.state !== 'alive' && 'line-through'
									)}
								>
									{p.name}
								</span>
								<span
									className={cn('min-w-16 text-right', p.you ? 'text-2xl' : 'text-lg')}
									style={{ color: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
								>
									{NUMBER.format(p.points)}
								</span>
							</li>
						))}
					</ul>
				</div>
				{hud.life !== 'dead' && (
					<div className="flex flex-col items-end border-r-2 pr-3" style={{ borderColor: BLOOD }}>
						<p
							className={cn(
								'text-sm tracking-[0.2em] text-white/75',
								hud.reloading && 'animate-pulse'
							)}
						>
							{hud.reloading ? 'Reloading' : hud.weapon}
						</p>
						<p className="font-bold">
							<span className={cn('text-5xl leading-none', hud.mag === 0 && 'text-red-500')}>
								{hud.mag}
							</span>
							<span className="text-2xl text-white/55"> / {hud.reserve}</span>
						</p>
					</div>
				)}
			</div>

			{waiting && (
				<Panel className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-6 px-12 py-1.5 text-base">
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
const HEADING = 'font-archivo text-3xl font-bold tracking-wide uppercase font-stretch-75%';

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
			<p className={HEADING} style={{ color: BLOOD }}>
				Game Over
			</p>
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
					<p className={HEADING}>Paused</p>
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
					<p className={HEADING}>Settings</p>
					<SettingsForm className="mt-3 w-full" />
				</Box>
				<Box className="md:col-span-2">
					<p className={HEADING}>Stats</p>
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
		<div className="dark pointer-events-auto absolute inset-0 flex overflow-y-auto bg-black/55 p-4 font-sans font-medium tracking-normal text-foreground normal-case font-stretch-100% backdrop-blur-sm [text-shadow:none]">
			<div className="m-auto flex flex-wrap justify-center gap-4">{children}</div>
		</div>
	);
}

function Box({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				'flex min-w-72 flex-col items-start gap-1 rounded-xl border border-white/10 bg-neutral-950/85 p-6 shadow-2xl',
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

// A prompt or a message: a dark band that fades out at both ends, so it
// reads over anything without a hard box round it.
function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<div
			className={cn(
				'bg-[linear-gradient(90deg,transparent,rgb(0_0_0/0.6)_20%,rgb(0_0_0/0.6)_80%,transparent)]',
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
				'px-8 py-1 text-base tracking-[0.15em] text-amber-300',
				left <= 5 && 'animate-pulse text-red-400'
			)}
		>
			{label} <span className="text-white/70 tabular-nums">{left}</span>
		</Panel>
	);
}

function Progress({ value, className }: { value: number; className?: string }) {
	return (
		<div className={cn('h-1 w-44 overflow-hidden bg-white/20', className)}>
			<div className="h-full bg-white" style={{ width: `${Math.min(1, value) * 100}%` }} />
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
