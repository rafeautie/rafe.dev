export type WeaponId = 'm1911' | 'olympia' | 'm14' | 'mp5' | 'ak74u' | 'remington' | 'galil';

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
		length: 0.7,
		force: 5
	}
};

// A refill at a wall costs half the gun.
export const ammoCost = (weapon: Weapon) => Math.round(weapon.cost / 2 / 10) * 10;

export const KNIFE = { damage: 150, range: 1.9, cooldown: 0.65, force: 3 };
