import { useSyncExternalStore } from 'react';
import { Button } from '~/components/ui/button';
import type { GameClient } from '~/lib/zombies/game/client';
import { PLAYER } from '~/lib/zombies/rules';
import { cn } from '~/lib/utils';
import { Controls } from './Zombies';

const NUMBER = new Intl.NumberFormat('en-US');

// Everything drawn over the game, kept as quiet as the rest of the site:
// Geist in title case on white panels, one panel per thing, with numbers that do
// not jump as they change.
export function Hud({ client, onLeave }: { client: GameClient; onLeave: () => void }) {
	const hud = useSyncExternalStore(client.subscribe, client.getHud);
	const hurt = Math.max(0, 1 - hud.hp / PLAYER.health);
	const over = hud.phase === 'over';
	const paused = !hud.locked && !over;

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
					</Panel>
				)}
				{hud.note && <Panel className="px-3.5 py-2 text-sm text-destructive">{hud.note}</Panel>}
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

			{paused && (
				<Card>
					<p className="text-2xl tracking-tight">Paused</p>
					<p className="text-sm text-muted-foreground">The game keeps going for everyone else</p>
					<Controls className="mt-2" />
					<div className="mt-3 flex gap-2">
						<Button onClick={() => client.lock()}>Play</Button>
						<Button variant="outline" onClick={onLeave}>
							Leave
						</Button>
					</div>
				</Card>
			)}

			{over && (
				<Card>
					<p className="text-2xl tracking-tight">Game Over</p>
					<p className="text-sm text-muted-foreground">
						{hud.round === 1 ? 'You Survived 1 Round' : `You Survived ${hud.round} Rounds`}
					</p>
					<ul className="mt-2 flex w-full flex-col gap-1 text-sm">
						{hud.players.map((p) => (
							<li key={p.id} className="flex justify-between gap-6">
								<span>{p.name}</span>
								<span className="text-muted-foreground">{p.kills} Kills</span>
							</li>
						))}
					</ul>
					<div className="mt-3 flex gap-2">
						{hud.isHost && <Button onClick={() => client.restart()}>Play Again</Button>}
						<Button variant="outline" onClick={onLeave}>
							Leave
						</Button>
					</div>
				</Card>
			)}
		</div>
	);
}

function Card({ children }: { children: React.ReactNode }) {
	return (
		<div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
			<div className="flex min-w-72 flex-col items-start gap-1 rounded-xl border border-border bg-background p-6 shadow-lg">
				{children}
			</div>
		</div>
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
