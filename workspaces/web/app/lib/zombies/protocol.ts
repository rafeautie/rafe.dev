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
	stance: Stance;
	flags: number; // POSE_* below, so others can be drawn as they are
};

export type Stance = 0 | 1 | 2; // standing, crouching, sliding
export const STAND = 0;
export const CROUCH = 1;
export const SLIDE = 2;

// what a player is doing, as bits
export const POSE_SPRINT = 1;
export const POSE_ADS = 2;
export const POSE_RELOAD = 4;
export const POSE_PAUSED = 8;
export const POSE_AIR = 16;

// [id, x, z, yaw, speed class, flags]; see ZOMBIE_* below
export type ZombieSnap = [number, number, number, number, number, number];
export const ZOMBIE_ATTACKING = 1;
export const ZOMBIE_RISING = 2;
// knocked back by a hit, and slowed for a moment
export const ZOMBIE_STAGGER = 4;

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

// Totals for one player over a whole game, for the game over screen.
export type PlayerStats = {
	id: string;
	name: string;
	kills: number;
	headshots: number; // kills by a shot to the head
	earned: number; // points from hits, before anything was spent
	spent: number; // on doors and guns
	downs: number;
	revives: number; // teammates picked up
};

export type GameStats = {
	players: PlayerStats[];
	// one entry per round reached, the last perhaps unfinished; kills and
	// earned follow the order of players
	rounds: { time: number; kills: number[]; earned: number[] }[];
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
	| { t: 'over'; round: number; stats: GameStats }
	| { t: 'stats'; stats: GameStats }
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
			stance: Stance;
			flags: number; // POSE_SPRINT, POSE_ADS, POSE_RELOAD, POSE_AIR
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
	// the numbers so far, for the pause screen
	| { t: 'stats' }
	| { t: 'restart' };

export const RELIABLE = (m: HostMessage | PlayerMessage) => m.t !== 'snap' && m.t !== 'me';
