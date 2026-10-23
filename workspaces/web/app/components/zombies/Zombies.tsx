import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { REFUSALS } from '~/lib/zombies/net';
import { Session } from '~/lib/zombies/session';
import { MAX_PLAYERS, isLobbyCode } from '~/lib/zombies/signal';
import { Game } from './Game';

const NAME_KEY = 'zombies-name';

const CONTROLS = [
	['wasd', 'move'],
	['shift', 'sprint'],
	['space', 'jump'],
	['click', 'shoot'],
	['right click', 'aim'],
	['r', 'reload'],
	['v', 'knife'],
	['f', 'buy, open, revive'],
	['1 2', 'swap guns'],
	['esc', 'pause']
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

	// a lost connection or a refused join lands back on the start screen
	const closed = state?.status === 'closed';
	const shownError = closed && state.error ? (REFUSALS[state.error] ?? 'the game ended') : null;

	const begin = (host: boolean) => {
		const clean = name.trim().slice(0, 16) || 'player';
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
		<div className="min-h-dvh p-6 text-base text-foreground sm:p-8">
			<SlashNav className="text-xl font-medium">
				<Link href="/">rafe</Link>
				zombies
			</SlashNav>
			<div className="mx-auto mt-16 flex max-w-sm flex-col gap-8 sm:mt-24">
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
						{state.isHost ? 'opening a lobby' : `joining lobby ${state.code}`}
					</p>
				) : (
					<Lobby session={session} onLeave={leave} />
				)}
				<Controls />
			</div>
		</div>
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
				<h1 className="text-[1.625rem] font-medium tracking-tight">zombies</h1>
				<p className="text-sm font-medium text-pretty text-muted-foreground">
					Round after round of the dead, in the style of Black Ops 2. Your browser hosts the game;
					send the invite link to up to {MAX_PLAYERS - 1} friends.
				</p>
			</div>
			<label className="flex flex-col gap-1.5 text-sm font-medium">
				name
				<Input
					value={props.name}
					maxLength={16}
					placeholder="player"
					onChange={(e) => props.setName(e.target.value)}
				/>
			</label>
			<div className="flex gap-2">
				{props.joinCode ? (
					<>
						<Button type="submit">join lobby {props.joinCode}</Button>
						<Button type="button" variant="outline" onClick={props.onHost}>
							host my own
						</Button>
					</>
				) : (
					<Button type="submit">start a lobby</Button>
				)}
			</div>
			{matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches && (
				<p className="text-sm font-medium text-muted-foreground">
					zombies needs a keyboard and mouse
				</p>
			)}
			{props.error && <p className="text-sm font-medium text-destructive">{props.error}</p>}
		</form>
	);
}

function Lobby({ session, onLeave }: { session: Session; onLeave: () => void }) {
	const state = useSyncExternalStore(session.subscribe, session.getState);
	const [copied, setCopied] = useState(false);
	const link = session.inviteLink;

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// the link is on screen to copy by hand
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1.5">
				<h1 className="text-[1.625rem] font-medium tracking-tight">lobby {state.code}</h1>
				<p className="text-sm font-medium text-muted-foreground">
					{state.isHost ? 'send this link to whoever is playing' : 'waiting for the host to start'}
				</p>
			</div>
			{state.isHost && (
				<div className="flex items-center gap-2">
					<Input readOnly value={link} onFocus={(e) => e.target.select()} />
					<Button variant="outline" onClick={copy} className="w-16">
						{copied ? 'copied' : 'copy'}
					</Button>
				</div>
			)}
			<div className="flex flex-col gap-2">
				<p className="text-sm font-medium text-muted-foreground">
					players {state.players.length}/{MAX_PLAYERS}
				</p>
				<ul className="flex flex-col gap-1">
					{state.players.map((p, i) => (
						<li key={p.id} className="flex items-baseline gap-2 font-medium">
							{p.name}
							<span className="text-sm text-muted-foreground">
								{[i === 0 && 'host', p.id === state.you && 'you'].filter(Boolean).join(', ')}
							</span>
						</li>
					))}
				</ul>
			</div>
			<div className="flex gap-2">
				{state.isHost && <Button onClick={() => session.start()}>start game</Button>}
				<Button variant="outline" onClick={onLeave}>
					leave
				</Button>
			</div>
		</div>
	);
}

export function Controls({ className }: { className?: string }) {
	return (
		<dl
			className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.8125rem] font-medium ${className ?? ''}`}
		>
			{CONTROLS.map(([key, action]) => (
				<div key={key} className="contents">
					<dt className="text-foreground">{key}</dt>
					<dd className="text-muted-foreground">{action}</dd>
				</div>
			))}
		</dl>
	);
}
