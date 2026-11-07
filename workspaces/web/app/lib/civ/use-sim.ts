import { useCallback, useEffect, useRef, useState } from 'react';
import type { Speed } from './config';
import type { ChronicleEvent, MapLayers, Person, SimRequest, SimResponse, WorldMap } from './types';

// The page's side of lib/civ/sim/sim.worker.ts: starts a world, sets the
// speed, follows a person, and hands each frame on. Frames go through a ref
// and a listener rather than React state, so sixty draws a second don't
// re-render the page; only the slower things (the chronicle, the followed
// person, the clock) are state.

export type Frame = Extract<SimResponse, { type: 'frame' }>;
export type Living = Pick<WorldMap, 'plants' | 'wood' | 'built'>;

// how many chronicle entries the page keeps
const CHRONICLE_KEEP = 400;

export function useSim(seed: number) {
	const worker = useRef<Worker | undefined>(undefined);
	const listeners = useRef(new Set<(frame: Frame) => void>());
	// everyone's name by id, for family links; the dead keep theirs
	const names = useRef(new Map<number, string>());
	const [layers, setLayers] = useState<MapLayers>();
	const [living, setLiving] = useState<Living>();
	const [tick, setTick] = useState(0);
	const [population, setPopulation] = useState(0);
	const [chronicle, setChronicle] = useState<ChronicleEvent[]>([]);
	const [followed, setFollowed] = useState<Person>();
	const [speed, setSpeedState] = useState<Speed>(1);

	const send = (request: SimRequest) => worker.current?.postMessage(request);

	useEffect(() => {
		const next = new Worker(new URL('./sim/sim.worker.ts', import.meta.url), { type: 'module' });
		worker.current = next;
		next.onmessage = (event: MessageEvent<SimResponse>) => {
			const message = event.data;
			if (message.type === 'map') {
				setLayers(message.layers);
				setLiving(message.living);
				return;
			}
			for (const person of message.people) names.current.set(person.id, person.name);
			for (const listener of listeners.current) listener(message);
			setTick(message.tick);
			setPopulation(message.people.length);
			setFollowed(message.followed);
			if (message.events.length)
				setChronicle((old) => [...old, ...message.events].slice(-CHRONICLE_KEEP));
		};
		next.postMessage({ type: 'start', seed } satisfies SimRequest);
		return () => next.terminate();
	}, [seed]);

	// a frame listener, for the map's draw loop
	const onFrame = useCallback((listener: (frame: Frame) => void) => {
		listeners.current.add(listener);
		return () => void listeners.current.delete(listener);
	}, []);

	const nameOf = useCallback((id: number) => names.current.get(id), []);

	const setSpeed = useCallback((next: Speed) => {
		setSpeedState(next);
		send({ type: 'speed', speed: next });
	}, []);

	const follow = useCallback((id: number | null) => {
		if (id === null) setFollowed(undefined);
		send({ type: 'follow', id });
	}, []);

	return {
		layers,
		living,
		tick,
		population,
		chronicle,
		followed,
		speed,
		setSpeed,
		follow,
		onFrame,
		nameOf
	};
}
