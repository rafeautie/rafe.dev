import { useEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { TheRaceLogo } from './TheRaceLogo';
import { HostChip } from './HostChip';
import { HowToPlay } from './HowToPlay';
import { cn } from '~/lib/utils';
import { Copy, CopyCheck, Pencil } from 'lucide-react';
import type { RaceSession } from '../hooks/useRaceSession';

interface LobbyViewProps {
	gameId: string;
	session: RaceSession;
}

export function LobbyView({ gameId, session }: LobbyViewProps) {
	const { state, playerId, me, startSeason, renamePlayer } = session;
	const isHost = me?.isHost ?? false;
	const [copied, setCopied] = useState(false);
	const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	useEffect(() => () => clearTimeout(copyTimer.current ?? undefined), []);

	async function handleCopy() {
		const url = window.location.origin + pathname;
		await navigator.clipboard.writeText(url);
		setCopied(true);
		clearTimeout(copyTimer.current ?? undefined);
		copyTimer.current = setTimeout(() => setCopied(false), 2000);
	}

	function startEditing() {
		setDraft(me?.name ?? '');
		setEditing(true);
	}

	function commitName() {
		const next = draft.trim();
		if (next && next !== me?.name) renamePlayer(next);
		setEditing(false);
	}

	if (!state) return null;

	const enoughPlayers = state.players.length >= 2;
	const status = isHost
		? enoughPlayers
			? 'Ready to start'
			: 'Share the code — at least 2 players needed'
		: 'Waiting for the host to start…';

	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-6 p-10">
			<TheRaceLogo />

			<HowToPlay label="How to play" variant="the-race-bg" size="lg" />

			<Card variant="the-race-white" className="w-full max-w-sm border-black/10 shadow-none">
				<CardContent>
					<p className="mb-2 font-bold text-black/50">Players ({state.players.length}/6)</p>
					<ul className="flex flex-col gap-1.5">
						{state.players.map((p) => {
							const isMe = p.id === playerId;
							return (
								<li key={p.id} className="flex min-h-8 items-center gap-2">
									{isMe && editing ? (
										<Input
											variant="the-race-white"
											autoFocus
											value={draft}
											maxLength={20}
											onChange={(e) => setDraft(e.target.value)}
											onBlur={commitName}
											onKeyDown={(e) => {
												if (e.key === 'Enter') commitName();
												if (e.key === 'Escape') setEditing(false);
											}}
											className="h-8 w-40"
										/>
									) : (
										<>
											<span className={isMe ? 'font-bold' : ''}>{p.name}</span>

											{isMe && (
												<button
													type="button"
													onClick={startEditing}
													aria-label="Edit your name"
													className="pb-0.5 text-the-race-bg-from/40 hover:text-the-race-bg-from"
												>
													<Pencil className="size-3" />
												</button>
											)}
										</>
									)}
									<div className="ml-auto flex items-center gap-2">
										{p.isHost && <HostChip />}
										<span
											className={cn(
												'ml-auto size-2 rounded-full',
												p.connected ? 'bg-emerald-500' : 'bg-amber-500'
											)}
											role="status"
											aria-label={p.connected ? 'connected' : 'reconnecting'}
											title={p.connected ? 'Connected' : 'Reconnecting…'}
										/>
									</div>
								</li>
							);
						})}
					</ul>

					<p className="mt-3 text-sm text-black/45">{status}</p>
				</CardContent>
				<CardFooter className="group-data-[variant=the-race-white]/card flex items-center justify-between gap-3">
					{isHost && (
						<Button
							className="flex-2 font-bold tracking-wide"
							onClick={startSeason}
							disabled={!enoughPlayers}
							size="lg"
							variant="the-race-red"
						>
							Start Season
						</Button>
					)}
					<Button
						className="flex-1 font-mono text-lg font-bold tracking-widest"
						onClick={handleCopy}
						aria-label="Copy invite link"
						title="Copy invite link"
						variant="the-race-bg"
						size="lg"
					>
						{gameId}
						{copied ? <CopyCheck /> : <Copy />}
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
