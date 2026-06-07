import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { TheRaceLogo } from '~/games/the-race/components/TheRaceLogo';

export const Route = createFileRoute('/games/the-race/')({
	component: TheRaceLandingPage
});

function TheRaceLandingPage() {
	const navigate = useNavigate();
	const [name, setName] = useState(() => {
		if (typeof localStorage === 'undefined') return '';
		return localStorage.getItem('playerName') ?? '';
	});
	const [code, setCode] = useState('');
	const [error, setError] = useState('');

	function saveName(n: string) {
		setName(n);
		localStorage.setItem('playerName', n);
	}

	function handleCreate() {
		if (!name.trim()) {
			setError('Enter your name first');
			return;
		}
		const gameCode = crypto.randomUUID().substring(0, 4).toUpperCase();
		navigate({ to: '/games/the-race/$gameId', params: { gameId: gameCode } });
	}

	function handleJoin() {
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
			<TheRaceLogo />

			<Card variant="the-race-white" className="w-full max-w-sm">
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="name"
							className="text-md font-bold tracking-wide text-the-race-bg-from/60"
						>
							Name
						</label>
						<Input
							variant="the-race-white"
							id="name"
							type="text"
							value={name}
							onChange={(e) => saveName(e.target.value)}
							placeholder="Rafe"
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="code"
							className="text-md font-bold tracking-wide text-the-race-bg-from/60"
						>
							Game Code
						</label>
						<Input
							variant="the-race-white"
							id="code"
							type="text"
							value={code}
							onChange={(e) => setCode(e.target.value.toUpperCase())}
							placeholder="XKCD"
							maxLength={4}
							className="font-mono tracking-widest"
						/>
					</div>

					{error && <p className="text-sm text-the-race-red-from">{error}</p>}
				</CardContent>
				<CardFooter className="flex gap-3">
					<Button onClick={handleCreate} className="flex-1" size="lg">
						Create Game
					</Button>
					<Button onClick={handleJoin} variant="outline" className="flex-1" size="lg">
						Join Game
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
