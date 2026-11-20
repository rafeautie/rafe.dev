import type { RecordedEvent, ReplayCar } from './recording';
import { HALF_ROAD, WORLD_W, lateral, nearest } from './track';

// The sound of the race, made up on the spot from what the replay shows:
// an engine and a set of tyres for every car, and a crunch for each knock.
// Each sound sits left or right where its car is.

/** The speeds (m/s) at which the cars change up. */
const GEARS = [0, 11, 19, 27, 36, 80];
/**
 * How fast (m/s) tyres must slide sideways on tarmac before they screech,
 * and the speed at which they are as loud as they get. Below this they are
 * working hard but quiet, as tyres near their limit are.
 */
const SCREECH_FROM = 6;
const SCREECH_FULL = 14;

export type Sound = ReturnType<typeof createSound>;

/** Must be called from a click or key press, or the browser keeps it silent. */
export function createSound(cars: number) {
	const context = new AudioContext();
	const master = context.createGain();
	const meter = context.createAnalyser();
	master.gain.value = 0;
	// the compressor keeps six engines and a crash from clipping
	master.connect(context.createDynamicsCompressor()).connect(meter).connect(context.destination);

	// two seconds of hiss, the raw material for crashes
	const hiss = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
	const grains = hiss.getChannelData(0);
	for (let i = 0; i < grains.length; i++) grains[i] = Math.random() * 2 - 1;

	const side = (x: number) => (x / WORLD_W) * 1.6 - 0.8;

	// What tyres are made of. On tarmac, sliding rubber hisses: pink noise,
	// kept to the middle of its range. Slide faster and it screeches, which
	// is the tread gripping and letting go about a thousand times a second:
	// a sawtooth. A real screech is never a clean note, so brown noise
	// wanders its pitch slowly, pink noise shakes it fast, and slow pink
	// noise makes its loudness chatter. Off the tarmac there is no screech,
	// only the rumble of loose ground: brown noise.
	const pink = looped(context, 'pink');
	const brown = looped(context, 'brown');
	const hissBand = context.createBiquadFilter();
	hissBand.type = 'bandpass';
	hissBand.frequency.value = 1600;
	hissBand.Q.value = 0.7;
	pink.connect(hissBand);
	const rumbleLow = context.createBiquadFilter();
	rumbleLow.frequency.value = 600;
	brown.connect(rumbleLow);
	const slow = context.createBiquadFilter();
	const wander = context.createGain();
	const shake = context.createGain();
	slow.frequency.value = 10;
	wander.gain.value = 700;
	shake.gain.value = 250;
	brown.connect(slow).connect(wander);
	pink.connect(shake);
	const unsteady = context.createBiquadFilter();
	const chatter = context.createGain();
	unsteady.frequency.value = 35;
	chatter.gain.value = 2;
	pink.connect(unsteady).connect(chatter);

	const voices = Array.from({ length: cars }, (_, index) => {
		const pan = context.createStereoPanner();
		pan.connect(master);
		const quiet = () => {
			const gain = context.createGain();
			gain.gain.value = 0;
			gain.connect(pan);
			return gain;
		};

		const source = context.createBufferSource();
		const filter = context.createBiquadFilter();
		const gain = quiet();
		source.buffer = exhaust(context, index);
		source.loop = true;
		source.connect(filter).connect(gain);
		source.start();

		const hiss = quiet();
		const rumble = quiet();
		const screech = quiet();
		hissBand.connect(hiss);
		rumbleLow.connect(rumble);
		// keeps the screech where screeches live, around 1 to 2 kHz, with
		// its loudness chattering on the way out
		const band = context.createBiquadFilter();
		const flutter = context.createGain();
		band.type = 'bandpass';
		band.frequency.value = 1500;
		band.Q.value = 0.6;
		flutter.gain.value = 0.7;
		chatter.connect(flutter.gain);
		band.connect(flutter).connect(screech);
		// one tone for each end of the car, close enough in pitch to grate
		// against each other, and every car's pair a little off the next's
		const tones = [1, 1.09].map((ratio) => {
			const tone = context.createOscillator();
			tone.type = 'sawtooth';
			wander.connect(tone.frequency);
			shake.connect(tone.frequency);
			tone.connect(band);
			tone.start();
			return { tone, ratio: ratio * (1 + (index - cars / 2) * 0.03) };
		});
		return { source, filter, gain, pan, hiss, rumble, screech, tones, speed: 0, load: 0 };
	});

	return {
		/** Follows the cars as they are now, `dt` race seconds on from last time; 0 while paused. */
		update(shown: ReplayCar[], dt: number) {
			const now = context.currentTime;
			master.gain.setTargetAtTime(dt > 0 ? 1 : 0, now, 0.05);
			if (dt <= 0) return;

			for (const [index, car] of shown.entries()) {
				const voice = voices[index];
				// working hard when gaining speed, off the throttle when losing it
				const working = Math.max(0.15, Math.min(1, 0.4 + (car.speed - voice.speed) / dt / 10));
				voice.load += (working - voice.load) * Math.min(1, dt * 8);
				voice.speed = car.speed;
				const speed = Math.min(79, Math.abs(car.speed));
				const gear = GEARS.findIndex((top) => speed <= top) || 1;
				const revs = 0.4 + (0.6 * (speed - GEARS[gear - 1])) / (GEARS[gear] - GEARS[gear - 1]);
				voice.source.playbackRate.setTargetAtTime(0.6 + 3 * revs, now, 0.04);
				voice.filter.frequency.setTargetAtTime(500 + 3500 * voice.load, now, 0.04);
				voice.gain.gain.setTargetAtTime(car.retired ? 0 : 0.06 + 0.16 * voice.load, now, 0.04);
				voice.pan.pan.setTargetAtTime(side(car.x), now, 0.04);

				// Tyres. The energy a sliding tyre turns into heat and noise
				// grows with how fast it slides, and loudness goes as the
				// square root of energy: so a screech comes in quickly past
				// the threshold, then grows slowly. Its pitch is the tread's
				// own and barely climbs with speed. Loose ground does not
				// screech; it rumbles under any moving car, more under a
				// sliding one.
				const offRoad = Math.abs(lateral(car.x, car.y, nearest(car.x, car.y))) > HALF_ROAD;
				const past = (from: number, full: number) =>
					car.retired ? 0 : Math.max(0, Math.min(1, (car.slip - from) / (full - from)));
				const hard = offRoad ? 0 : past(SCREECH_FROM, SCREECH_FULL);
				voice.screech.gain.setTargetAtTime(0.2 * Math.sqrt(hard), now, 0.03);
				for (const { tone, ratio } of voice.tones) {
					tone.frequency.setTargetAtTime((950 + 200 * hard) * ratio, now, 0.05);
				}
				const scrub = offRoad ? 0 : past(SCREECH_FROM - 2, SCREECH_FULL);
				voice.hiss.gain.setTargetAtTime(0.6 * Math.sqrt(scrub), now, 0.03);
				const loose = offRoad && !car.retired ? Math.min(1, speed / 40 + car.slip / 30) : 0;
				voice.rumble.gain.setTargetAtTime(0.35 * loose, now, 0.05);
			}
		},

		/** A knock: a burst of noise falling from bright to dull, with a thud under it. */
		event(event: RecordedEvent) {
			if (event.kind !== 'hit') return;
			const now = context.currentTime;
			const loud = Math.min(1, event.force / 12);
			const pan = context.createStereoPanner();
			pan.pan.value = side(event.x);
			pan.connect(master);

			const burst = context.createBufferSource();
			const dull = context.createBiquadFilter();
			const fade = context.createGain();
			burst.buffer = hiss;
			dull.frequency.setValueAtTime(4000, now);
			dull.frequency.exponentialRampToValueAtTime(150, now + 0.35);
			fade.gain.setValueAtTime(loud * 0.9, now);
			fade.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
			burst.connect(dull).connect(fade).connect(pan);
			burst.start(now, Math.random());
			burst.stop(now + 0.45);

			const thud = context.createOscillator();
			const thudFade = context.createGain();
			thud.frequency.setValueAtTime(110, now);
			thud.frequency.exponentialRampToValueAtTime(35, now + 0.2);
			thudFade.gain.setValueAtTime(loud, now);
			thudFade.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
			thud.connect(thudFade).connect(pan);
			thud.start(now);
			thud.stop(now + 0.3);
		},

		/** How loud the mix is right now, in decibels below full scale. */
		level() {
			const samples = new Float32Array(meter.fftSize);
			meter.getFloatTimeDomainData(samples);
			const power = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
			return 10 * Math.log10(power || 1e-10);
		},

		close: () => context.close()
	};
}

/**
 * Four seconds of noise, playing round and round. Pink noise is hiss with
 * the harshness taken out: as much energy in each octave, like rain. Brown
 * noise leans lower still, a rumble.
 */
function looped(context: AudioContext, colour: 'pink' | 'brown') {
	const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
	const samples = buffer.getChannelData(0);
	// pink is white noise through Paul Kellet's filter; brown is white noise
	// added up as it goes, with a slow leak so it cannot wander off
	const b = [0, 0, 0, 0, 0, 0, 0];
	let sum = 0;
	for (let i = 0; i < samples.length; i++) {
		const white = Math.random() * 2 - 1;
		if (colour === 'brown') {
			sum = (sum + 0.02 * white) / 1.02;
			samples[i] = sum * 3.5;
			continue;
		}
		b[0] = 0.99886 * b[0] + white * 0.0555179;
		b[1] = 0.99332 * b[1] + white * 0.0750759;
		b[2] = 0.969 * b[2] + white * 0.153852;
		b[3] = 0.8665 * b[3] + white * 0.3104856;
		b[4] = 0.55 * b[4] + white * 0.5329522;
		b[5] = -0.7616 * b[5] - white * 0.016898;
		samples[i] = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + white * 0.5362) * 0.11;
		b[6] = white * 0.115926;
	}
	// tilt the whole thing so it ends where it began, or the loop would click
	const gap = samples[samples.length - 1] - samples[0];
	for (let i = 0; i < samples.length; i++) samples[i] -= (gap * i) / samples.length;
	const source = context.createBufferSource();
	source.buffer = buffer;
	source.loop = true;
	source.start();
	return source;
}

/**
 * Eight firings of an engine: each a thud ringing in the exhaust pipe, with
 * some hiss in it. Looped, and played faster or slower, it is that engine at
 * any revs. Every car has a pipe of its own length and its own uneven beat,
 * so the six can be told apart.
 */
function exhaust(context: AudioContext, index: number) {
	const firing = 50;
	const each = Math.round(context.sampleRate / firing);
	const buffer = context.createBuffer(1, each * 8, context.sampleRate);
	const samples = buffer.getChannelData(0);
	const pipe = 150 + index * 23;
	for (let pulse = 0; pulse < 8; pulse++) {
		const strength = 0.7 + (0.3 * ((pulse * (index + 3)) % 4)) / 3;
		for (let i = 0; i < each; i++) {
			const t = i / context.sampleRate;
			samples[pulse * each + i] =
				strength *
				Math.exp(-t * 220) *
				(Math.sin(2 * Math.PI * pipe * t) + (Math.random() * 2 - 1) * 0.5);
		}
	}
	return buffer;
}
