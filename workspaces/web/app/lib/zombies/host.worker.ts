import { HostGame, drive, type GameSave } from './host';
import type { HostMessage, PlayerMessage } from './protocol';

// The host's game, off the main thread. The host's browser runs everyone's
// game as well as drawing its own view of it, and on one thread a slow frame
// holds the zombies up and a slow tick holds the picture up; in a worker each
// has a thread of its own. Only the main thread has the connections, so
// session.ts (WorkerHost) passes in what the players say and sends out what
// the game says back.

// main thread to worker
export type HostRequest =
	// a new game, or one carried on from a save, run by the player `me`
	| { t: 'init'; save: GameSave | null; me: string }
	| { t: 'addPlayer'; id: string; name: string }
	| { t: 'leave'; id: string }
	| { t: 'handle'; from: string; m: PlayerMessage }
	| { t: 'stop' };

// worker to main thread
export type HostResponse =
	// something the game said to one player, for the main thread to deliver
	| { t: 'out'; to: string; m: HostMessage }
	// a copy of the game, every couple of seconds, for the other players to
	// carry on from if the host leaves
	| { t: 'save'; save: GameSave };

let game: HostGame | null = null;
let stop = () => {};

function post(m: HostResponse) {
	self.postMessage(m);
}

self.onmessage = (e: MessageEvent<HostRequest>) => {
	const m = e.data;
	if (m.t === 'init') {
		stop();
		const send = (to: string, message: HostMessage) => post({ t: 'out', to, m: message });
		game = m.save ? HostGame.restore(send, m.save, m.me) : new HostGame(send);
		stop = drive(game, m.me, (save) => post({ t: 'save', save }));
		return;
	}
	if (!game) return;
	switch (m.t) {
		case 'addPlayer':
			// no room: said as a message to them, so the main thread turns that
			// connection away the same way whether the game is here or there
			if (!game.addPlayer(m.id, m.name)) post({ t: 'out', to: m.id, m: { t: 'full' } });
			break;
		case 'leave':
			game.leave(m.id);
			break;
		case 'handle':
			game.handle(m.from, m.m);
			break;
		case 'stop':
			stop();
			stop = () => {};
			game = null;
			break;
	}
};
