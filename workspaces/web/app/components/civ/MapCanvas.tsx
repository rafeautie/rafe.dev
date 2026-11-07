import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Camera } from '../../lib/civ/render/camera';
import { personPosition } from '../../lib/civ/render/actors';
import { drawFrame, nearestPerson } from '../../lib/civ/render/draw';
import { interpolateHerds, interpolatePeople } from '../../lib/civ/render/interpolate';
import { fillTerrain, patchTerrain } from '../../lib/civ/render/terrain';
import type { MapLayers, SimResponse, WorldMap } from '../../lib/civ/types';

// The world map on a canvas. The parent gives it the map once (`layers` and
// `living`) and then pushes every simulation `frame` message through the
// handle's `pushFrame`. Going through a handle and not props means no frame
// (and none of its tile changes) can be dropped by React batching, and the
// per-frame path never touches React state.
//
// The canvas fills its parent, so the parent needs a definite size, for
// example `relative h-full w-full overflow-hidden`.

export type MapFrame = Pick<
	Extract<SimResponse, { type: 'frame' }>,
	'people' | 'herds' | 'villages' | 'tiles' | 'tick' | 'weather'
>;

export type MapCanvasHandle = {
	pushFrame(frame: MapFrame): void;
	// show the whole map again
	fit(): void;
};

type Living = Pick<WorldMap, 'plants' | 'wood' | 'built'>;

type Props = {
	layers: MapLayers | undefined;
	living: Living | undefined;
	season: number;
	followedId: number | null;
	onSelect: (id: number | null) => void;
	// called when the viewer drags or pinches the map by hand
	onUserPan?: () => void;
	theme: 'light' | 'dark';
	ref?: Ref<MapCanvasHandle>;
};

const CLICK_SLOP = 4;
const PICK_RADIUS = 10;

export function MapCanvas(props: Props) {
	const { ref } = props;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const propsRef = useRef(props);
	useEffect(() => {
		propsRef.current = props;
	});

	// everything the animation loop reads, kept out of React state
	const live = useRef({
		camera: new Camera(),
		dpr: 1,
		fitted: false,
		layers: undefined as MapLayers | undefined,
		livingSource: undefined as Living | undefined,
		living: undefined as Living | undefined,
		image: undefined as ImageData | undefined,
		terrain: undefined as HTMLCanvasElement | undefined,
		prev: undefined as MapFrame | undefined,
		next: undefined as MapFrame | undefined,
		arrivedAt: 0,
		interval: 100,
		people: [] as ReturnType<typeof interpolatePeople>,
		hoveredId: null as number | null,
		dragging: false
	});

	useImperativeHandle(ref, () => ({
		pushFrame(frame) {
			const s = live.current;
			const now = performance.now();
			if (s.next)
				s.interval = Math.min(1000, Math.max(40, 0.7 * s.interval + 0.3 * (now - s.arrivedAt)));
			s.prev = s.next ?? frame;
			s.next = frame;
			s.arrivedAt = now;
			if (frame.tiles.length && s.image && s.layers && s.living && s.terrain) {
				patchTerrain(s.image, s.layers, s.living, frame.tiles, propsRef.current.season);
				s.terrain.getContext('2d')?.putImageData(s.image, 0, 0);
			}
		},
		fit() {
			const s = live.current;
			s.camera.fit(s.layers?.size ?? s.camera.mapSize);
		}
	}));

	// repaint the ground when the map or the season changes
	const { layers, living, season } = props;
	useEffect(() => {
		const s = live.current;
		if (!layers || !living) return;
		if (s.livingSource !== living) {
			// our own copy, so tile changes never write into the parent's arrays
			s.livingSource = living;
			s.living = {
				plants: new Float32Array(living.plants),
				wood: new Float32Array(living.wood),
				built: new Uint8Array(living.built)
			};
		}
		const size = layers.size;
		if (!s.terrain || s.terrain.width !== size) {
			s.terrain = document.createElement('canvas');
			s.terrain.width = size;
			s.terrain.height = size;
		}
		if (!s.image || s.image.width !== size) s.image = new ImageData(size, size);
		s.layers = layers;
		fillTerrain(s.image.data, layers, s.living!, season);
		s.terrain.getContext('2d')?.putImageData(s.image, 0, 0);
		s.camera.mapSize = size;
	}, [layers, living, season]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const s = live.current;
		const camera = s.camera;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const resize = () => {
			const rect = canvas.getBoundingClientRect();
			s.dpr = window.devicePixelRatio || 1;
			canvas.width = Math.max(1, Math.round(rect.width * s.dpr));
			canvas.height = Math.max(1, Math.round(rect.height * s.dpr));
			camera.setViewport(rect.width, rect.height);
			if (!s.fitted && s.layers && rect.width > 0) {
				camera.fit(s.layers.size);
				s.fitted = true;
			}
		};
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();

		let raf = 0;
		let last = performance.now();
		const loop = (now: number) => {
			raf = requestAnimationFrame(loop);
			const dt = Math.min(100, now - last);
			last = now;
			const p = propsRef.current;
			if (!s.fitted && s.layers && camera.width > 0) {
				camera.fit(s.layers.size);
				s.fitted = true;
			}
			if (!s.terrain || !s.layers || !s.living) return;

			const next = s.next;
			const prev = s.prev ?? next;
			const t = s.interval > 0 ? (now - s.arrivedAt) / s.interval : 1;
			s.people = next && prev ? interpolatePeople(prev.people, next.people, t) : [];
			const herds = next && prev ? interpolateHerds(prev.herds, next.herds, t) : [];

			if (p.followedId !== null && !s.dragging) {
				const who = s.people.find((person) => person.id === p.followedId);
				if (who) {
					const at = personPosition(who, now);
					camera.follow(at.x, at.y, dt);
				}
			}

			drawFrame(ctx, {
				camera,
				terrain: s.terrain,
				dpr: s.dpr,
				layers: s.layers,
				living: s.living,
				people: s.people,
				herds,
				villages: next?.villages ?? [],
				tick: next?.tick ?? 0,
				now,
				season: p.season,
				weather: next?.weather ?? 'clear',
				followedId: p.followedId,
				hoveredId: s.hoveredId,
				theme: p.theme
			});
		};
		raf = requestAnimationFrame(loop);

		// pointers: one drags, two pinch, a still tap selects
		const pointers = new Map<number, { x: number; y: number }>();
		let start = { x: 0, y: 0 };
		let moved = false;
		const local = (e: PointerEvent | WheelEvent) => {
			const rect = canvas.getBoundingClientRect();
			return { x: e.clientX - rect.left, y: e.clientY - rect.top };
		};
		const cursor = () => {
			canvas.style.cursor = s.hoveredId !== null ? 'pointer' : s.dragging ? 'grabbing' : 'grab';
		};

		const onDown = (e: PointerEvent) => {
			canvas.setPointerCapture(e.pointerId);
			const at = local(e);
			pointers.set(e.pointerId, at);
			if (pointers.size === 1) {
				start = at;
				moved = false;
			} else {
				moved = true;
			}
		};
		const onMove = (e: PointerEvent) => {
			const at = local(e);
			const before = pointers.get(e.pointerId);
			if (!before) {
				if (e.pointerType === 'mouse') {
					s.hoveredId = nearestPerson(s.people, camera, performance.now(), at.x, at.y, PICK_RADIUS);
					cursor();
				}
				return;
			}
			if (pointers.size >= 2) {
				const [a, b] = [...pointers.values()];
				const oldDist = Math.hypot(a.x - b.x, a.y - b.y);
				const oldMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				pointers.set(e.pointerId, at);
				const [c, d] = [...pointers.values()];
				const dist = Math.hypot(c.x - d.x, c.y - d.y);
				const mid = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
				camera.panBy(mid.x - oldMid.x, mid.y - oldMid.y);
				if (oldDist > 0 && dist > 0) camera.zoomAt(dist / oldDist, mid.x, mid.y);
				s.dragging = true;
				propsRef.current.onUserPan?.();
				return;
			}
			pointers.set(e.pointerId, at);
			if (!moved && Math.hypot(at.x - start.x, at.y - start.y) > CLICK_SLOP) moved = true;
			if (moved) {
				camera.panBy(at.x - before.x, at.y - before.y);
				s.dragging = true;
				cursor();
				propsRef.current.onUserPan?.();
			}
		};
		const onUp = (e: PointerEvent) => {
			const known = pointers.delete(e.pointerId);
			if (known && pointers.size === 0) {
				if (!moved && e.type === 'pointerup') {
					const at = local(e);
					propsRef.current.onSelect(
						nearestPerson(s.people, camera, performance.now(), at.x, at.y, PICK_RADIUS)
					);
				}
				s.dragging = false;
				cursor();
			}
		};
		const onLeave = () => {
			s.hoveredId = null;
			cursor();
		};
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const at = local(e);
			const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
			// trackpad pinch arrives as ctrl+wheel with small deltas
			camera.zoomAt(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), at.x, at.y);
		};

		canvas.addEventListener('pointerdown', onDown);
		canvas.addEventListener('pointermove', onMove);
		canvas.addEventListener('pointerup', onUp);
		canvas.addEventListener('pointercancel', onUp);
		canvas.addEventListener('pointerleave', onLeave);
		canvas.addEventListener('wheel', onWheel, { passive: false });
		cursor();

		return () => {
			cancelAnimationFrame(raf);
			observer.disconnect();
			canvas.removeEventListener('pointerdown', onDown);
			canvas.removeEventListener('pointermove', onMove);
			canvas.removeEventListener('pointerup', onUp);
			canvas.removeEventListener('pointercancel', onUp);
			canvas.removeEventListener('pointerleave', onLeave);
			canvas.removeEventListener('wheel', onWheel);
		};
	}, []);

	return <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" />;
}
