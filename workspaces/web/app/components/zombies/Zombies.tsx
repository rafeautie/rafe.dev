import { CheckIcon, SettingsIcon } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { loadArt } from '~/lib/zombies/game/art';
import { loadSounds } from '~/lib/zombies/game/audio';
import { loadCast } from '~/lib/zombies/game/character';
import { loadGuns } from '~/lib/zombies/game/guns';
import { REFUSALS } from '~/lib/zombies/net';
import { Session } from '~/lib/zombies/session';
import { MAX_PLAYERS, isLobbyCode } from '~/lib/zombies/signal';
import { Game } from './Game';
import { SettingsForm } from './Settings';

const NAME_KEY = 'zombies-name';
const CARD = 'rounded-xl border border-black/10 bg-black/[0.02] p-6';

const CONTROLS = [
	['WASD', 'Move'],
	['SHIFT', 'Sprint'],
	['SPACE', 'Jump'],
	['C', 'Crouch, Slide'],
	['Click', 'Shoot'],
	['Right Click', 'Aim'],
	['R', 'Reload'],
	['V', 'Knife'],
	['F', 'Buy, Open, Revive, Rebuild'],
	['1 2', 'Swap Guns'],
	['ESC', 'Pause']
];

function savedName() {
	try {
		return localStorage.getItem(NAME_KEY) ?? '';
	} catch {
		return '';
	}
}

// The /zombies page: a name and a button to host or join, then the lobby,
// then the game.
export default function Zombies({ lobby }: { lobby?: string }) {
	const [name, setName] = useState(savedName);
	const [session, setSession] = useState<Session | null>(null);
	const joinCode = lobby && isLobbyCode(lobby) ? lobby : null;
	const state = useSyncExternalStore(
		session?.subscribe ?? noSubscribe,
		session?.getState ?? noState,
		noState
	);

	useEffect(() => () => session?.close(), [session]);
	// the characters, the world's art, the guns and the sounds download while players
	// gather in the lobby
	useEffect(() => {
		if (!session) return;
		void loadCast();
		void loadArt();
		void loadGuns();
		void loadSounds();
	}, [session]);

	// a lost connection or a refused join lands back on the start screen
	const closed = state?.status === 'closed';
	const shownError = closed && state.error ? (REFUSALS[state.error] ?? 'The game ended') : null;

	const begin = (host: boolean) => {
		const clean = name.trim().slice(0, 16) || 'Player';
		try {
			localStorage.setItem(NAME_KEY, clean);
		} catch {
			// remembered for this visit only
		}
		setSession(host ? Session.host(clean) : Session.join(joinCode!, clean));
	};

	const leave = () => {
		session?.close();
		setSession(null);
		// a stale invite would only rejoin a lobby that may be gone
		if (joinCode) history.replaceState(null, '', '/zombies');
	};

	if (session && state?.status === 'playing') {
		return <Game session={session} onLeave={leave} />;
	}

	return (
		<div className="flex min-h-dvh flex-col p-6 text-base text-foreground sm:p-8">
			<SlashNav className="text-xl font-medium">
				<Link href="/">rafe</Link>
				zombies
			</SlashNav>
			{/* boxed in like the tiles elsewhere on the site, with the controls and
			    settings a click away in a window of their own */}
			<div className={`relative m-auto w-full max-w-sm ${CARD}`}>
				<ControlsAndSettings />
				{!session || !state || closed ? (
					<Start
						name={name}
						setName={setName}
						joinCode={joinCode}
						error={shownError}
						onHost={() => begin(true)}
						onJoin={() => begin(false)}
					/>
				) : state.status === 'connecting' ? (
					<p className="text-sm font-medium text-muted-foreground">
						{state.isHost ? 'Opening a Lobby' : `Joining Lobby ${state.code}`}
					</p>
				) : (
					<Lobby session={session} onLeave={leave} />
				)}
			</div>
		</div>
	);
}

// The cog in the card's corner, and the window it opens: controls and
// settings, one tab at a time.
function ControlsAndSettings() {
	return (
		<Dialog>
			<DialogTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						className="absolute top-4 right-4 text-muted-foreground"
						aria-label="Controls and Settings"
					/>
				}
			>
				<SettingsIcon />
			</DialogTrigger>
			<DialogContent className="p-6 sm:max-w-sm">
				<DialogTitle className="sr-only">Controls and Settings</DialogTitle>
				<Tabs defaultValue="controls" className="gap-4">
					<TabsList variant="line" className="-ml-1.5">
						<TabsTrigger value="controls" className="text-lg tracking-tight">
							Controls
						</TabsTrigger>
						<TabsTrigger value="settings" className="text-lg tracking-tight">
							Settings
						</TabsTrigger>
					</TabsList>
					<TabsContent value="controls">
						<Controls />
					</TabsContent>
					<TabsContent value="settings">
						<SettingsForm />
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}

const noSubscribe = () => () => {};
const noState = () => null;

function Start(props: {
	name: string;
	setName: (name: string) => void;
	joinCode: string | null;
	error: string | null;
	onHost: () => void;
	onJoin: () => void;
}) {
	return (
		<form
			className="flex flex-col gap-6"
			onSubmit={(e) => {
				e.preventDefault();
				if (props.joinCode) props.onJoin();
				else props.onHost();
			}}
		>
			<div className="flex flex-col gap-1.5">
				<h1 className="text-[1.625rem] font-medium tracking-tight">Zombies</h1>
				<p className="text-sm font-medium text-pretty text-muted-foreground">
					Round after round of the dead, in the style of Black Ops 2. Your browser hosts the game;
					send the invite link to up to {MAX_PLAYERS - 1} friends.
				</p>
			</div>
			<label className="flex flex-col gap-1.5 text-sm font-medium">
				Name
				<Input
					value={props.name}
					maxLength={16}
					placeholder="Player"
					onChange={(e) => props.setName(e.target.value)}
				/>
			</label>
			<div className="flex gap-2">
				{props.joinCode ? (
					<>
						<Button type="submit">Join Lobby {props.joinCode}</Button>
						<Button type="button" variant="outline" onClick={props.onHost}>
							Host My Own
						</Button>
					</>
				) : (
					<Button type="submit">Start a Lobby</Button>
				)}
			</div>
			{matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches && (
				<p className="text-sm font-medium text-muted-foreground">
					Zombies needs a keyboard and mouse
				</p>
			)}
			{props.error && <p className="text-sm font-medium text-destructive">{props.error}</p>}
		</form>
	);
}

function Lobby({ session, onLeave }: { session: Session; onLeave: () => void }) {
	const state = useSyncExternalStore(session.subscribe, session.getState);
	const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(session.inviteLink);
			setCopied('yes');
		} catch {
			setCopied('failed');
		}
		setTimeout(() => setCopied(null), 1500);
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1.5">
				<h1 className="text-[1.625rem] font-medium tracking-tight">Lobby {state.code}</h1>
				<p className="text-sm font-medium text-muted-foreground">
					{state.isHost ? 'Send this link to whoever is playing' : 'Waiting for the host to start'}
				</p>
			</div>
			<div className="flex flex-col gap-2">
				<p className="text-sm font-medium text-muted-foreground">
					Players {state.players.length}/{MAX_PLAYERS}
				</p>
				<ul className="flex flex-col gap-1">
					{state.players.map((p, i) => (
						<li key={p.id} className="flex items-baseline gap-2 font-medium">
							{p.name}
							<span className="text-sm text-muted-foreground">
								{[i === 0 && 'Host', p.id === state.you && 'You'].filter(Boolean).join(', ')}
							</span>
						</li>
					))}
				</ul>
			</div>
			<div className="flex flex-wrap gap-2">
				{state.isHost && (
					<>
						<Button onClick={() => session.start()}>Start Game</Button>
						{/* a fixed width, so the row does not shift as the label changes */}
						<Button variant="outline" onClick={copy} className="w-36">
							{copied === 'yes' ? (
								<>
									<CheckIcon />
									Copied
								</>
							) : copied === 'failed' ? (
								'Copy Failed'
							) : (
								'Copy Invite Link'
							)}
						</Button>
					</>
				)}
				<Button variant="outline" onClick={onLeave}>
					Leave
				</Button>
			</div>
		</div>
	);
}

export function Controls({ className }: { className?: string }) {
	return (
		<dl
			className={`grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[0.8125rem] font-medium ${className ?? ''}`}
		>
			{/* what it does on the left, the key for it on the right */}
			{CONTROLS.map(([key, action]) => (
				<div key={key} className="contents">
					<dt className="text-muted-foreground">{action}</dt>
					<dd className="text-right text-foreground">{key}</dd>
				</div>
			))}
		</dl>
	);
}
