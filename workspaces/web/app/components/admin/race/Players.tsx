import { BanIcon, PencilIcon, RotateCcwIcon, UndoIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { banRacePlayer, renameRacePlayer, resetRacePlayer } from '~/lib/race/admin';
import { cn } from '~/lib/utils';
import { Empty, Panel, StatCard } from '~/components/admin/cards';
import { Table, Heading } from './parts';
import { NUMBER } from '~/lib/admin/format';
import { timeAgo } from '~/lib/admin/time';
import { cell, number, type Act, type View } from './format';

// The players with the game open now, and under them everyone who has played,
// most recently seen first, each with what can be done to them at the end of
// their row, which stays in view while a narrow table scrolls sideways. Over
// them, how many are about and how the chips
// are spread, which is where trouble (a run of bankruptcies, one player
// hoarding) shows first. Those figures are of the players listed, so they
// follow the search.

type Player = View['players'][number];

/** The room sends at most this many, the most recently seen. */
const SHOWN = 100;

const DAY = 24 * 60 * 60 * 1000;

export function Players({
	players,
	live,
	watching,
	clock,
	search,
	setSearch,
	busy,
	act
}: {
	players: Player[];
	/** The players with the game open now, whatever is searched for. */
	live: Player[];
	/** How many that is, counting the ones a long list leaves out. */
	watching: number;
	/** The room's time at its latest answer: near enough to count today's players. */
	clock: number;
	search: string;
	setSearch: (search: string) => void;
	busy: boolean;
	act: Act;
}) {
	const [asking, setAsking] = useState<{ kind: 'reset' | 'ban'; player: Player } | null>(null);
	// kept apart from who is asked about, so the dialog still names them while it fades out
	const [confirming, setConfirming] = useState(false);
	const ask = (kind: 'reset' | 'ban', player: Player) => {
		setAsking({ kind, player });
		setConfirming(true);
	};
	const [renaming, setRenaming] = useState<Player | null>(null);
	const [name, setName] = useState('');
	const rename = (player: Player) => {
		setName(player.name);
		setRenaming(player);
	};
	const unban = (player: Player) =>
		void act(() => banRacePlayer({ data: { id: player.id, banned: false } }));
	const owing = players.filter((player) => player.debt > 0);
	const debt = owing.length;
	const today = players.filter((player) => clock - player.seen < DAY).length;
	const held = players.reduce((sum, player) => sum + player.balance, 0);
	const richest = players.reduce<Player | null>(
		(top, player) => (!player.banned && (!top || player.balance > top.balance) ? player : top),
		null
	);
	const banned = players.filter((player) => player.banned).length;
	const summary = [
		`${players.length === SHOWN ? `${SHOWN}+` : players.length} ${players.length === 1 ? 'player' : 'players'}`,
		debt && `${debt} owing re-ups`,
		banned && `${banned} banned`
	]
		.filter(Boolean)
		.join(' · ');
	return (
		<div className="@container flex flex-col gap-4">
			<Heading>players</Heading>
			<div className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
				<StatCard label="watching now" value={NUMBER.format(watching)} />
				<StatCard label="seen today" value={NUMBER.format(today)} />
				<StatCard
					label="chips held"
					value={NUMBER.format(held)}
					hint={richest ? `most: ${richest.name}` : undefined}
				/>
				<StatCard
					label="owing re-ups"
					value={NUMBER.format(debt)}
					hint={
						debt
							? `owing ${NUMBER.format(owing.reduce((sum, player) => sum + player.debt, 0))}`
							: undefined
					}
				/>
			</div>
			<Panel
				title="live players"
				description={`${NUMBER.format(watching)} with the game open now, richest first`}
				flush
			>
				{live.length ? (
					<Roster players={live} busy={busy} rename={rename} ask={ask} unban={unban} />
				) : (
					<div className="px-4">
						<Empty>Nobody has the game open.</Empty>
					</div>
				)}
			</Panel>
			<Panel
				title="everyone who has played"
				description={search ? `${summary} named like “${search}”` : summary}
				action={
					<Input
						type="search"
						aria-label="Search players by name"
						placeholder="Search names"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						className="w-36 sm:w-48"
					/>
				}
				flush
			>
				{players.length ? (
					<Roster players={players} busy={busy} rename={rename} ask={ask} unban={unban} />
				) : (
					<div className="px-4">
						<Empty>{search ? 'Nobody by that name.' : 'Nobody has played yet.'}</Empty>
					</div>
				)}

				<ConfirmDialog
					open={confirming}
					onOpenChange={setConfirming}
					title={
						asking?.kind === 'ban'
							? `Ban ${asking.player.name}?`
							: `Reset ${asking?.player.name}'s chips?`
					}
					description={
						asking?.kind === 'ban'
							? 'They can still watch, but cannot bet and are left off the leaderboard. Their bets on this race are handed back.'
							: 'Their balance goes back to the starting chips, any re-up loan is wiped, and the change is recorded.'
					}
					confirm={asking?.kind === 'ban' ? 'Ban' : 'Reset chips'}
					destructive
					onConfirm={() => {
						if (!asking) return;
						const { id } = asking.player;
						void act(() =>
							asking.kind === 'ban'
								? banRacePlayer({ data: { id, banned: true } })
								: resetRacePlayer({ data: { id } })
						);
					}}
				/>
				<Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
					<DialogContent>
						<form
							className="grid gap-4"
							onSubmit={(event) => {
								event.preventDefault();
								const id = renaming!.id;
								setRenaming(null);
								void act(() => renameRacePlayer({ data: { id, name } }));
							}}
						>
							<DialogHeader>
								<DialogTitle>Rename {renaming?.name}</DialogTitle>
							</DialogHeader>
							<Input
								aria-label="New name"
								value={name}
								maxLength={16}
								onChange={(event) => setName(event.target.value)}
							/>
							<DialogFooter>
								<Button type="submit">Rename</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</Panel>
		</div>
	);
}

// A table of players, each with what can be done to them at the end of the
// row. The live players and everyone who has played are both listed this way.
function Roster({
	players,
	busy,
	rename,
	ask,
	unban
}: {
	players: Player[];
	busy: boolean;
	rename: (player: Player) => void;
	ask: (kind: 'reset' | 'ban', player: Player) => void;
	unban: (player: Player) => void;
}) {
	return (
		<Table
			head={['name', 'chips', 'owes', 'bets', 'bankrupt', 'last seen', '']}
			right={[1, 2, 3, 4]}
		>
			{players.map((player) => (
				<tr key={player.id} className={cn(player.banned && 'text-foreground/50')}>
					<td className={cell}>
						{player.name}
						<span className="ml-1.5 text-foreground/50">#{player.id}</span>
						{player.banned && (
							<Badge variant="destructive" className="ml-2">
								Banned
							</Badge>
						)}
					</td>
					<td className={number}>{NUMBER.format(player.balance)}</td>
					<td className={cn(number, player.debt > 0 && 'text-destructive')}>
						{player.debt ? NUMBER.format(player.debt) : '–'}
					</td>
					<td className={number}>{NUMBER.format(player.bets)}</td>
					<td className={number}>{player.bankruptcies || '–'}</td>
					<td className={cn(cell, 'text-foreground/50')} suppressHydrationWarning>
						{timeAgo(player.seen)}
					</td>
					<td className={cn(cell, 'sticky right-0 bg-card py-1 text-right')}>
						<div className="inline-flex gap-0.5">
							<Action
								label={`Rename ${player.name}`}
								disabled={busy}
								onClick={() => rename(player)}
							>
								<PencilIcon />
							</Action>
							<Action
								label={`Reset ${player.name}’s chips`}
								disabled={busy}
								onClick={() => ask('reset', player)}
							>
								<RotateCcwIcon />
							</Action>
							<Action
								label={player.banned ? `Unban ${player.name}` : `Ban ${player.name}`}
								disabled={busy}
								destructive={!player.banned}
								onClick={() => (player.banned ? unban(player) : ask('ban', player))}
							>
								{player.banned ? <UndoIcon /> : <BanIcon />}
							</Action>
						</div>
					</td>
				</tr>
			))}
		</Table>
	);
}

// an icon button, named by its tooltip, so the three fit at the end of a row on a phone
function Action({
	label,
	disabled,
	destructive = false,
	onClick,
	children
}: {
	label: string;
	disabled: boolean;
	destructive?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={label}
						disabled={disabled}
						onClick={onClick}
						className={cn(destructive && 'hover:text-destructive')}
					/>
				}
			>
				{children}
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
