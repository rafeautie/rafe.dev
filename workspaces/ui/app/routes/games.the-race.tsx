import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';

export const Route = createFileRoute('/games/the-race')({
	component: TheRaceLandingPage,
});

function TheRaceLandingPage() {
	const navigate = useNavigate();
	const [name, setName] = useState(() => {
		if (typeof localStorage === 'undefined') return '';
		return localStorage.getItem('playerName') ?? '';
	});
	const [code, setCode] = useState('');
	const [mode, setMode] = useState<'choose' | 'join'>('choose');
	const [error, setError] = useState('');
	const codeRef = useRef<HTMLInputElement>(null);

	function getOrCreatePlayerId(): string {
		let id = localStorage.getItem('playerId');
		if (!id) {
			id = crypto.randomUUID();
			localStorage.setItem('playerId', id);
		}
		return id;
	}

	function saveName(n: string) {
		setName(n);
		localStorage.setItem('playerName', n);
	}

	function handleCreate() {
		if (!name.trim()) {
			setError('Enter your name first');
			return;
		}
		getOrCreatePlayerId();
		const gameCode = crypto.randomUUID().substring(0, 4).toUpperCase();
		navigate({ to: '/games/the-race/$gameId', params: { gameId: gameCode } });
	}

	function handleJoin() {
		if (mode === 'choose') {
			setMode('join');
			setTimeout(() => codeRef.current?.focus(), 0);
			return;
		}
		if (!name.trim()) {
			setError('Enter your name first');
			return;
		}
		if (code.trim().length !== 4) {
			setError('Enter the 4-character game code');
			return;
		}
		navigate({ to: '/games/the-race/$gameId', params: { gameId: code.trim().toUpperCase() } });
	}

	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-8 p-10">
			<h1 className="text-3xl font-semibold tracking-wide">The Race</h1>
			<div className="flex w-full max-w-sm flex-col gap-4">
				<div className="flex flex-col gap-1">
					<label htmlFor="name" className="text-sm font-medium text-black/60">
						Your name
					</label>
					<input
						id="name"
						type="text"
						value={name}
						onChange={(e) => saveName(e.target.value)}
						placeholder="Rafe"
						className="rounded-lg border border-black/20 px-4 py-2 outline-none focus:border-black"
					/>
				</div>

				{mode === 'join' && (
					<div className="flex flex-col gap-1">
						<label htmlFor="code" className="text-sm font-medium text-black/60">
							Game code
						</label>
						<input
							id="code"
							ref={codeRef}
							type="text"
							value={code}
							onChange={(e) => setCode(e.target.value.toUpperCase())}
							placeholder="XKCD"
							maxLength={4}
							className="rounded-lg border border-black/20 px-4 py-2 font-mono tracking-widest outline-none focus:border-black"
						/>
					</div>
				)}

				{error && <p className="text-sm text-red-500">{error}</p>}

				<div className="flex gap-3">
					<button
						onClick={handleCreate}
						className="flex-1 rounded-lg bg-black px-4 py-2 font-medium text-white hover:bg-black/80"
					>
						Create game
					</button>
					<button
						onClick={handleJoin}
						className="flex-1 rounded-lg border border-black/20 px-4 py-2 font-medium hover:bg-black/5"
					>
						{mode === 'choose' ? 'Join game' : 'Join'}
					</button>
				</div>
			</div>
		</div>
	);
}
