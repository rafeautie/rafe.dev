import type { WeaponId } from '../weapons';

// Every sound is made on the spot with Web Audio, from filtered noise and a
// few tones, so the game ships no audio files. Each sound is one named
// method, so a recording can take its place later without the game
// noticing. Sounds given a place in the world come from there: louder up
// close, and from the left or right as the player turns.

const SHOT_TONE: Record<WeaponId, { freq: number; decay: number; boom: number }> = {
	m1911: { freq: 1400, decay: 0.12, boom: 0.4 },
	olympia: { freq: 700, decay: 0.32, boom: 1 },
	m14: { freq: 1100, decay: 0.2, boom: 0.7 },
	mp5: { freq: 1800, decay: 0.08, boom: 0.3 },
	ak74u: { freq: 1300, decay: 0.1, boom: 0.5 },
	remington: { freq: 600, decay: 0.36, boom: 1 },
	galil: { freq: 1200, decay: 0.12, boom: 0.6 },
	python: { freq: 900, decay: 0.26, boom: 0.9 },
	rpd: { freq: 1000, decay: 0.12, boom: 0.6 },
	raygun: { freq: 2400, decay: 0.2, boom: 0.3 }
};

export type Place = { x: number; y: number; z: number };
export type Surface = 'tile';
export type ReloadPart = 'out' | 'in' | 'shell' | 'pump' | 'slide' | 'open' | 'close';
export type PowerupKind = 'ammo' | 'instakill' | 'double' | 'nuke' | 'carpenter';
export type PerkId = 'jugg' | 'speed' | 'tap' | 'revive';

// each perk machine's tune, as notes over a base pitch
const PERK_TUNES: Record<PerkId, number[]> = {
	jugg: [0, 3, 7, 3, 0, -5],
	speed: [0, 4, 7, 12, 7, 4],
	tap: [0, 0, 7, 7, 5, 3],
	revive: [0, 5, 9, 12, 9, 5]
};

export class Sound {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private noise: AudioBuffer | null = null;
	private volume = 0.5;

	// 0 to 1, from the player's settings
	setVolume(volume: number) {
		this.volume = volume * 0.7;
		if (this.master) this.master.gain.value = this.volume;
	}

	// Browsers only allow sound after a click or key press.
	unlock() {
		if (this.ctx) {
			if (this.ctx.state === 'suspended') void this.ctx.resume();
			return;
		}
		const ctx = new AudioContext();
		this.ctx = ctx;
		this.master = ctx.createGain();
		this.master.gain.value = this.volume;
		this.master.connect(ctx.destination);
		const length = ctx.sampleRate;
		this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = this.noise.getChannelData(0);
		for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
	}

	// Where the player's ears are, and which way they face.
	listen(x: number, y: number, z: number, yaw: number) {
		const l = this.ctx?.listener;
		if (!l) return;
		const fx = -Math.sin(yaw);
		const fz = -Math.cos(yaw);
		if (l.positionX) {
			const t = this.ctx!.currentTime;
			l.positionX.setValueAtTime(x, t);
			l.positionY.setValueAtTime(y, t);
			l.positionZ.setValueAtTime(z, t);
			l.forwardX.setValueAtTime(fx, t);
			l.forwardY.setValueAtTime(0, t);
			l.forwardZ.setValueAtTime(fz, t);
			l.upX.setValueAtTime(0, t);
			l.upY.setValueAtTime(1, t);
			l.upZ.setValueAtTime(0, t);
		} else {
			l.setPosition(x, y, z);
			l.setOrientation(fx, 0, fz, 0, 1, 0);
		}
	}

	// where a sound goes in: straight out, or through a panner placed in the world
	private out(at?: Place): AudioNode | null {
		const { ctx, master } = this;
		if (!ctx || !master) return null;
		if (!at) return master;
		const panner = ctx.createPanner();
		panner.panningModel = 'HRTF';
		panner.distanceModel = 'inverse';
		panner.refDistance = 2;
		panner.rolloffFactor = 1.3;
		panner.maxDistance = 60;
		if (panner.positionX) {
			panner.positionX.value = at.x;
			panner.positionY.value = at.y;
			panner.positionZ.value = at.z;
		} else panner.setPosition(at.x, at.y, at.z);
		panner.connect(master);
		return panner;
	}

	private burst(
		opts: {
			freq: number;
			q: number;
			decay: number;
			gain: number;
			type?: BiquadFilterType;
			delay?: number;
		},
		at?: Place
	) {
		const { ctx, noise } = this;
		const out = this.out(at);
		if (!ctx || !noise || !out) return;
		const src = ctx.createBufferSource();
		src.buffer = noise;
		const filter = ctx.createBiquadFilter();
		filter.type = opts.type ?? 'bandpass';
		filter.frequency.value = opts.freq;
		filter.Q.value = opts.q;
		const gain = ctx.createGain();
		const now = ctx.currentTime + (opts.delay ?? 0);
		gain.gain.setValueAtTime(opts.gain, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + opts.decay);
		src.connect(filter).connect(gain).connect(out);
		src.start(now, Math.random() * 0.5, opts.decay + 0.05);
	}

	private tone(
		freq: number,
		decay: number,
		gain: number,
		type: OscillatorType = 'sine',
		end = freq,
		at?: Place,
		delay = 0
	) {
		const { ctx } = this;
		const out = this.out(at);
		if (!ctx || !out) return;
		const osc = ctx.createOscillator();
		osc.type = type;
		const now = ctx.currentTime + delay;
		osc.frequency.setValueAtTime(freq, now);
		osc.frequency.exponentialRampToValueAtTime(end, now + decay);
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, ctx.currentTime);
		g.gain.setValueAtTime(gain, now);
		g.gain.exponentialRampToValueAtTime(0.001, now + decay);
		osc.connect(g).connect(out);
		osc.start(now);
		osc.stop(now + decay + 0.05);
	}

	// --- guns

	// at is where another player fired from; the player's own shots have none
	shot(weapon: WeaponId, at?: Place) {
		const t = SHOT_TONE[weapon];
		const v = at ? 0.7 : 1;
		if (weapon === 'raygun') {
			this.tone(1800, 0.22, 0.25 * v, 'sawtooth', 300, at);
			this.burst({ freq: 2400, q: 2, decay: 0.12, gain: 0.3 * v }, at);
			return;
		}
		this.burst({ freq: t.freq, q: 0.8, decay: t.decay, gain: 0.9 * v }, at);
		this.tone(120, t.decay * 1.2, t.boom * 0.6 * v, 'sine', 45, at);
	}

	empty() {
		this.tone(1800, 0.03, 0.15, 'square', 1600);
	}

	// one step of a reload: a magazine out or in, a shell pushed in, a pump,
	// a slide let go, a break-action opened or shut
	reloadPart(part: ReloadPart) {
		const parts: Record<ReloadPart, [number, number, number, OscillatorType]> = {
			out: [500, 0.05, 0.14, 'square'],
			in: [800, 0.04, 0.18, 'square'],
			shell: [1200, 0.03, 0.12, 'triangle'],
			pump: [350, 0.08, 0.2, 'square'],
			slide: [1000, 0.05, 0.16, 'square'],
			open: [420, 0.06, 0.16, 'square'],
			close: [650, 0.05, 0.2, 'square']
		};
		const [freq, decay, gain, type] = parts[part];
		this.tone(freq, decay, gain, type, freq * 0.85);
		this.burst({ freq: freq * 2.5, q: 1.2, decay: decay * 0.8, gain: gain * 0.8 });
	}

	// a gun brought up after a swap
	raise() {
		this.burst({ freq: 1600, q: 1, decay: 0.08, gain: 0.12 });
	}

	knife() {
		this.burst({ freq: 3000, q: 0.6, decay: 0.12, gain: 0.35, type: 'highpass' });
	}

	// --- hits and harm

	hit(kill: boolean) {
		this.tone(kill ? 900 : 1500, 0.05, 0.12, 'triangle');
	}

	// a head shot off
	headPop(at?: Place) {
		this.burst({ freq: 500, q: 0.7, decay: 0.18, gain: 0.55, type: 'lowpass' }, at);
		this.tone(160, 0.12, 0.35, 'sine', 70, at);
	}

	hurt() {
		this.tone(90, 0.3, 0.7, 'sine', 50);
	}

	// --- moving

	// one footfall; volume 0 to 1. Other players' come from where they are.
	footstep(surface: Surface, volume: number, at?: Place) {
		void surface;
		if (volume < 0.05) return;
		const pitch = 0.85 + Math.random() * 0.3;
		this.burst(
			{ freq: 260 * pitch, q: 0.9, decay: 0.07, gain: 0.32 * volume, type: 'lowpass' },
			at
		);
		this.burst({ freq: 2200 * pitch, q: 1.5, decay: 0.03, gain: 0.05 * volume }, at);
	}

	// a zombie's dragging step
	zombieStep(at: Place, volume: number) {
		if (volume < 0.05) return;
		this.burst(
			{ freq: 180 + Math.random() * 80, q: 0.6, decay: 0.12, gain: 0.3 * volume, type: 'lowpass' },
			at
		);
	}

	// a scuff along the floor
	slide() {
		this.burst({ freq: 900, q: 0.4, decay: 0.45, gain: 0.3, type: 'lowpass' });
	}

	// a thud on landing; strength 0 to 1 from how fast the player fell
	land(strength: number) {
		if (strength < 0.15) return;
		this.burst({ freq: 300, q: 0.6, decay: 0.12, gain: 0.5 * strength, type: 'lowpass' });
	}

	groan(at: Place) {
		const base = 70 + Math.random() * 50;
		this.tone(base, 0.7 + Math.random() * 0.5, 0.3, 'sawtooth', base * 0.7, at);
	}

	// --- the world

	buy() {
		this.tone(660, 0.12, 0.2, 'triangle');
		this.tone(990, 0.18, 0.2, 'triangle', 990, undefined, 0.09);
	}

	deny() {
		this.tone(220, 0.15, 0.25, 'square', 180);
	}

	door() {
		this.burst({ freq: 200, q: 0.5, decay: 0.6, gain: 0.8, type: 'lowpass' });
	}

	// a board torn off a window
	boardBreak(at: Place) {
		this.burst({ freq: 700, q: 0.8, decay: 0.25, gain: 0.7 }, at);
		this.tone(140, 0.2, 0.3, 'square', 90, at);
	}

	// a board nailed back on
	boardRepair() {
		this.tone(900, 0.04, 0.22, 'square', 700);
		this.tone(900, 0.04, 0.22, 'square', 700, undefined, 0.12);
		this.burst({ freq: 400, q: 0.8, decay: 0.12, gain: 0.25, type: 'lowpass', delay: 0.05 });
	}

	// the Mystery Box lid
	boxOpen(at: Place) {
		this.burst({ freq: 300, q: 0.7, decay: 0.4, gain: 0.5, type: 'lowpass' }, at);
	}

	// the tinkling tune while the box picks a gun, about four seconds
	boxJingle(at: Place) {
		const notes = [0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 16, 12, 7, 4, 7, 12];
		notes.forEach((n, i) =>
			this.tone(880 * Math.pow(2, n / 12), 0.22, 0.12, 'triangle', undefined, at, i * 0.24)
		);
	}

	boxClose(at: Place) {
		this.burst({ freq: 220, q: 0.7, decay: 0.3, gain: 0.5, type: 'lowpass' }, at);
	}

	// a perk machine's tune, played on buying
	perkJingle(perk: PerkId, at?: Place) {
		const base = { jugg: 220, speed: 330, tap: 262, revive: 392 }[perk];
		PERK_TUNES[perk].forEach((n, i) =>
			this.tone(base * Math.pow(2, n / 12), 0.2, 0.16, 'square', undefined, at, i * 0.16)
		);
	}

	// downing a perk
	drink() {
		for (let i = 0; i < 3; i++)
			this.burst({ freq: 500, q: 1.2, decay: 0.1, gain: 0.2, type: 'lowpass', delay: i * 0.18 });
		this.tone(300, 0.15, 0.2, 'triangle', 600, undefined, 0.6);
	}

	// a power-up dropping where a zombie fell
	powerupSpawn(at: Place) {
		this.tone(660, 0.5, 0.2, 'sine', 1320, at);
	}

	// a power-up picked up, by anyone
	powerupPickup(kind: PowerupKind) {
		if (kind === 'nuke') {
			this.burst({ freq: 120, q: 0.4, decay: 1.6, gain: 1, type: 'lowpass' });
			this.tone(60, 1.6, 0.8, 'sine', 30);
			return;
		}
		const up = kind === 'instakill' ? [0, 0, 12] : kind === 'double' ? [0, 7, 12] : [0, 4, 7, 12];
		up.forEach((n, i) =>
			this.tone(523 * Math.pow(2, n / 12), 0.25, 0.25, 'square', undefined, undefined, i * 0.12)
		);
	}

	// a power-up's time running out
	powerupEnd() {
		this.tone(523, 0.3, 0.2, 'square', 262);
	}

	round() {
		this.tone(110, 1.6, 0.5, 'sawtooth', 98);
		this.tone(55, 1.8, 0.5, 'sine', 50);
	}

	close() {
		void this.ctx?.close();
		this.ctx = null;
	}
}
