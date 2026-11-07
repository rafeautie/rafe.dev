// The simulation's home in the browser: a worker that owns the world, runs
// it on a timer at the chosen speed and posts what changed to the page
// (lib/civ/use-sim.ts). Nothing here decides anything about the world.

import { MS_PER_DAY, TICKS_PER_DAY, type Speed } from '../config';
import type { Rng } from '../rng';
import type { SimRequest, SimResponse, World } from '../types';
import { createViewState, frameMessage, mapMessage, type ViewState } from './view';
import { step } from './tick';
import { createWorld } from './world';

// at most this many frames a second, however fast time runs
const FRAMES_PER_SECOND = 15;
// never try to catch up more than this much real time in one go
const MAX_CATCH_UP_MS = 250;

const scope = self as unknown as {
	postMessage(message: SimResponse): void;
	onmessage: ((event: MessageEvent<SimRequest>) => void) | null;
};

let world: World | undefined;
let rng: Rng | undefined;
let view: ViewState | undefined;
let speed: Speed = 1;
let timer: ReturnType<typeof setInterval> | undefined;
let last = 0;
// ticks owed but not yet run, so slow speeds still tick steadily
let owed = 0;
const changes = new Set<number>();

function post() {
	if (world && view) scope.postMessage(frameMessage(world, view, changes));
}

function frame() {
	if (!world || !rng) return;
	const now = performance.now();
	const elapsed = Math.min(MAX_CATCH_UP_MS, now - last);
	last = now;
	if (speed === 0) return;
	owed += (elapsed * TICKS_PER_DAY * speed) / MS_PER_DAY;
	const ticks = Math.floor(owed);
	owed -= ticks;
	for (let i = 0; i < ticks; i++) step(world, rng, changes);
	post();
}

function start(seed: number) {
	if (timer) clearInterval(timer);
	const made = createWorld(seed);
	world = made.world;
	rng = made.rng;
	view = createViewState(world);
	changes.clear();
	owed = 0;
	scope.postMessage(mapMessage(world));
	post();
	last = performance.now();
	timer = setInterval(frame, 1000 / FRAMES_PER_SECOND);
}

scope.onmessage = (event) => {
	const request = event.data;
	switch (request.type) {
		case 'start':
			start(request.seed);
			break;
		case 'speed':
			speed = request.speed;
			last = performance.now();
			break;
		case 'follow':
			if (view) view.followed = request.id;
			// show it at once, even if time is paused
			post();
			break;
	}
};
