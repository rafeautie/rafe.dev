import type { WeaponId } from '../weapons';

// Every sound is made on the spot with Web Audio, from filtered noise and a
// few tones, so the game ships no audio files.

const SHOT_TONE: Record<WeaponId, { freq: number; decay: number; boom: number }> = {
	m1911: { freq: 1400, decay: 0.12, boom: 0.4 },
	olympia: { freq: 700, decay: 0.32, boom: 1 },
	m14: { freq: 1100, decay: 0.2, boom: 0.7 },
	mp5: { freq: 1800, decay: 0.08, boom: 0.3 },
	ak74u: { freq: 1300, decay: 0.1, boom: 0.5 },
	remington: { freq: 600, decay: 0.36, boom: 1 },
	galil: { freq: 1200, decay: 0.12, boom: 0.6 }
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

	private burst(opts: {
		freq: number;
		q: number;
		decay: number;
		gain: number;
		type?: BiquadFilterType;
	}) {
		const { ctx, master, noise } = this;
		if (!ctx || !master || !noise) return;
		const src = ctx.createBufferSource();
		src.buffer = noise;
		const filter = ctx.createBiquadFilter();
		filter.type = opts.type ?? 'bandpass';
		filter.frequency.value = opts.freq;
		filter.Q.value = opts.q;
		const gain = ctx.createGain();
		const now = ctx.currentTime;
		gain.gain.setValueAtTime(opts.gain, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + opts.decay);
		src.connect(filter).connect(gain).connect(master);
		src.start(now, Math.random() * 0.5, opts.decay + 0.05);
	}

	private tone(
		freq: number,
		decay: number,
		gain: number,
		type: OscillatorType = 'sine',
		end = freq
	) {
		const { ctx, master } = this;
		if (!ctx || !master) return;
		const osc = ctx.createOscillator();
		osc.type = type;
		const now = ctx.currentTime;
		osc.frequency.setValueAtTime(freq, now);
		osc.frequency.exponentialRampToValueAtTime(end, now + decay);
		const g = ctx.createGain();
		g.gain.setValueAtTime(gain, now);
		g.gain.exponentialRampToValueAtTime(0.001, now + decay);
		osc.connect(g).connect(master);
		osc.start(now);
		osc.stop(now + decay + 0.05);
	}

	// volume falls off with distance, for other players' shots
	shot(weapon: WeaponId, volume = 1) {
		const t = SHOT_TONE[weapon];
		this.burst({ freq: t.freq, q: 0.8, decay: t.decay, gain: 0.9 * volume });
		this.tone(120, t.decay * 1.2, t.boom * 0.6 * volume, 'sine', 45);
	}

	empty() {
		this.tone(1800, 0.03, 0.15, 'square', 1600);
	}

	knife() {
		this.burst({ freq: 3000, q: 0.6, decay: 0.12, gain: 0.35, type: 'highpass' });
	}

	hit(kill: boolean) {
		this.tone(kill ? 900 : 1500, 0.05, 0.12, 'triangle');
	}

	hurt() {
		this.tone(90, 0.3, 0.7, 'sine', 50);
	}

	buy() {
		this.tone(660, 0.12, 0.2, 'triangle');
		setTimeout(() => this.tone(990, 0.18, 0.2, 'triangle'), 90);
	}

	deny() {
		this.tone(220, 0.15, 0.25, 'square', 180);
	}

	door() {
		this.burst({ freq: 200, q: 0.5, decay: 0.6, gain: 0.8, type: 'lowpass' });
	}

	reload() {
		this.tone(600, 0.04, 0.12, 'square', 500);
	}

	round() {
		this.tone(110, 1.6, 0.5, 'sawtooth', 98);
		this.tone(55, 1.8, 0.5, 'sine', 50);
	}

	groan(volume: number) {
		if (volume < 0.03) return;
		const base = 70 + Math.random() * 50;
		this.tone(base, 0.7 + Math.random() * 0.5, 0.18 * volume, 'sawtooth', base * 0.7);
	}

	close() {
		void this.ctx?.close();
		this.ctx = null;
	}
}
