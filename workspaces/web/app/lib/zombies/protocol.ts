import type { WeaponId } from './weapons';

// Messages between the host's game and each player, over WebRTC data
// channels (the host's own player takes a shortcut that skips the network).
// Snapshots and position updates go on an unreliable channel, since a late one
// is worthless; everything else goes on a reliable one.

export type Phase = 'lobby' | 'playing' | 'break' | 'over';
export type LifeState = 'alive' | 'downed' | 'dead';

export type PlayerSnap = {
	id: string;
	name: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
	hp: number;
	state: LifeState;
	bleed: number; // seconds until bleeding out, while downed
	revive: number; // 0 to 1, while being revived
	points: number;
	kills: number;
	weapon: WeaponId;
	shots: number; // counts up with each shot, so others can see it
	knifes: number; // the same, for the knife
};

// [id, x, z, yaw, speed class, flags]; see ZOMBIE_* below
export type ZombieSnap = [number, number, number, number, number, number];
export const ZOMBIE_ATTACKING = 1;
export const ZOMBIE_RISING = 2;

export type Snapshot = {
	t: 'snap';
	time: number;
	phase: Phase;
	round: number;
	left: number; // zombies still to kill this round
	timer: number; // seconds left in a break
	held: boolean; // everyone is paused, so the game is too
	players: PlayerSnap[];
	zombies: ZombieSnap[];
};

export type HostMessage =
	| Snapshot
	| {
			t: 'welcome';
			you: string;
			phase: Phase;
			round: number;
			doors: boolean[];
			// where this player starts
			x: number;
			z: number;
	  }
	| { t: 'lobby'; players: { id: string; name: string }[] }
	// the game already has as many players as it takes
	| { t: 'full' }
	| { t: 'start' }
	| {
			t: 'died';
			id: number;
			// the push from the killing blow
			dir: [number, number, number];
			force: number;
			head: boolean;
	  }
	// a zombie taken away without dying, to come back closer
	| { t: 'gone'; id: number }
	| { t: 'door'; door: number; by: string }
	| { t: 'grant'; weapon: WeaponId; ammo: boolean }
	| { t: 'denied' }
	| { t: 'hurt'; from: [number, number] }
	| { t: 'points'; amount: number }
	| { t: 'respawn'; x: number; z: number }
	| { t: 'round'; round: number }
	| { t: 'over'; round: number }
	| { t: 'restart' };

export type PlayerMessage =
	| { t: 'hello'; name: string }
	| {
			t: 'me';
			x: number;
			y: number;
			z: number;
			yaw: number;
			pitch: number;
			weapon: WeaponId;
			shots: number;
			knifes: number;
			reviving: string | null;
			// in the pause menu, or not yet clicked in
			paused: boolean;
	  }
	| {
			t: 'hit';
			zombie: number;
			damage: number;
			head: boolean;
			knife: boolean;
			dir: [number, number, number];
			force: number;
	  }
	| { t: 'buyWeapon'; wall: number; owned: boolean }
	| { t: 'buyDoor'; door: number }
	| { t: 'start' }
	| { t: 'restart' };

export const RELIABLE = (m: HostMessage | PlayerMessage) => m.t !== 'snap' && m.t !== 'me';
