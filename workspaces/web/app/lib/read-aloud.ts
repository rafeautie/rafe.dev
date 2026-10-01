import { useEffect, useState, useSyncExternalStore } from 'react';
import type { WorkerRequest, WorkerResponse } from './read-aloud.worker';

// Reads a post aloud. read-aloud.worker.ts synthesizes the speech; this side
// plays it back through Web Audio, one sentence after the next with no gaps,
// and marks the passage being read with a data-reading attribute. While it
// reads, any passage can be clicked to read from there.

export type ReadAloudState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type ReadAloudSettings = {
	voice: Voice;
	speed: Speed;
	// Keeps the passage being read in view. On at the start of every reading,
	// and off once the reader scrolls on their own.
	follow: boolean;
};
export type ReadAloudStatus = ReadAloudSettings & {
	state: ReadAloudState;
	// how much of the model has downloaded, while loading
	progress: number;
	// the passage being read, of how many
	segment: number;
	total: number;
};

// A few of Kokoro's voices, the steadiest of them
export const VOICES = [
	{ id: 'af_heart', name: 'Heart', accent: 'US' },
	{ id: 'af_nicole', name: 'Nicole', accent: 'US' },
	{ id: 'af_bella', name: 'Bella', accent: 'US' },
	{ id: 'am_michael', name: 'Michael', accent: 'US' },
	{ id: 'bf_emma', name: 'Emma', accent: 'UK' },
	{ id: 'bm_george', name: 'George', accent: 'UK' }
] as const;
export type Voice = (typeof VOICES)[number]['id'];

export const SPEEDS = [0.8, 0.9, 1, 1.1, 1.2] as const;
export type Speed = (typeof SPEEDS)[number];

const DEFAULTS: ReadAloudSettings = { voice: 'af_heart', speed: 0.9, follow: true };
// the voice and speed are remembered between visits
const SETTINGS_KEY = 'read-aloud';

function savedSettings(): Pick<ReadAloudSettings, 'voice' | 'speed'> {
	try {
		const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
		return {
			voice: VOICES.find((voice) => voice.id === saved.voice)?.id ?? DEFAULTS.voice,
			speed: SPEEDS.find((speed) => speed === saved.speed) ?? DEFAULTS.speed
		};
	} catch {
		return DEFAULTS;
	}
}

function saveSettings({ voice, speed }: ReadAloudSettings) {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice, speed }));
	} catch {
		// kept for this page view only
	}
}

// The parts of a post that are read out, each one in turn
const BLOCKS = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, th, td';
// stays this many seconds of audio ahead of the listener
const LOOKAHEAD = 15;
// a breath between paragraphs
const PAUSE = 0.45;
// "back" further into a passage than this starts it over, as a player's
// previous-track button does
const RESTART_AFTER = 3;
// Following, a passage is scrolled to when it comes this close to the top of
// the window, or to the player floating at the bottom.
const FOLLOW_TOP = 64;
const FOLLOW_BOTTOM = 128;
// what counts as the reader scrolling on their own, which stops following
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

const IDLE: ReadAloudStatus = {
	...DEFAULTS,
	state: 'idle',
	progress: 0,
	segment: 0,
	total: 0
};

// One worker for the whole visit, so the model loads only once
let worker: Worker | undefined;
let nextId = 0;

function getWorker(): Worker {
	worker ??= new Worker(new URL('./read-aloud.worker.ts', import.meta.url), { type: 'module' });
	return worker;
}

function send(request: WorkerRequest) {
	getWorker().postMessage(request);
}

// A block's own words: not those of blocks inside it (they are read in their
// own turn), code, or heading anchors.
function textOf(element: HTMLElement): string {
	const clone = element.cloneNode(true) as HTMLElement;
	clone.querySelectorAll(`${BLOCKS}, pre, .anchor, sup`).forEach((node) => node.remove());
	return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// Everything to read under root, in document order
export function readableBlocks(root: HTMLElement): { elements: HTMLElement[]; texts: string[] } {
	const elements: HTMLElement[] = [];
	const texts: string[] = [];
	for (const element of root.querySelectorAll<HTMLElement>(BLOCKS)) {
		if (element.closest('pre, [data-footnotes], [data-read-aloud="skip"]')) continue;
		const text = textOf(element);
		if (!text) continue;
		elements.push(element);
		texts.push(text);
	}
	return { elements, texts };
}

function prefersReducedMotion() {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

class Reader {
	status = IDLE;
	private listeners = new Set<() => void>();
	private id = 0;
	private context?: AudioContext;
	private root?: HTMLElement;
	private elements: HTMLElement[] = [];
	private texts: string[] = [];
	// the segment this reading started from: the worker counts from there
	private offset = 0;
	private scheduled: { segment: number; start: number; end: number }[] = [];
	private endAt = 0;
	private pulling = false;
	private done = false;
	private timer?: ReturnType<typeof setInterval>;
	private highlighted?: HTMLElement;

	constructor() {
		if (typeof window !== 'undefined') this.status = { ...IDLE, ...savedSettings() };
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getSnapshot = () => this.status;

	private set(changes: Partial<ReadAloudStatus>) {
		this.status = { ...this.status, ...changes };
		this.listeners.forEach((listener) => listener());
	}

	private get active() {
		const { state } = this.status;
		return state === 'loading' || state === 'playing' || state === 'paused';
	}

	// From a click, so the browser lets the audio play
	start(root: HTMLElement) {
		this.stop();
		const { elements, texts } = readableBlocks(root);
		if (!texts.length) return;
		this.root = root;
		this.elements = elements;
		this.texts = texts;
		for (const element of elements) element.setAttribute('data-readable', '');
		root.addEventListener('click', this.onClick);
		window.addEventListener('keydown', this.onKey);
		window.addEventListener('wheel', this.onScroll, { passive: true });
		window.addEventListener('touchmove', this.onScroll, { passive: true });
		this.set({ follow: true });
		this.play(0);
	}

	pause() {
		if (this.status.state !== 'playing') return;
		void this.context?.suspend();
		this.set({ state: 'paused' });
	}

	resume() {
		if (this.status.state !== 'paused') return;
		void this.context?.resume();
		this.set({ state: 'playing' });
	}

	// Reads from the start of a passage. Past the last one, it is done.
	seek(segment: number) {
		if (!this.active) return;
		if (segment >= this.texts.length) {
			this.stop();
			return;
		}
		segment = Math.max(0, segment);
		this.highlight(this.elements[segment]);
		this.play(segment);
	}

	previous() {
		const { segment } = this.status;
		const now = this.context?.currentTime ?? 0;
		const started = this.scheduled.find((chunk) => chunk.segment === segment)?.start;
		this.seek(started !== undefined && now - started > RESTART_AFTER ? segment : segment - 1);
	}

	next() {
		this.seek(this.status.segment + 1);
	}

	// A new voice or speed picks up from the start of the current passage.
	configure(changes: Partial<ReadAloudSettings>) {
		const before = this.status;
		this.set(changes);
		saveSettings(this.status);
		const resynthesize = before.voice !== this.status.voice || before.speed !== this.status.speed;
		if (resynthesize && this.active) this.play(this.status.segment);
		if (!before.follow && this.status.follow) this.follow(true);
	}

	stop(state: 'idle' | 'error' = 'idle') {
		this.teardown();
		this.highlight(undefined);
		for (const element of this.elements) element.removeAttribute('data-readable');
		this.root?.removeEventListener('click', this.onClick);
		window.removeEventListener('keydown', this.onKey);
		window.removeEventListener('wheel', this.onScroll);
		window.removeEventListener('touchmove', this.onScroll);
		this.root = undefined;
		this.elements = [];
		this.texts = [];
		if (this.status.state !== state) this.set({ state, progress: 0, segment: 0, total: 0 });
	}

	private play(from: number) {
		this.teardown();
		this.id = ++nextId;
		this.offset = from;
		this.context = new AudioContext();
		getWorker().addEventListener('message', this.onMessage);
		send({
			type: 'start',
			id: this.id,
			segments: this.texts.slice(from),
			voice: this.status.voice,
			speed: this.status.speed
		});
		this.set({ state: 'loading', progress: 0, segment: from, total: this.texts.length });
		this.follow();
		this.pull();
		this.timer = setInterval(this.tick, 150);
	}

	// Silences the current reading. The passage stays marked.
	private teardown() {
		if (this.context) {
			send({ type: 'stop' });
			worker?.removeEventListener('message', this.onMessage);
			void this.context.close();
		}
		clearInterval(this.timer);
		this.context = undefined;
		this.scheduled = [];
		this.endAt = 0;
		this.pulling = false;
		this.done = false;
	}

	private pull() {
		this.pulling = true;
		send({ type: 'pull', id: this.id });
	}

	private onMessage = (event: MessageEvent<WorkerResponse>) => {
		const message = event.data;
		if (message.type === 'progress') {
			if (this.status.state === 'loading') this.set({ progress: message.progress });
			return;
		}
		if (message.id !== this.id || !this.context) return;

		if (message.type === 'error') {
			console.error('read aloud:', message.message);
			this.stop('error');
			return;
		}
		this.pulling = false;
		if (message.type === 'done') {
			this.done = true;
			return;
		}

		const context = this.context;
		const buffer = context.createBuffer(1, message.samples.length, message.rate);
		buffer.copyToChannel(message.samples as Float32Array<ArrayBuffer>, 0);
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.connect(context.destination);

		const segment = this.offset + message.segment;
		const last = this.scheduled.at(-1);
		const gap = last && last.segment !== segment ? PAUSE : 0;
		const start = Math.max(context.currentTime + 0.05, this.endAt + gap);
		source.start(start);
		this.endAt = start + buffer.duration;
		this.scheduled.push({ segment, start, end: this.endAt });

		if (this.status.state === 'loading') this.set({ state: 'playing', progress: 1 });
		this.tick();
	};

	private tick = () => {
		const context = this.context;
		if (!context) return;
		const now = context.currentTime;

		if (!this.pulling && !this.done && this.endAt - now < LOOKAHEAD) this.pull();

		if (this.done && !this.pulling && now >= this.endAt) {
			this.stop();
			return;
		}

		// until the first sentence plays, the last passage stays marked
		let current: number | undefined;
		for (const chunk of this.scheduled) {
			if (chunk.start > now) break;
			current = chunk.segment;
		}
		if (current === undefined) return;
		this.highlight(this.elements[current]);
		if (current !== this.status.segment) {
			this.set({ segment: current });
			this.follow();
		}
	};

	private highlight(element: HTMLElement | undefined) {
		if (element === this.highlighted) return;
		this.highlighted?.removeAttribute('data-reading');
		element?.setAttribute('data-reading', '');
		this.highlighted = element;
	}

	// Brings the passage being read into view, if following and it is not
	// comfortably in view already (or always, when asked to).
	private follow(always = false) {
		const element = this.elements[this.status.segment];
		if (!this.status.follow || !element) return;
		const { top, bottom } = element.getBoundingClientRect();
		if (!always && top >= FOLLOW_TOP && bottom <= window.innerHeight - FOLLOW_BOTTOM) return;
		element.scrollIntoView({
			block: 'center',
			behavior: prefersReducedMotion() ? 'instant' : 'smooth'
		});
	}

	// Clicking a passage reads from there, unless the click was on a link or
	// ended a text selection.
	private onClick = (event: MouseEvent) => {
		if (!(event.target instanceof Element)) return;
		const target = event.target;
		if (target.closest('a, button')) return;
		if (!window.getSelection()?.isCollapsed) return;
		const element = target.closest<HTMLElement>('[data-readable]');
		const segment = element ? this.elements.indexOf(element) : -1;
		if (segment >= 0) this.seek(segment);
	};

	// ← and → step back and forward a passage
	private onKey = (event: KeyboardEvent) => {
		const target = event.target instanceof Element ? event.target : null;
		if (target?.closest('input, textarea, select, [contenteditable], [role="menu"]')) return;
		// space on a button presses it rather than scrolling
		const presses = event.key === ' ' && target?.closest('a, button');
		if (SCROLL_KEYS.has(event.key) && !presses) this.onScroll();
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		event.preventDefault();
		if (event.key === 'ArrowLeft') this.previous();
		else this.next();
	};

	// Scrolling by hand means the reader wants to look elsewhere.
	private onScroll = () => {
		if (this.status.follow) this.set({ follow: false });
	};
}

const SERVER_STATUS = () => IDLE;

// A reader for one post. It stops when the component unmounts.
export function useReadAloud() {
	const [reader] = useState(() => new Reader());
	const status = useSyncExternalStore(reader.subscribe, reader.getSnapshot, SERVER_STATUS);
	useEffect(() => () => reader.stop(), [reader]);
	return {
		...status,
		start: (root: HTMLElement) => reader.start(root),
		pause: () => reader.pause(),
		resume: () => reader.resume(),
		stop: () => reader.stop(),
		previous: () => reader.previous(),
		next: () => reader.next(),
		configure: (changes: Partial<ReadAloudSettings>) => reader.configure(changes)
	};
}
