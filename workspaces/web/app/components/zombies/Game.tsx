import { useEffect, useRef, useState } from 'react';
import { loadArt } from '~/lib/zombies/game/art';
import { loadCast } from '~/lib/zombies/game/character';
import { loadGuns } from '~/lib/zombies/game/guns';
import { GameClient } from '~/lib/zombies/game/client';
import type { Session } from '~/lib/zombies/session';
import { Hud } from './Hud';

// The game, full screen: the 3D view with the HUD over it.
export function Game({ session, onLeave }: { session: Session; onLeave: () => void }) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const [client, setClient] = useState<GameClient | null>(null);

	useEffect(() => {
		let game: GameClient | null = null;
		let cancelled = false;
		// the wall drawings and name tags are drawn in Geist, so wait for it,
		// and for the characters (begun in the lobby, so usually here already)
		void Promise.all([loadCast(), loadArt(), loadGuns(), document.fonts.ready]).then(
			([cast, art, guns]) => {
				if (cancelled || !canvas.current) return;
				game = new GameClient(canvas.current, session, cast, art, guns);
				game.start();
				// straight into the game: the click on Start Game still counts, so
				// the mouse can be captured without another one
				game.lock();
				setClient(game);
				// for poking at the game from the console while developing
				if (import.meta.env.DEV) Object.assign(window, { zombies: game });
			}
		);
		return () => {
			cancelled = true;
			game?.dispose();
		};
	}, [session]);

	return (
		<div className="fixed inset-0 overflow-hidden bg-[#0e0b0d] select-none">
			<canvas ref={canvas} className="block h-full w-full" onClick={() => client?.lock()} />
			{!client && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 font-archivo tracking-[0.3em] text-white/70 uppercase font-stretch-75%">
					<p className="animate-pulse text-xl font-semibold">Loading</p>
					<p className="text-xs tracking-[0.25em] text-white/40">The town, the dead, the guns</p>
				</div>
			)}
			{client && <Hud client={client} onLeave={onLeave} />}
		</div>
	);
}
