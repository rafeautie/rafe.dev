import { type ExtendedFeature, geoArea, geoCentroid, geoDistance } from 'd3-geo';
import GlobeGl, { type GlobeInstance } from 'globe.gl';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasTexture, CircleGeometry, Mesh, MeshBasicMaterial } from 'three';
import { feature } from 'topojson-client';
import { Button } from '~/components/ui/button';
import type { FilterKey } from '~/lib/stats/dimensions';
import type { CityRow, RegionRow, Row } from '~/lib/stats/report';
import { country as countryName } from './format';
import WORLD from './globe/world.json';

// Where visitors are, on a globe (globe.gl) that turns slowly until touched.
// Drag to turn it; scroll, pinch or the buttons step between three levels:
// countries, then states or provinces, then cities as a heatmap. Hovering
// names the place at the level shown, and choosing one filters the page; a
// filter turns the globe to it. Outlines come from scripts/world-map.mjs.

type Topology = Parameters<typeof feature>[0];
type Shape = ExtendedFeature & { id?: string };
type RegionProps = { name: string; codes: string[]; names: string[]; groups: string[] };
type RegionShape = ExtendedFeature & { properties: RegionProps };

// Rounding the outlines to fit a small file can turn a tiny piece inside
// out, which reads as the whole globe but that piece; those are turned back.
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
	.map((shape) => ({ shape, code: String(shape.id), center: geoCentroid(shape) }));
const BY_CODE = new Map(COUNTRIES.map((entry) => [entry.code, entry]));

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

const LEVELS = ['Countries', 'States and provinces', 'Cities'];
// how far the camera is from the ground at each level, in globe radii
const ALTITUDES = [1.5, 0.75, 0.22];
// states are shown for countries this close to the middle of the view, radians
const NEAR = 0.45;

// the countries close to the middle of the view
function nearTo(lat: number, lng: number) {
	return COUNTRIES.filter((entry) => geoDistance([lng, lat], entry.center) < NEAR).map(
		(entry) => entry.code
	);
}

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

// The middle of a country's biggest piece, so France is not centred on the
// sea between it and its islands in South America.
function middleOf(shape: Shape): [number, number] | null {
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
	return biggest ? geoCentroid(biggest) : null;
}

// a theme colour (oklch and all) as the rgb the 3D scene understands
function rgbOf(css: string) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const context = canvas.getContext('2d');
	if (!context) return [0, 0, 0];
	context.fillStyle = css;
	context.fillRect(0, 0, 1, 1);
	const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
	return [r, g, b];
}

// One shape on the globe: a country, or a state of one.
type Area = {
	key: FilterKey;
	// what choosing it filters by; empty when nobody visited
	value: string;
	label: string;
	visitors: number;
	geometry: Shape['geometry'];
};

type Tip = { label: string; visitors: number };

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
	const boxRef = useRef<HTMLDivElement>(null);
	const globeRef = useRef<GlobeInstance | null>(null);
	const tipRef = useRef<HTMLDivElement>(null);
	const [level, setLevel] = useState(0);
	const [tip, setTip] = useState<Tip | null>(null);
	// countries near the middle of the view, whose states are shown
	const [near, setNear] = useState<string[]>([]);
	// bumped when a country's states arrive
	const [loaded, setLoaded] = useState(0);
	// bumped when the theme changes
	const [theme, setTheme] = useState(0);
	const onPickRef = useRef(onPick);
	const levelRef = useRef(level);
	// where a filter turned the globe to, kept when the level changes with it
	const aimRef = useRef<{ lat: number; lng: number; ms: number } | null>(null);

	useEffect(() => {
		onPickRef.current = onPick;
		levelRef.current = level;
	}, [onPick, level]);

	// the shapes to draw: countries, or near ones split into their states
	const areas = useMemo(() => {
		const counts = new Map(countries.map((row) => [row.key, row.visitors]));
		const byCountry = new Map<string, RegionRow[]>();
		for (const row of regions) {
			byCountry.set(row.country, [...(byCountry.get(row.country) ?? []), row]);
		}
		const split = new Set(level > 0 ? near : []);
		const list: Area[] = [];
		for (const { shape, code } of COUNTRIES) {
			const shapes = split.has(code) ? regionCache.get(code) : null;
			if (!shapes) {
				const visitors = counts.get(code) ?? 0;
				list.push({
					key: 'country',
					value: visitors ? code : '',
					label: countryName(code),
					visitors,
					geometry: shape.geometry
				});
				continue;
			}
			const matched = matchRegions(shapes, byCountry.get(code) ?? []);
			shapes.forEach((region, index) => {
				const rows = matched.get(index) ?? [];
				list.push({
					key: 'region',
					value: rows[0]?.key ?? '',
					label: rows[0]?.label ?? region.properties.name,
					visitors: rows.reduce((sum, row) => sum + row.visitors, 0),
					geometry: region.geometry
				});
			});
		}
		return list;
		// eslint-disable-next-line react-hooks/exhaustive-deps -- `loaded` marks new state files
	}, [countries, regions, level, near, loaded]);

	// set the globe up once
	useEffect(() => {
		const box = boxRef.current;
		if (!box) return;
		const still = window.matchMedia('(prefers-reduced-motion: reduce)');
		const globe = new GlobeGl(box, { rendererConfig: { alpha: true, antialias: true } })
			.backgroundColor('rgba(0,0,0,0)')
			.showAtmosphere(false)
			.showGraticules(false)
			.polygonSideColor(() => 'rgba(0,0,0,0)')
			.polygonsTransitionDuration(0)
			.pointOfView({ lat: 25, lng: 10, altitude: ALTITUDES[0] });
		globeRef.current = globe;
		const controls = globe.controls();
		controls.enableZoom = false;
		controls.autoRotate = !still.matches;
		controls.autoRotateSpeed = 0.5;

		const size = () => {
			globe.width(box.clientWidth).height(box.clientWidth);
		};
		size();
		const resize = new ResizeObserver(size);
		resize.observe(box);

		// the states of countries in view
		const look = () => {
			const { lat, lng } = globe.pointOfView();
			setNear(nearTo(lat, lng));
		};
		controls.addEventListener('end', look);
		look();

		// scroll and pinch step a level at a time
		let lastStep = 0;
		let wheel = 0;
		const step = (by: number) => {
			const now = performance.now();
			if (now - lastStep < 450) return;
			const next = Math.max(0, Math.min(2, levelRef.current + by));
			if (next === levelRef.current) return;
			lastStep = now;
			setLevel(next);
		};
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			wheel += event.deltaY;
			if (Math.abs(wheel) > 40) {
				step(wheel < 0 ? 1 : -1);
				wheel = 0;
			}
		};
		let pinch = 0;
		const spread = (event: TouchEvent) =>
			Math.hypot(
				event.touches[0].clientX - event.touches[1].clientX,
				event.touches[0].clientY - event.touches[1].clientY
			);
		const onTouchStart = (event: TouchEvent) => {
			if (event.touches.length === 2) pinch = spread(event);
		};
		const onTouchMove = (event: TouchEvent) => {
			if (event.touches.length !== 2 || !pinch) return;
			const ratio = spread(event) / pinch;
			if (ratio > 1.3 || ratio < 0.77) {
				step(ratio > 1 ? 1 : -1);
				pinch = spread(event);
			}
		};
		// the label follows the pointer; the globe stops turning under it
		const onMove = (event: PointerEvent) => {
			const rect = box.getBoundingClientRect();
			if (tipRef.current) {
				tipRef.current.style.left = `${event.clientX - rect.left}px`;
				tipRef.current.style.top = `${event.clientY - rect.top}px`;
			}
		};
		const onEnter = () => {
			controls.autoRotate = false;
		};
		const onLeave = () => {
			controls.autoRotate = levelRef.current === 0 && !still.matches;
			setTip(null);
		};
		box.addEventListener('wheel', onWheel, { passive: false });
		box.addEventListener('touchstart', onTouchStart, { passive: true });
		box.addEventListener('touchmove', onTouchMove, { passive: true });
		box.addEventListener('pointermove', onMove);
		box.addEventListener('pointerenter', onEnter);
		box.addEventListener('pointerleave', onLeave);

		const themeChange = new MutationObserver(() => setTheme((n) => n + 1));
		themeChange.observe(document.documentElement, { attributes: true });
		const scheme = window.matchMedia('(prefers-color-scheme: dark)');
		const onScheme = () => setTheme((n) => n + 1);
		scheme.addEventListener('change', onScheme);

		// stop drawing while scrolled out of view
		const seen = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting) globe.resumeAnimation();
			else globe.pauseAnimation();
		});
		seen.observe(box);

		return () => {
			resize.disconnect();
			seen.disconnect();
			themeChange.disconnect();
			scheme.removeEventListener('change', onScheme);
			controls.removeEventListener('end', look);
			box.removeEventListener('wheel', onWheel);
			box.removeEventListener('touchstart', onTouchStart);
			box.removeEventListener('touchmove', onTouchMove);
			box.removeEventListener('pointermove', onMove);
			box.removeEventListener('pointerenter', onEnter);
			box.removeEventListener('pointerleave', onLeave);
			globe._destructor();
			box.replaceChildren();
			globeRef.current = null;
		};
	}, []);

	// move to the level chosen; turning is slower near the ground
	useEffect(() => {
		const globe = globeRef.current;
		if (!globe) return;
		const controls = globe.controls();
		controls.rotateSpeed = [1, 0.4, 0.15][level];
		controls.autoRotate =
			level === 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const aim = aimRef.current;
		aimRef.current = null;
		globe.pointOfView(
			aim
				? { lat: aim.lat, lng: aim.lng, altitude: ALTITUDES[level] }
				: { altitude: ALTITUDES[level] },
			aim?.ms ?? 500
		);
		setTip(null);
	}, [level]);

	// load the states of countries in view, once close enough to see them
	useEffect(() => {
		if (level === 0) return;
		for (const code of near) loadRegions(code, () => setLoaded((n) => n + 1));
	}, [level, near]);

	// draw the shapes and cities, in the theme's colours
	useEffect(() => {
		const globe = globeRef.current;
		const box = boxRef.current;
		if (!globe || !box) return;
		const style = getComputedStyle(box);
		const [r, g, b] = rgbOf(style.getPropertyValue('--foreground').trim() || '#000');
		const [pr, pg, pb] = rgbOf(style.getPropertyValue('--background').trim() || '#fff');
		const ink = (alpha: number) => `rgba(${r},${g},${b},${alpha})`;
		const paper = `rgb(${pr},${pg},${pb})`;
		const flat = new Map<number, MeshBasicMaterial>();
		// flat colour, unlit, so the globe reads like the rest of the page
		const material = (alpha: number) => {
			const rounded = Math.round(alpha * 100) / 100;
			let made = flat.get(rounded);
			if (!made) {
				made = new MeshBasicMaterial({
					color: `rgb(${r},${g},${b})`,
					transparent: true,
					opacity: rounded
				});
				flat.set(rounded, made);
			}
			return made;
		};
		// the sea, a touch darker than the page so the globe's edge shows
		const mix = (p: number, i: number) => Math.round(p + (i - p) * 0.04);
		const sea = new MeshBasicMaterial({
			color: `rgb(${mix(pr, r)},${mix(pg, g)},${mix(pb, b)})`
		});
		const max = Math.max(1, ...areas.map((area) => area.visitors));
		const shade = (area: Area) => (area.visitors ? 0.15 + (area.visitors / max) * 0.75 : 0.07);
		const chosen = (area: Area) =>
			area.value !== '' &&
			((area.key === 'country' && area.value === active.country) ||
				(area.key === 'region' && area.value === active.region));
		let hovered: Area | null = null;
		const altitude = (area: Area) => (area === hovered ? 0.012 : chosen(area) ? 0.009 : 0.004);
		// at the city level the shapes are a backdrop for the heatmap
		const shapesHover = level < 2;

		globe
			.globeMaterial(sea)
			.polygonsData(areas)
			.polygonGeoJsonGeometry('geometry')
			.polygonCapMaterial((area) =>
				material(level === 2 ? Math.min(shade(area as Area), 0.25) : shade(area as Area))
			)
			.polygonStrokeColor((area) => (chosen(area as Area) ? ink(0.9) : paper))
			.polygonAltitude((area) => altitude(area as Area))
			.onPolygonHover((area) => {
				if (!shapesHover) return;
				hovered = (area as Area | null) ?? null;
				globe.polygonAltitude((item) => altitude(item as Area));
				box.style.cursor = hovered?.value ? 'pointer' : '';
				setTip(hovered && { label: hovered.label, visitors: hovered.visitors });
			})
			.onPolygonClick((area) => {
				const picked = area as Area;
				if (shapesHover && picked.value) onPickRef.current(picked.key, picked.value);
			});

		// cities: a heatmap of soft glows that darken where they overlap, with
		// a small dot on each to name and choose it
		const cityMax = Math.max(1, ...cities.map((city) => city.visitors));
		const share = (city: CityRow) => Math.sqrt(city.visitors / cityMax);
		const fade = document.createElement('canvas');
		fade.width = fade.height = 64;
		const context = fade.getContext('2d');
		if (context) {
			const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
			gradient.addColorStop(0, ink(1));
			gradient.addColorStop(1, ink(0));
			context.fillStyle = gradient;
			context.fillRect(0, 0, 64, 64);
		}
		const glowTexture = new CanvasTexture(fade);
		const disc = new CircleGeometry(1, 32);
		const glows: MeshBasicMaterial[] = [];
		globe
			.customLayerData(level === 2 ? cities : [])
			.customThreeObject((city) => {
				const glow = new MeshBasicMaterial({
					map: glowTexture,
					transparent: true,
					depthWrite: false,
					opacity: 0.35 + 0.5 * share(city as CityRow)
				});
				glows.push(glow);
				const mesh = new Mesh(disc, glow);
				// in globe units, where the globe's radius is 100
				mesh.scale.setScalar(1.5 + 3 * share(city as CityRow));
				return mesh;
			})
			.customThreeObjectUpdate((mesh, city) => {
				const { lat, lng } = city as CityRow;
				const at = globe.getCoords(lat, lng, 0.006);
				mesh.position.set(at.x, at.y, at.z);
				// flat on the ground, facing out
				mesh.lookAt(at.x * 2, at.y * 2, at.z * 2);
			})
			.pointsData(level === 2 ? cities : [])
			.pointLat('lat')
			.pointLng('lng')
			.pointAltitude(0.008)
			.pointRadius(0.25)
			.pointColor((city) => ((city as CityRow).key === active.city ? ink(1) : ink(0.6)))
			.onPointHover((city) => {
				const row = city as CityRow | null;
				box.style.cursor = row ? 'pointer' : '';
				setTip(row && { label: row.label, visitors: row.visitors });
			})
			.onPointClick((city) => onPickRef.current('city', (city as CityRow).key));
		return () => {
			for (const made of [...flat.values(), ...glows]) made.dispose();
			sea.dispose();
			disc.dispose();
			glowTexture.dispose();
		};
	}, [areas, cities, level, active.country, active.region, active.city, theme]);

	// turn to what the page is filtered by
	const focus = active.country ?? (active.city ?? active.region)?.split(', ').pop() ?? undefined;
	const regionShapes = focus && active.region ? regionCache.get(focus) : undefined;
	useEffect(() => {
		const globe = globeRef.current;
		if (!globe) return;
		let target: { lat: number; lng: number; level: number } | null = null;
		if (active.city) {
			const city = cities.find((row) => row.key === active.city);
			if (city) target = { lat: city.lat, lng: city.lng, level: 2 };
		}
		if (!target && active.region && focus) {
			loadRegions(focus, () => setLoaded((n) => n + 1));
			const rows = regions.filter((row) => row.key === active.region);
			const matched = regionShapes ? matchRegions(regionShapes, rows) : new Map();
			const outlines = regionShapes?.filter((_, index) => matched.has(index)) ?? [];
			if (outlines.length) {
				const [lng, lat] = geoCentroid({ type: 'FeatureCollection', features: outlines });
				target = { lat, lng, level: 2 };
			}
		}
		if (!target && focus) {
			const entry = BY_CODE.get(focus);
			const middle = entry && middleOf(entry.shape);
			if (middle) target = { lat: middle[1], lng: middle[0], level: 1 };
		}
		if (!target) return;
		const ms = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900;
		const { lat, lng, level: next } = target;
		globe.pointOfView({ lat, lng, altitude: ALTITUDES[next] }, ms);
		// if the level changes too, moving to it must not undo this turn
		aimRef.current = next === levelRef.current ? null : { lat, lng, ms };
		setLevel(next);
		setNear(nearTo(lat, lng));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only when the filters change
	}, [active.country, active.region, active.city, !!regionShapes]);

	return (
		<div>
			<div className="flex items-center justify-end gap-2 pb-2">
				<span className="text-xs text-foreground/50">{LEVELS[level]}</span>
				<div className="flex">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Zoom out"
						disabled={level === 0}
						onClick={() => setLevel((n) => Math.max(0, n - 1))}
						className="rounded-r-none"
					>
						<MinusIcon />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Zoom in"
						disabled={level === 2}
						onClick={() => setLevel((n) => Math.min(2, n + 1))}
						className="-ml-px rounded-l-none"
					>
						<PlusIcon />
					</Button>
				</div>
			</div>
			<div className="relative mx-auto max-w-80">
				<div
					ref={boxRef}
					role="img"
					aria-label="Globe of where visitors are. The lists beside it have the same numbers."
					className="aspect-square w-full cursor-grab touch-none overflow-hidden rounded-full active:cursor-grabbing"
				/>
				<div
					ref={tipRef}
					role="tooltip"
					hidden={!tip}
					className="pointer-events-none absolute z-10 w-max max-w-xs -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
				>
					{tip && (
						<>
							{tip.label} · {tip.visitors.toLocaleString('en-US')}{' '}
							{tip.visitors === 1 ? 'visitor' : 'visitors'}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
