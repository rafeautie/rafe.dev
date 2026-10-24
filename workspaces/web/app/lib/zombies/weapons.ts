export type WeaponId =
	| 'm1911'
	| 'olympia'
	| 'm14'
	| 'mp5'
	| 'ak74u'
	| 'remington'
	| 'galil'
	| 'python'
	| 'rpd'
	| 'raygun';

// How a gun is reloaded, which sets the motion and the sounds: a magazine
// swapped, a pistol's magazine and slide, shells pushed in one at a time
// (and a reload that can be cut short by firing), a break-action opened,
// or a belt fed into a machine gun.
export type ReloadStyle = 'mag' | 'pistol' | 'shells' | 'break' | 'belt' | 'cell';

export type Weapon = {
	id: WeaponId;
	name: string;
	damage: number; // per pellet
	pellets: number;
	headshot: number; // damage multiplier
	rpm: number;
	auto: boolean;
	mag: number;
	reserve: number; // spare ammo when bought
	reload: number; // seconds
	spread: number; // radians from the hip; aiming down sights narrows it
	range: number;
	kick: number; // how far the view climbs per shot, radians
	cost: number;
	// seconds to bring it up after a swap
	swap: number;
	// how much narrower the view gets aiming down its sights, in degrees
	adsZoom: number;
	reloadStyle: ReloadStyle;
	// only from the Mystery Box, never on a wall
	boxOnly?: boolean;
	// the streak another player sees when it's fired
	tracer?: string;
	// how the gun is drawn in the player's hands
	length: number;
	// how hard a kill throws the body
	force: number;
};

export const WEAPONS: Record<WeaponId, Weapon> = {
	m1911: {
		id: 'm1911',
		name: 'M1911',
		damage: 40,
		pellets: 1,
		headshot: 2.5,
		rpm: 420,
		auto: false,
		mag: 8,
		reserve: 32,
		reload: 1.5,
		spread: 0.03,
		range: 60,
		kick: 0.025,
		cost: 0,
		swap: 0.35,
		adsZoom: 10,
		reloadStyle: 'pistol',
		length: 0.2,
		force: 3
	},
	olympia: {
		id: 'olympia',
		name: 'Olympia',
		damage: 45,
		pellets: 8,
		headshot: 1.5,
		rpm: 140,
		auto: false,
		mag: 2,
		reserve: 38,
		reload: 2.4,
		spread: 0.09,
		range: 25,
		kick: 0.08,
		cost: 500,
		swap: 0.5,
		adsZoom: 10,
		reloadStyle: 'break',
		length: 0.6,
		force: 9
	},
	m14: {
		id: 'm14',
		name: 'M14',
		damage: 110,
		pellets: 1,
		headshot: 3,
		rpm: 500,
		auto: false,
		mag: 8,
		reserve: 92,
		reload: 2,
		spread: 0.02,
		range: 90,
		kick: 0.035,
		cost: 500,
		swap: 0.55,
		adsZoom: 30,
		reloadStyle: 'mag',
		length: 0.65,
		force: 5
	},
	mp5: {
		id: 'mp5',
		name: 'MP5',
		damage: 45,
		pellets: 1,
		headshot: 2.5,
		rpm: 780,
		auto: true,
		mag: 30,
		reserve: 120,
		reload: 2,
		spread: 0.035,
		range: 60,
		kick: 0.012,
		cost: 1000,
		swap: 0.45,
		adsZoom: 15,
		reloadStyle: 'mag',
		length: 0.45,
		force: 3.5
	},
	ak74u: {
		id: 'ak74u',
		name: 'AK74u',
		damage: 70,
		pellets: 1,
		headshot: 2.5,
		rpm: 700,
		auto: true,
		mag: 20,
		reserve: 160,
		reload: 2.2,
		spread: 0.04,
		range: 70,
		kick: 0.016,
		cost: 1200,
		swap: 0.45,
		adsZoom: 16,
		reloadStyle: 'mag',
		length: 0.5,
		force: 4.5
	},
	remington: {
		id: 'remington',
		name: 'Remington 870',
		damage: 70,
		pellets: 8,
		headshot: 1.5,
		rpm: 75,
		auto: false,
		mag: 8,
		reserve: 32,
		reload: 3,
		spread: 0.07,
		range: 30,
		kick: 0.07,
		cost: 1500,
		swap: 0.55,
		adsZoom: 12,
		reloadStyle: 'shells',
		length: 0.7,
		force: 10
	},
	galil: {
		id: 'galil',
		name: 'Galil',
		damage: 95,
		pellets: 1,
		headshot: 2.5,
		rpm: 650,
		auto: true,
		mag: 35,
		reserve: 315,
		reload: 2.6,
		spread: 0.035,
		range: 90,
		kick: 0.018,
		cost: 1500,
		swap: 0.55,
		adsZoom: 22,
		reloadStyle: 'mag',
		length: 0.7,
		force: 5
	},
	python: {
		id: 'python',
		name: 'Python',
		damage: 180,
		pellets: 1,
		headshot: 2,
		rpm: 220,
		auto: false,
		mag: 6,
		reserve: 84,
		reload: 2.8,
		spread: 0.025,
		range: 70,
		kick: 0.06,
		cost: 0,
		swap: 0.4,
		adsZoom: 12,
		reloadStyle: 'break',
		boxOnly: true,
		length: 0.3,
		force: 8
	},
	rpd: {
		id: 'rpd',
		name: 'RPD',
		damage: 100,
		pellets: 1,
		headshot: 2.5,
		rpm: 750,
		auto: true,
		mag: 100,
		reserve: 400,
		reload: 4.2,
		spread: 0.045,
		range: 90,
		kick: 0.014,
		cost: 0,
		swap: 0.8,
		adsZoom: 18,
		reloadStyle: 'belt',
		boxOnly: true,
		length: 0.8,
		force: 6
	},
	raygun: {
		id: 'raygun',
		name: 'Ray Gun',
		damage: 1000,
		pellets: 1,
		headshot: 1,
		rpm: 180,
		auto: false,
		mag: 20,
		reserve: 160,
		reload: 2.6,
		spread: 0.015,
		range: 80,
		kick: 0.03,
		cost: 0,
		swap: 0.45,
		adsZoom: 14,
		reloadStyle: 'cell',
		boxOnly: true,
		tracer: '#5dff74',
		length: 0.35,
		force: 12
	}
};

// what the Mystery Box can give
export const BOX_WEAPONS = (Object.keys(WEAPONS) as WeaponId[]).filter((id) => id !== 'm1911');

// A refill at a wall costs half the gun.
export const ammoCost = (weapon: Weapon) => Math.round(weapon.cost / 2 / 10) * 10;

export const KNIFE = { damage: 150, range: 1.9, cooldown: 0.65, force: 3 };
