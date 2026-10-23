import {
	type ExtendedFeature,
	geoArea,
	geoBounds,
	geoCentroid,
	geoContains,
	geoDistance,
	geoInterpolate,
	geoOrthographic,
	geoPath
} from 'd3-geo';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import { Button } from '~/components/ui/button';
import type { FilterKey } from '~/lib/stats/dimensions';
import type { CityRow, RegionRow, Row } from '~/lib/stats/report';
import { country as countryName } from './format';
import WORLD from './globe/world.json';

// Where visitors are, on a globe that turns slowly until touched. Drag to
// turn it; scroll, pinch or the buttons to zoom. Zoomed out it shades
// countries by visitors, closer in their states or provinces, and closest
// in it shows cities as dots. Choosing any of them filters the page, and a
// filter turns the globe to it. Outlines come from scripts/world-map.mjs.

type Topology = Parameters<typeof feature>[0];
type Shape = ExtendedFeature & { id?: string };
type RegionProps = { name: string; codes: string[]; names: string[]; groups: string[] };
type RegionShape = ExtendedFeature & { properties: RegionProps };

// Rounding the outlines to fit a small file can turn a tiny piece inside
// out, which d3 reads as the whole globe but that piece; those are turned
// back.
function wound<T extends ExtendedFeature>(shape: T): T {
	const geometry = shape.geometry;
	if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') return shape;
	const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
	const fixed = polygons.map((rings) =>
		geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI
			? rings.map((ring) => [...ring].reverse())
			: rings
	);
	return {
		...shape,
		geometry:
			geometry.type === 'Polygon'
				? { type: 'Polygon', coordinates: fixed[0] }
				: { type: 'MultiPolygon', coordinates: fixed }
	};
}

const COUNTRIES = (
	feature(WORLD as unknown as Topology, WORLD.objects.countries as never) as unknown as {
		features: Shape[];
	}
).features
	.map(wound)
	.map((shape) => ({ shape, code: String(shape.id), bounds: geoBounds(shape) }));

// states and provinces, a file per country, loaded when first needed
const REGION_FILES = import.meta.glob<Topology>('./globe/regions/*.json', { import: 'default' });
const regionCache = new Map<string, RegionShape[] | null>();
const loading = new Set<string>();
function loadRegions(code: string, done: () => void) {
	if (regionCache.has(code) || loading.has(code)) return;
	const load = REGION_FILES[`./globe/regions/${code}.json`];
	if (!load) {
		regionCache.set(code, null);
		return;
	}
	loading.add(code);
	load()
		.then((topology) => {
			const { features } = feature(topology, topology.objects.regions as never) as unknown as {
				features: RegionShape[];
			};
			regionCache.set(code, features.map(wound));
		})
		.catch(() => regionCache.set(code, null))
		.finally(() => {
			loading.delete(code);
			done();
		});
}

// how close in each level starts: 1 is the whole globe
const STATES_FROM = 2;
const CITIES_FROM = 5;
const MAX_ZOOM = 60;
const LEVELS = ['Countries', 'States and provinces', 'Cities'];
const levelOf = (k: number) => (k >= CITIES_FROM ? 2 : k >= STATES_FROM ? 1 : 0);
// degrees a second
const SPIN = 4;

type View = { rotate: [number, number]; k: number };
type Hit = { key: FilterKey; value: string; label: string; visitors: number; shape?: object };

// Each region of visitors on its outlines: by Cloudflare's code, or by name
// for visits from before codes were kept, or else as the larger region a
// group of outlines makes up, as England is the UK's English counties.
function matchRegions(shapes: RegionShape[], rows: RegionRow[]) {
	const byOutline = new Map<number, RegionRow[]>();
	const outlines = (match: (region: RegionProps) => boolean) =>
		shapes.flatMap((shape, index) => (match(shape.properties) ? [index] : []));
	for (const row of rows) {
		const code = row.code?.toUpperCase();
		const name = row.label.toLowerCase();
		let found = code ? outlines((region) => region.codes.includes(code)) : [];
		if (!found.length) found = outlines((region) => region.names.includes(name));
		if (!found.length) {
			found = outlines(
				(region) => (!!code && region.groups.includes(code)) || region.groups.includes(name)
			);
		}
		for (const index of found) byOutline.set(index, [...(byOutline.get(index) ?? []), row]);
	}
	return byOutline;
}

// The middle of a country's biggest piece, and how far it reaches, so France
// is not centred on the sea between it and its islands in South America.
function frameOf(shape: Shape) {
	const geometry = shape.geometry;
	const polygons =
		geometry?.type === 'Polygon'
			? [geometry.coordinates]
			: geometry?.type === 'MultiPolygon'
				? geometry.coordinates
				: [];
	const biggest = polygons
		.map((coordinates) => ({ type: 'Polygon' as const, coordinates }))
		.sort((a, b) => geoArea(b) - geoArea(a))[0];
	if (!biggest) return null;
	const center = geoCentroid(biggest);
	const reach = Math.max(
		...biggest.coordinates[0].map((point) => geoDistance(center, point as [number, number]))
	);
	return { center, reach };
}

// zoom that shows an angle (radians) around the middle
const zoomFor = (reach: number) => 1 / Math.sin(Math.min(reach * 1.3, Math.PI / 2));

function inBounds(
	[[west, south], [east, north]]: [[number, number], [number, number]],
	[lng, lat]: [number, number]
) {
	if (lat < south - 0.5 || lat > north + 0.5) return false;
	// a shape across the 180th meridian has its west east of its east
	return west <= east
		? lng >= west - 0.5 && lng <= east + 0.5
		: lng >= west - 0.5 || lng <= east + 0.5;
}

export function Globe({
	countries,
	regions,
	cities,
	active,
	onPick
}: {
	countries: Row[];
	regions: RegionRow[];
	cities: CityRow[];
	active: { country?: string; region?: string; city?: string };
	onPick: (key: FilterKey, value: string) => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const view = useRef<View>({ rotate: [-10, -25], k: 1 });
	const [level, setLevel] = useState(0);
	const [hit, setHit] = useState<(Hit & { x: number; y: number }) | null>(null);
	// bumped when a country's regions arrive, to shade them
	const [loaded, setLoaded] = useState(0);

	const data = useMemo(() => {
		const byCountry = new Map<string, RegionRow[]>();
		for (const row of regions)
			byCountry.set(row.country, [...(byCountry.get(row.country) ?? []), row]);
		const shading = new Map<string, { shapes: RegionShape[]; rows: Map<number, RegionRow[]> }>();
		for (const [code, rows] of byCountry) {
			const shapes = regionCache.get(code);
			if (shapes) shading.set(code, { shapes, rows: matchRegions(shapes, rows) });
		}
		return {
			counts: new Map(countries.map((row) => [row.key, row])),
			countryMax: Math.max(1, ...countries.map((row) => row.visitors)),
			regionCountries: [...byCountry.keys()],
			shading,
			regionMax: Math.max(1, ...regions.map((row) => row.visitors)),
			cities,
			cityMax: Math.max(1, ...cities.map((row) => row.visitors))
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- `loaded` marks new region files
	}, [countries, regions, cities, loaded]);
	const dataRef = useRef(data);
	const activeRef = useRef(active);
	const onPickRef = useRef(onPick);
	// zoom by a factor, from the buttons
	const zoomRef = useRef<(factor: number) => void>(() => undefined);
	const hitRef = useRef<Hit | null>(null);
	const dirty = useRef(true);
	const animation = useRef<{ from: View; to: View; start: number; ms: number } | null>(null);

	useEffect(() => {
		dataRef.current = data;
		activeRef.current = active;
		onPickRef.current = onPick;
		dirty.current = true;
	});

	// turn to what the page is filtered by
	useEffect(() => {
		let target: { center: [number, number]; k: number } | null = null;
		if (active.city) {
			const city = cities.find((row) => row.key === active.city);
			if (city) target = { center: [city.lng, city.lat], k: 9 };
		}
		const code = active.country ?? (active.city ?? active.region)?.split(', ').pop() ?? undefined;
		if (!target && code) {
			const shape = COUNTRIES.find((entry) => entry.code === code)?.shape;
			const frame = shape && frameOf(shape);
			if (frame) {
				target = {
					center: frame.center,
					// a country by its states; a region close enough to see its cities
					k: active.region
						? CITIES_FROM + 1
						: Math.min(CITIES_FROM - 0.5, Math.max(STATES_FROM + 0.5, zoomFor(frame.reach)))
				};
			}
		}
		if (!target) return;
		const from = { rotate: [...view.current.rotate] as [number, number], k: view.current.k };
		animation.current = {
			from,
			to: { rotate: [-target.center[0], -target.center[1]], k: target.k },
			start: performance.now(),
			ms: 900
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only when the filters change
	}, [active.country, active.region, active.city]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const context = canvas.getContext('2d');
		if (!context) return;
		const still = window.matchMedia('(prefers-reduced-motion: reduce)');
		let width = 0;
		let height = 0;
		let frame = 0;
		let last = performance.now();
		let visible = true;
		let inside = false;
		let dragging: { x: number; y: number; rotate: [number, number]; moved: boolean } | null = null;
		const pointers = new Map<number, { x: number; y: number }>();
		let pinch: { distance: number; k: number } | null = null;

		const radius = () => Math.min(width, height) / 2 - 2;
		const projection = () =>
			geoOrthographic()
				.rotate(view.current.rotate)
				.scale(radius() * view.current.k)
				.translate([width / 2, height / 2])
				.clipAngle(90)
				.precision(0.3);

		const resize = () => {
			const box = canvas.getBoundingClientRect();
			const ratio = window.devicePixelRatio || 1;
			width = box.width;
			height = box.height;
			canvas.width = Math.round(width * ratio);
			canvas.height = Math.round(height * ratio);
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			dirty.current = true;
		};

		const draw = () => {
			const { counts, countryMax, shading, regionMax, cityMax } = dataRef.current;
			const style = getComputedStyle(canvas);
			const ink = style.getPropertyValue('--foreground').trim() || '#000';
			const paper = style.getPropertyValue('--background').trim() || '#fff';
			const tier = levelOf(view.current.k);
			const p = projection();
			const path = geoPath(p, context);
			const hover = hitRef.current;
			const chosen = activeRef.current;

			context.clearRect(0, 0, width, height);
			const shape = (geometry: object, alpha: number) => {
				context.beginPath();
				path(geometry as Shape);
				context.globalAlpha = alpha;
				context.fillStyle = ink;
				context.fill();
				context.globalAlpha = 1;
				context.strokeStyle = paper;
				context.lineWidth = 0.6;
				context.stroke();
			};
			const outline = (geometry: object, lineWidth: number) => {
				context.beginPath();
				path(geometry as Shape);
				context.strokeStyle = ink;
				context.lineWidth = lineWidth;
				context.stroke();
			};
			const shade = (count: number, max: number) => (count ? 0.15 + (count / max) * 0.75 : 0.07);

			// the sea
			context.beginPath();
			path({ type: 'Sphere' });
			context.globalAlpha = 0.03;
			context.fillStyle = ink;
			context.fill();
			context.globalAlpha = 0.12;
			context.strokeStyle = ink;
			context.lineWidth = 1;
			context.stroke();
			context.globalAlpha = 1;

			for (const { shape: country, code } of COUNTRIES) {
				const split = tier > 0 && shading.has(code);
				shape(country, split ? 0.07 : shade(counts.get(code)?.visitors ?? 0, countryMax));
			}
			if (tier > 0) {
				for (const { shapes, rows } of shading.values()) {
					shapes.forEach((region, index) => {
						const count = (rows.get(index) ?? []).reduce((sum, row) => sum + row.visitors, 0);
						// fainter behind the cities
						shape(
							region,
							tier === 2 && count ? 0.08 + (count / regionMax) * 0.35 : shade(count, regionMax)
						);
					});
				}
			}
			for (const { shape: country, code } of COUNTRIES) {
				// a country split into regions has their finer coast instead
				if (chosen.country === code && !(tier > 0 && shading.has(code))) outline(country, 1.5);
			}
			if (tier > 0) {
				for (const { shapes, rows } of shading.values()) {
					shapes.forEach((region, index) => {
						if ((rows.get(index) ?? []).some((row) => row.key === chosen.region))
							outline(region, 1.5);
					});
				}
			}
			if (hover?.shape) outline(hover.shape, 1);

			if (tier === 2) {
				const center = p.invert?.([width / 2, height / 2]);
				for (const city of dataRef.current.cities) {
					if (center && geoDistance(center, [city.lng, city.lat]) > Math.PI / 2 - 0.01) continue;
					const point = p([city.lng, city.lat]);
					if (!point) continue;
					const r = 3 + 6 * Math.sqrt(city.visitors / cityMax);
					context.beginPath();
					context.arc(point[0], point[1], r, 0, 2 * Math.PI);
					context.fillStyle = ink;
					context.fill();
					context.strokeStyle = paper;
					context.lineWidth = city.key === chosen.city || hover?.value === city.key ? 2.5 : 1;
					context.stroke();
				}
			}
		};

		// what is under a point on the canvas
		const hitAt = (x: number, y: number): Hit | null => {
			const p = projection();
			const { counts, shading, cities, cityMax } = dataRef.current;
			const tier = levelOf(view.current.k);
			if (Math.hypot(x - width / 2, y - height / 2) > radius() * view.current.k) return null;
			const where = p.invert?.([x, y]);
			if (!where) return null;
			if (tier === 2) {
				let best: { city: CityRow; distance: number } | null = null;
				for (const city of cities) {
					if (geoDistance(where, [city.lng, city.lat]) > Math.PI / 4) continue;
					const point = p([city.lng, city.lat]);
					if (!point) continue;
					const distance = Math.hypot(point[0] - x, point[1] - y);
					const r = 3 + 6 * Math.sqrt(city.visitors / cityMax) + 3;
					if (distance <= r && (!best || distance < best.distance)) best = { city, distance };
				}
				if (best) {
					return {
						key: 'city',
						value: best.city.key,
						label: best.city.label,
						visitors: best.city.visitors
					};
				}
			}
			const country = COUNTRIES.find(
				(entry) => inBounds(entry.bounds as never, where) && geoContains(entry.shape, where)
			);
			if (!country) return null;
			const regions = tier > 0 ? shading.get(country.code) : undefined;
			if (regions) {
				const index = regions.shapes.findIndex((region) => geoContains(region, where));
				if (index >= 0) {
					const rows = regions.rows.get(index) ?? [];
					return {
						key: 'region',
						value: rows[0]?.key ?? '',
						label: rows[0]?.label ?? regions.shapes[index].properties.name,
						visitors: rows.reduce((sum, row) => sum + row.visitors, 0),
						shape: regions.shapes[index]
					};
				}
			}
			const row = counts.get(country.code);
			return {
				key: 'country',
				value: country.code,
				label: countryName(country.code),
				visitors: row?.visitors ?? 0,
				shape: country.shape
			};
		};

		const loop = (now: number) => {
			const dt = Math.min(now - last, 100);
			last = now;
			const run = animation.current;
			if (run) {
				const t = Math.min(1, (now - run.start) / run.ms);
				const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
				const turn = geoInterpolate(
					[-run.from.rotate[0], -run.from.rotate[1]],
					[-run.to.rotate[0], -run.to.rotate[1]]
				)(ease);
				view.current = {
					rotate: [-turn[0], -turn[1]],
					k: run.from.k * (run.to.k / run.from.k) ** ease
				};
				if (t === 1) animation.current = null;
				dirty.current = true;
			} else if (!dragging && !inside && !still.matches && view.current.k < STATES_FROM) {
				view.current.rotate[0] += (SPIN * dt) / 1000;
				dirty.current = true;
			}
			if (dirty.current && width) {
				dirty.current = false;
				draw();
				setLevel(levelOf(view.current.k));
				// regions of the countries in view, once close enough to see them
				if (view.current.k >= STATES_FROM * 0.8) {
					const p = projection();
					const center = p.invert?.([width / 2, height / 2]);
					for (const code of dataRef.current.regionCountries) {
						const entry = COUNTRIES.find((c) => c.code === code);
						if (center && entry && geoDistance(center, geoCentroid(entry.shape)) < 1.4) {
							loadRegions(code, () => setLoaded((n) => n + 1));
						}
					}
				}
			}
			frame = visible ? requestAnimationFrame(loop) : 0;
		};

		const zoomTo = (k: number) => {
			view.current.k = Math.min(MAX_ZOOM, Math.max(1, k));
			animation.current = null;
			dirty.current = true;
		};
		const local = (event: PointerEvent | WheelEvent) => {
			const box = canvas.getBoundingClientRect();
			return { x: event.clientX - box.left, y: event.clientY - box.top };
		};
		const onDown = (event: PointerEvent) => {
			const point = local(event);
			pointers.set(event.pointerId, point);
			canvas.setPointerCapture(event.pointerId);
			animation.current = null;
			if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), k: view.current.k };
				dragging = null;
			} else {
				dragging = { ...point, rotate: [...view.current.rotate], moved: false };
			}
		};
		const onMove = (event: PointerEvent) => {
			const point = local(event);
			inside = true;
			if (pointers.has(event.pointerId)) pointers.set(event.pointerId, point);
			if (pinch && pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				zoomTo(pinch.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
				return;
			}
			if (dragging) {
				const dx = point.x - dragging.x;
				const dy = point.y - dragging.y;
				if (Math.hypot(dx, dy) > 3) dragging.moved = true;
				if (dragging.moved) {
					// a drag moves the ground under the pointer, about
					const scale = 180 / Math.PI / (radius() * view.current.k);
					view.current.rotate = [
						dragging.rotate[0] + dx * scale,
						Math.max(-85, Math.min(85, dragging.rotate[1] - dy * scale))
					];
					dirty.current = true;
					hitRef.current = null;
					setHit(null);
					return;
				}
			}
			const found = hitAt(point.x, point.y);
			if (found?.value !== hitRef.current?.value || found?.key !== hitRef.current?.key) {
				hitRef.current = found;
				dirty.current = true;
			}
			canvas.style.cursor = found?.visitors ? 'pointer' : '';
			setHit(found ? { ...found, ...point } : null);
		};
		const onUp = (event: PointerEvent) => {
			pointers.delete(event.pointerId);
			if (pointers.size < 2) pinch = null;
			const drag = dragging;
			dragging = null;
			if (drag && !drag.moved && event.type === 'pointerup') {
				const point = local(event);
				const found = hitAt(point.x, point.y);
				if (found?.value && found.visitors) onPickRef.current(found.key, found.value);
			}
		};
		const onLeave = () => {
			inside = false;
			hitRef.current = null;
			dirty.current = true;
			setHit(null);
		};
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			zoomTo(view.current.k * Math.exp(-event.deltaY * 0.0015));
		};

		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		const seen = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (visible && !frame) {
				last = performance.now();
				frame = requestAnimationFrame(loop);
			}
		});
		seen.observe(canvas);
		canvas.addEventListener('pointerdown', onDown);
		canvas.addEventListener('pointermove', onMove);
		canvas.addEventListener('pointerup', onUp);
		canvas.addEventListener('pointercancel', onUp);
		canvas.addEventListener('pointerleave', onLeave);
		canvas.addEventListener('wheel', onWheel, { passive: false });
		zoomRef.current = (factor) => {
			const from = { rotate: [...view.current.rotate] as [number, number], k: view.current.k };
			const k = Math.min(MAX_ZOOM, Math.max(1, view.current.k * factor));
			animation.current = {
				from,
				to: { rotate: from.rotate, k },
				start: performance.now(),
				ms: 300
			};
		};
		resize();
		frame = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			seen.disconnect();
			canvas.removeEventListener('pointerdown', onDown);
			canvas.removeEventListener('pointermove', onMove);
			canvas.removeEventListener('pointerup', onUp);
			canvas.removeEventListener('pointercancel', onUp);
			canvas.removeEventListener('pointerleave', onLeave);
			canvas.removeEventListener('wheel', onWheel);
		};
	}, []);

	return (
		<div className="relative mx-auto w-full max-w-80">
			<canvas
				ref={canvasRef}
				role="img"
				aria-label="Globe of where visitors are. The lists beside it have the same numbers."
				className="aspect-square w-full cursor-grab touch-none active:cursor-grabbing"
			/>
			<div className="absolute right-0 bottom-0 flex items-center gap-2">
				<span className="text-xs text-foreground/50">{LEVELS[level]}</span>
				<div className="flex">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Zoom out"
						onClick={() => zoomRef.current(1 / 2)}
						className="rounded-r-none"
					>
						<MinusIcon />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Zoom in"
						onClick={() => zoomRef.current(2)}
						className="-ml-px rounded-l-none"
					>
						<PlusIcon />
					</Button>
				</div>
			</div>
			{hit && (
				<div
					role="tooltip"
					className="pointer-events-none absolute z-10 w-max max-w-xs -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
					style={{ left: hit.x, top: hit.y }}
				>
					{hit.label} · {hit.visitors.toLocaleString('en-US')}{' '}
					{hit.visitors === 1 ? 'visitor' : 'visitors'}
				</div>
			)}
		</div>
	);
}
