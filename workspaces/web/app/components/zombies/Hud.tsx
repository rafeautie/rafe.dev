import '@fontsource-variable/archivo/standard.css';
import '@fontsource/rubik-dirt';
import { useSyncExternalStore, type ComponentProps } from 'react';
import type { GameClient, HudState } from '~/lib/zombies/game/client';
import type { GameStats } from '~/lib/zombies/protocol';
import { PERKS, type PerkId } from '~/lib/zombies/rules';
import { cn } from '~/lib/utils';
import { SettingsForm } from './Settings';
import { Controls } from './Zombies';

const NUMBER = new Intl.NumberFormat('en-US');

// each player's points in their own colour, in the order they joined
const PLAYER_COLORS = ['#f4f1ea', '#6cb6ff', '#ffd24d', '#7ee08a'];
// the round, scrawled in blood
const BLOOD = '#b3141c';
// the gold of a power-up, and of whatever the menus pick out
const GOLD = '#e8b84a';
// white text that stays readable over a bright sky or a dark wall
const SHADOW = '[text-shadow:0_1px_2px_rgb(0_0_0/0.9),0_0_12px_rgb(0_0_0/0.5)]';
const CHALK = "font-[family-name:'Rubik_Dirt'] font-normal tracking-normal normal-case";

// Everything drawn over the game, in the style of the games it's after: no
// boxes in the corners, just condensed capitals with a shadow, the round in a
// rough red scrawl (tally marks for the first five, as in Black Ops 2), the
// points beside it, perks above it, the gun and its ammo opposite, and
// power-ups along the bottom. Prompts sit on dark bands. The menus are dark
// panels picked out in gold.
export function Hud({ client, onLeave }: { client: GameClient; onLeave: () => void }) {
	const hud = useSyncExternalStore(client.subscribe, client.getHud);
	const hurt = Math.max(0, 1 - hud.hp / hud.maxHp);
	const over = hud.phase === 'over';
	const downed = hud.life === 'downed';
	// before the mouse is first captured there is nothing to pause, just a click to start
	const waiting = !hud.locked && !hud.played && !over;
	const paused = !hud.locked && hud.played && !over;
	const pausedCount = hud.players.filter((p) => p.paused).length;
	const awayCount = hud.players.filter((p) => p.away).length;
	const lowAmmo = hud.mag > 0 && hud.mag <= Math.max(1, Math.round(hud.magSize * 0.25));
	const inPlay = hud.life !== 'dead' && !over;

	return (
		<div
			className={cn(
				'pointer-events-none absolute inset-0 font-archivo font-semibold tracking-wide text-white uppercase font-stretch-75% tabular-nums',
				SHADOW
			)}
		>
			{/* the edges always a little dark, like a lens, and the colour
			    drained while downed */}
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/0.45)_125%)]" />
			{downed && !over && (
				<div className="absolute inset-0 backdrop-brightness-[0.78] backdrop-grayscale-[0.8]" />
			)}

			{/* damage: the edges close in as health drops, and throb when it's low */}
			<div
				className="absolute inset-0 transition-opacity duration-300"
				style={{
					opacity: downed ? 0.55 : hurt * 0.85,
					background:
						'radial-gradient(ellipse at center, transparent 45%, color-mix(in oklch, var(--destructive) 35%, black 20%) 130%)'
				}}
			/>
			{hurt > 0.5 && !downed && inPlay && (
				<div
					className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(160_10_20/0.55)_110%)]"
					style={{ animation: `zombies-pulse ${1.1 - (hurt - 0.5)}s ease-in-out infinite` }}
				/>
			)}
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

			{/* a new round, called out over everything for a moment */}
			{hud.round > 0 && !over && (
				<div
					key={`splash-${hud.round}`}
					className="absolute top-[18%] left-0 flex w-full flex-col items-center"
					style={{ animation: 'zombies-round 3.6s ease-out forwards' }}
				>
					<p className="text-sm tracking-[0.45em] text-white/80">Round</p>
					<p className={cn(CHALK, 'text-[7rem] leading-none')} style={{ color: BLOOD }}>
						{hud.round}
					</p>
				</div>
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

			{/* crosshair: four ticks that open as the player moves and shoots and
			    close down the sights, with a mark for each hit */}
			{inPlay && (
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
					<Crosshair spread={hud.spread} ads={hud.ads} />
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

			{/* the gun running dry, just under the crosshair */}
			{inPlay && !hud.reloading && hud.life === 'alive' && (hud.mag === 0 || lowAmmo) && (
				<p
					className={cn(
						'absolute top-[56%] left-1/2 -translate-x-1/2 text-sm tracking-[0.3em]',
						hud.mag === 0 ? 'animate-pulse text-red-400' : 'text-amber-300/90'
					)}
				>
					{hud.mag === 0 ? (hud.reserve > 0 ? 'Reload' : 'No Ammo') : 'Low Ammo'}
				</p>
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
					<div
						key={hud.note.text}
						className={cn(
							'px-12 py-1.5',
							hud.note.warning
								? 'text-base text-red-400'
								: 'text-3xl tracking-[0.2em] [text-shadow:0_0_18px_rgb(232_184_74/0.6),0_2px_3px_rgb(0_0_0/0.9)]'
						)}
						style={{
							color: hud.note.warning ? undefined : GOLD,
							animation: hud.note.warning ? undefined : 'zombies-flash 0.5s ease-out both'
						}}
					>
						{hud.note.text}
					</div>
				)}
			</div>

			{/* downed or dead */}
			{hud.life !== 'alive' && !over && (
				<Panel className="absolute top-[24%] left-1/2 flex min-w-72 -translate-x-1/2 flex-col items-center gap-1 px-14 py-3 text-center">
					<p className={cn(CHALK, 'text-5xl')} style={{ color: BLOOD }}>
						{downed ? 'Downed' : 'You Bled Out'}
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

			{/* power-ups running, along the bottom */}
			{(hud.instakill > 0 || hud.double > 0) && !over && (
				<div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-5">
					{hud.instakill > 0 && <Boost kind="instakill" left={hud.instakill} />}
					{hud.double > 0 && <Boost kind="double" left={hud.double} />}
				</div>
			)}

			{/* the round, the points beside it, and the perks above, bottom left */}
			<div className="absolute bottom-5 left-5 flex flex-col gap-2">
				{hud.perks.length > 0 && (
					<div className="flex gap-1.5">
						{hud.perks.map((perk) => (
							<PerkIcon key={perk} perk={perk} />
						))}
					</div>
				)}
				<div className="flex items-end gap-5">
					<div className="flex flex-col">
						<RoundMark round={hud.round} />
						<p className="mt-1 text-xs tracking-[0.2em] text-white/60">
							{hud.phase === 'break'
								? hud.round
									? `Next Round in ${hud.timer}`
									: `Starting in ${hud.timer}`
								: `${hud.left} Left`}
						</p>
					</div>
					<ul className="mb-5 flex flex-col gap-0.5">
						{hud.players.map((p, i) => (
							<li key={p.id} className="relative flex items-baseline gap-3">
								<span
									className={cn('min-w-16 text-left', p.you ? 'text-2xl' : 'text-lg')}
									style={{ color: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
								>
									{NUMBER.format(p.points)}
								</span>
								<span
									className={cn(
										'text-sm text-white/60 normal-case',
										p.state !== 'alive' && 'line-through'
									)}
								>
									{p.name}
								</span>
								{(p.paused || p.away) && (
									<span className="text-xs text-white/55">{p.away ? 'Away' : 'Paused'}</span>
								)}
								{p.you &&
									hud.pops.map((pop) => (
										<span
											key={pop.id}
											className={cn(
												'absolute left-full ml-3 animate-out duration-1000 fill-mode-forwards fade-out slide-out-to-top-3',
												pop.amount < 0 ? 'text-red-400' : 'text-amber-200'
											)}
										>
											{pop.amount > 0 ? '+' : '−'}
											{Math.abs(pop.amount)}
										</span>
									))}
							</li>
						))}
					</ul>
				</div>
			</div>

			{/* the gun and its ammo, bottom right */}
			{hud.life !== 'dead' && (
				<div
					className="absolute right-5 bottom-5 flex flex-col items-end border-r-2 pr-3"
					style={{ borderColor: BLOOD }}
				>
					<p
						className={cn(
							'text-sm tracking-[0.2em] text-white/75',
							hud.reloading && 'animate-pulse'
						)}
					>
						{hud.reloading ? 'Reloading' : hud.weapon}
					</p>
					<p className="font-bold">
						<span
							className={cn(
								'text-5xl leading-none',
								hud.mag === 0 ? 'text-red-500' : lowAmmo && 'text-amber-300'
							)}
						>
							{hud.mag}
						</span>
						<span className="text-2xl text-white/55"> / {hud.reserve}</span>
					</p>
				</div>
			)}

			{waiting && (
				<Panel className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-6 px-12 py-1.5 text-base tracking-[0.25em]">
					Click to Play
				</Panel>
			)}

			{paused && <PauseMenu hud={hud} client={client} onLeave={onLeave} />}

			{over && <GameOver hud={hud} client={client} onLeave={onLeave} />}
		</div>
	);
}

// The round: tally marks scratched up for the first five, the way the games
// this is after count them, then a number.
function RoundMark({ round }: { round: number }) {
	if (round < 1 || round > 5) {
		return (
			<p
				key={`round-${round}`}
				className={cn(CHALK, 'animate-in text-8xl leading-[0.85] duration-1000 fade-in')}
				style={{ color: BLOOD }}
			>
				{round || '–'}
			</p>
		);
	}
	return (
		<svg
			key={`round-${round}`}
			viewBox="0 0 110 100"
			className="h-20 w-auto animate-in duration-1000 fade-in"
			stroke={BLOOD}
			strokeWidth="9"
			strokeLinecap="round"
			fill="none"
		>
			{Array.from({ length: Math.min(4, round) }, (_, i) => (
				<path
					key={i}
					d={`M${16 + i * 22} ${10 + (i % 2) * 3} q ${i % 2 ? 3 : -3} 42 ${i % 2 ? -1 : 2} 80`}
				/>
			))}
			{round === 5 && <path d="M4 72 Q 50 48 98 22" strokeWidth="8" />}
		</svg>
	);
}

// Four ticks round the middle, opening with `spread` and fading away as the
// player looks down the sights.
function Crosshair({ spread, ads }: { spread: number; ads: number }) {
	const gap = 5 + spread * 16;
	const tick =
		'absolute bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)] transition-transform duration-75';
	return (
		<div className="relative size-0 transition-opacity" style={{ opacity: 1 - ads }}>
			<div className="absolute -top-px -left-px size-0.5 rounded-full bg-white" />
			<div
				className={cn(tick, 'h-2 w-0.5 -translate-x-1/2')}
				style={{ transform: `translate(-50%, ${-gap - 8}px)` }}
			/>
			<div className={cn(tick, 'h-2 w-0.5')} style={{ transform: `translate(-50%, ${gap}px)` }} />
			<div
				className={cn(tick, 'h-0.5 w-2')}
				style={{ transform: `translate(${-gap - 8}px, -50%)` }}
			/>
			<div className={cn(tick, 'h-0.5 w-2')} style={{ transform: `translate(${gap}px, -50%)` }} />
		</div>
	);
}

const PERK_GLYPHS: Record<PerkId, string> = {
	// a shield, a bolt, two rounds, a cross
	jugg: 'M12 3 L19 6 V12 C19 16.5 16 19.5 12 21 C8 19.5 5 16.5 5 12 V6 Z',
	speed: 'M13 2 L5 13 H11 L10 22 L19 10 H13 Z',
	tap: 'M8 3 C9.5 3 10 4.5 10 6 V18 H6 V6 C6 4.5 6.5 3 8 3 Z M16 3 C17.5 3 18 4.5 18 6 V18 H14 V6 C14 4.5 14.5 3 16 3 Z',
	revive: 'M9 3 H15 V9 H21 V15 H15 V21 H9 V15 H3 V9 H9 Z'
};

// A perk, as a small square badge in its colour with a glyph on it.
function PerkIcon({ perk }: { perk: PerkId }) {
	const { color, name } = PERKS[perk];
	return (
		<span
			title={name}
			className="flex size-9 items-center justify-center rounded-sm ring-1 ring-black/60 [text-shadow:none]"
			style={{
				background: `linear-gradient(160deg, color-mix(in oklch, ${color} 75%, white), ${color} 50%, color-mix(in oklch, ${color} 55%, black))`,
				boxShadow: `0 0 10px color-mix(in oklch, ${color} 60%, transparent)`
			}}
		>
			<svg
				viewBox="0 0 24 24"
				className="size-6 fill-white/95 drop-shadow-[0_1px_1px_rgb(0_0_0/0.6)]"
			>
				<path d={PERK_GLYPHS[perk]} />
			</svg>
		</span>
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
							<thead className="sticky top-0 bg-[#0e0b0d] text-muted-foreground">
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
const HEADING =
	'font-archivo text-3xl font-bold tracking-[0.12em] uppercase font-stretch-75% leading-none';

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
			<p className={cn(CHALK, 'text-6xl leading-none')} style={{ color: BLOOD }}>
				Game Over
			</p>
			<p className="mt-1 mb-5 text-sm tracking-[0.2em] text-muted-foreground uppercase">
				{hud.round === 1 ? 'You Survived 1 Round' : `You Survived ${hud.round} Rounds`}
			</p>
			{hud.stats && <Stats stats={hud.stats} you={hud.players.find((p) => p.you)?.id} />}
			<div className="mt-5 flex gap-2">
				{hud.isHost && (
					<MenuButton primary onClick={() => client.restart()}>
						Play Again
					</MenuButton>
				)}
				<MenuButton onClick={onLeave}>Leave</MenuButton>
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
// numbers so far in a panel below, as wide as the two together.
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
					<p className="mt-1 text-sm text-muted-foreground">
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
					<Controls className="mt-3 w-full" />
					<div className="mt-auto flex gap-2 pt-4">
						<MenuButton primary onClick={() => client.lock()}>
							Resume
						</MenuButton>
						<MenuButton onClick={onLeave}>Leave</MenuButton>
					</div>
				</Box>
				<Box>
					<p className={HEADING}>Settings</p>
					<SettingsForm className="mt-3 w-full" />
				</Box>
				<Box className="md:col-span-2">
					<p className={HEADING}>Stats</p>
					<p className="mt-1 mb-4 text-sm text-muted-foreground">
						{hud.round ? `Round ${hud.round} so far` : 'Nothing yet, the first round is coming'}
					</p>
					{hud.stats && <Stats stats={hud.stats} you={hud.players.find((p) => p.you)?.id} />}
				</Box>
			</div>
		</Overlay>
	);
}

// Dims and blurs the game behind one or more panels, centred, and scrolling
// rather than cut off when they're taller than the window.
function Overlay({ children }: { children: React.ReactNode }) {
	return (
		<div className="dark pointer-events-auto absolute inset-0 flex overflow-y-auto bg-black/60 p-4 font-sans font-medium tracking-normal text-foreground normal-case font-stretch-100% backdrop-blur-sm [text-shadow:none]">
			<div className="m-auto flex flex-wrap justify-center gap-4">{children}</div>
		</div>
	);
}

// A menu panel: near black, square cornered, with a line of gold along the top.
function Box({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				'flex min-w-72 flex-col items-start rounded-sm border border-white/10 bg-[#0e0b0d]/92 p-6 shadow-[0_24px_60px_rgb(0_0_0/0.6)]',
				className
			)}
			style={{ borderTop: `2px solid ${GOLD}` }}
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

// A menu's button: condensed capitals, gold when it's the one to press.
function MenuButton({
	primary,
	className,
	...props
}: ComponentProps<'button'> & { primary?: boolean }) {
	return (
		<button
			type="button"
			className={cn(
				'cursor-pointer border px-5 py-2 font-archivo text-sm font-semibold tracking-[0.2em] uppercase font-stretch-75% transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
				primary
					? 'border-[#e8b84a]/70 text-[#f3d27a] hover:bg-[#e8b84a]/15 hover:text-white focus-visible:outline-[#e8b84a]'
					: 'border-white/20 text-white/75 hover:border-white/60 hover:text-white focus-visible:outline-white/60',
				className
			)}
			{...props}
		/>
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

// A power-up running: its badge, a skull for Insta-Kill and a 2 for Double
// Points, with the seconds left, flashing as they run out.
function Boost({ kind, left }: { kind: 'instakill' | 'double'; left: number }) {
	const ending = left <= 5;
	return (
		<div className={cn('flex flex-col items-center gap-1', ending && 'animate-pulse')}>
			<span
				className="flex size-11 items-center justify-center rounded-full ring-2 [text-shadow:none]"
				style={{
					background: `radial-gradient(circle at 35% 30%, #fff1c0, ${GOLD} 55%, #8a6318)`,
					boxShadow: `0 0 14px color-mix(in oklch, ${GOLD} 70%, transparent)`,
					borderColor: ending ? '#ff6b5b' : 'transparent',
					['--tw-ring-color' as string]: ending ? '#ff6b5b' : 'rgb(0 0 0 / 0.6)'
				}}
			>
				{kind === 'instakill' ? (
					<svg viewBox="0 0 24 24" className="size-7 fill-[#1a1208]">
						<path d="M12 2a8 8 0 0 0-8 8c0 2.7 1.3 5 3.3 6.4V20a2 2 0 0 0 2 2h5.4a2 2 0 0 0 2-2v-3.6C18.7 15 20 12.7 20 10a8 8 0 0 0-8-8Zm-3 9.5A1.8 1.8 0 1 1 9 8a1.8 1.8 0 0 1 0 3.5Zm6 0A1.8 1.8 0 1 1 15 8a1.8 1.8 0 0 1 0 3.5ZM10 19v-2h1.5v2Zm2.5 0v-2H14v2Z" />
					</svg>
				) : (
					<span className="text-2xl font-black text-[#1a1208]">×2</span>
				)}
			</span>
			<span className={cn('text-sm tracking-[0.15em]', ending ? 'text-red-300' : 'text-amber-200')}>
				{left}
			</span>
		</div>
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
