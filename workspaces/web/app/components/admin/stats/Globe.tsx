import { type ExtendedFeature, geoArea, geoCentroid } from 'd3-geo';
import GlobeGl, { type GlobeInstance } from 'globe.gl';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MeshBasicMaterial } from 'three';
import { feature } from 'topojson-client';
import { Button } from '~/components/ui/button';
import type { FilterKey } from '~/lib/stats/dimensions';
import type { CityRow, Row } from '~/lib/stats/report';
import { country as countryName } from './format';
import WORLD from './globe/world.json';

// Where visitors are, on a globe (globe.gl) of hexagons that turns slowly
// until touched. Land is light hexagons; the hexagons visitors came from are
// darker the more came. Drag to turn it, scroll, pinch or the buttons to zoom.
// Hovering names the place, and choosing one filters the page; a filter turns
// the globe to it. Outlines come from scripts/world-map.mjs.

type Topology = Parameters<typeof feature>[0];
type Shape = ExtendedFeature & { id?: string };

// Rounding the outlines to fit a small file can turn a tiny piece inside
// out, which reads as the whole globe but that piece; those are turned back.
function wound<T extends ExtendedFeature>(shape: T): T {
	const geometry = shape.geometry;
	if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') return shape;
	const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
	const fixed = polygons
		.map((rings) =>
			geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI
				? rings.map((ring) => [...ring].reverse())
				: rings
		)
		// rounding can also flatten a speck to nothing, which the hexagons
		// cannot be worked out for (North Korea has one)
		.filter((rings) => geoArea({ type: 'Polygon', coordinates: rings }) > 1e-9);
	return { ...shape, geometry: { type: 'MultiPolygon', coordinates: fixed } };
}

// One entry per country, the same objects every time, so globe.gl keeps the
// hexagons it worked out for each rather than working them out again.
type Country = { code: string; geometry: Shape['geometry'] };
const COUNTRIES: Country[] = (
	feature(WORLD as unknown as Topology, WORLD.objects.countries as never) as unknown as {
		features: Shape[];
	}
).features
	.map(wound)
	.map((shape) => ({ code: String(shape.id), geometry: shape.geometry }));
const BY_CODE = new Map(COUNTRIES.map((entry) => [entry.code, entry]));

// The middle of a country's biggest piece, so France is not centred on the
// sea between it and its islands in South America.
function middleOf(geometry: Shape['geometry']): [number, number] | null {
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

// a theme colour (oklch and all) as the rgb the 3D scene understands.
// Reading a canvas back can wait on the GPU, so each colour is read once.
const RGB = new Map<string, number[]>();
function rgbOf(css: string) {
	let found = RGB.get(css);
	if (found) return found;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return [0, 0, 0];
	context.fillStyle = css;
	context.fillRect(0, 0, 1, 1);
	const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
	found = [r, g, b];
	RGB.set(css, found);
	return found;
}

// hexagon size: H3's level 3, about 70km across
const RESOLUTION = 3;
const MARGIN = 0.25;
// how far the camera can be from the ground, in globe radii
const NEAREST = 0.12;
const FARTHEST = 2.6;
const START = 1.5;

// the visitors in one hexagon, as globe.gl hands them over
type Hex = { points: CityRow[]; sumWeight: number };
// the busiest city in a hexagon
const topOf = (hex: Hex) => hex.points.reduce((a, b) => (b.visitors > a.visitors ? b : a));

type Tip = { label: string; visitors: number };

export function Globe({
	countries,
	cities,
	active,
	onPick
}: {
	countries: Row[];
	cities: CityRow[];
	active: { country?: string; region?: string; city?: string };
	onPick: (key: FilterKey, value: string) => void;
}) {
	const boxRef = useRef<HTMLDivElement>(null);
	const globeRef = useRef<GlobeInstance | null>(null);
	const tipRef = useRef<HTMLDivElement>(null);
	const [tip, setTip] = useState<Tip | null>(null);
	// bumped when the theme changes
	const [theme, setTheme] = useState(0);
	const onPickRef = useRef(onPick);
	// whether the pointer is over the globe: globe.gl can report a hover
	// from where it last saw the pointer, after it has left
	const insideRef = useRef(false);

	useEffect(() => {
		onPickRef.current = onPick;
	}, [onPick]);

	// set the globe up once
	useEffect(() => {
		const box = boxRef.current;
		if (!box) return;
		const still = window.matchMedia('(prefers-reduced-motion: reduce)');
		const globe = new GlobeGl(box, { rendererConfig: { alpha: true, antialias: true } })
			.backgroundColor('rgba(0,0,0,0)')
			.showAtmosphere(false)
			.showGraticules(false)
			.hexPolygonsData(COUNTRIES)
			.hexPolygonGeoJsonGeometry('geometry')
			.hexPolygonResolution(RESOLUTION)
			.hexPolygonMargin(MARGIN)
			.hexPolygonAltitude(0.002)
			.hexPolygonsTransitionDuration(0)
			.hexBinResolution(RESOLUTION)
			.hexBinPointLat('lat')
			.hexBinPointLng('lng')
			.hexBinPointWeight('visitors')
			.hexMargin(MARGIN)
			.hexAltitude(0.004)
			.hexTransitionDuration(0)
			.pointOfView({ lat: 25, lng: 10, altitude: START });
		globeRef.current = globe;
		// checking each new shader for errors stalls the page while it compiles
		globe.renderer().debug.checkShaderErrors = import.meta.env.DEV;
		const radius = globe.getGlobeRadius();
		const controls = globe.controls();
		controls.minDistance = radius * (1 + NEAREST);
		controls.maxDistance = radius * (1 + FARTHEST);
		controls.autoRotate = !still.matches;
		controls.autoRotateSpeed = 0.5;
		// turning is slower near the ground, and stops once zoomed in
		globe.onZoom(({ altitude }) => {
			controls.rotateSpeed = Math.min(1, altitude / START);
			if (altitude < 1) controls.autoRotate = false;
		});

		const size = () => {
			globe.width(box.clientWidth).height(box.clientWidth);
		};
		size();
		const resize = new ResizeObserver(size);
		resize.observe(box);

		// the label follows the pointer; the globe stops turning under it
		const onMove = (event: PointerEvent) => {
			const rect = box.getBoundingClientRect();
			if (tipRef.current) {
				tipRef.current.style.left = `${event.clientX - rect.left}px`;
				tipRef.current.style.top = `${event.clientY - rect.top}px`;
			}
		};
		const onEnter = () => {
			insideRef.current = true;
			controls.autoRotate = false;
		};
		const onLeave = () => {
			insideRef.current = false;
			controls.autoRotate = globe.pointOfView().altitude >= 1 && !still.matches;
			setTip(null);
		};
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
			box.removeEventListener('pointermove', onMove);
			box.removeEventListener('pointerenter', onEnter);
			box.removeEventListener('pointerleave', onLeave);
			globe._destructor();
			box.replaceChildren();
			globeRef.current = null;
		};
	}, []);

	// draw the land and the visitors, in the theme's colours
	useEffect(() => {
		const globe = globeRef.current;
		const box = boxRef.current;
		if (!globe || !box) return;
		const style = getComputedStyle(box);
		const [r, g, b] = rgbOf(style.getPropertyValue('--foreground').trim() || '#000');
		const [pr, pg, pb] = rgbOf(style.getPropertyValue('--background').trim() || '#fff');
		const ink = (alpha: number) => `rgba(${r},${g},${b},${alpha})`;
		// the sea, a touch darker than the page so the globe's edge shows
		const mix = (p: number, i: number) => Math.round(p + (i - p) * 0.04);
		const sea = new MeshBasicMaterial({
			color: `rgb(${mix(pr, r)},${mix(pg, g)},${mix(pb, b)})`
		});
		const counts = new Map(countries.map((row) => [row.key, row.visitors]));
		const most = Math.max(1, ...cities.map((city) => city.visitors));

		globe
			.globeMaterial(sea)
			.hexPolygonColor((land) => (active.country === (land as Country).code ? ink(0.3) : ink(0.12)))
			.onHexPolygonHover((land) => {
				const code = (land as Country | null)?.code;
				const visitors = code ? (counts.get(code) ?? 0) : 0;
				box.style.cursor = visitors ? 'pointer' : '';
				setTip(insideRef.current && code ? { label: countryName(code), visitors } : null);
			})
			.onHexPolygonClick((land) => {
				const { code } = land as Country;
				if (counts.get(code)) onPickRef.current('country', code);
			})
			.hexBinPointsData(cities)
			// darker the more came, so the quietest places still show
			.hexTopColor((hex) => {
				const share = Math.sqrt((hex as Hex).sumWeight / most);
				const chosen = (hex as Hex).points.some((city) => city.key === active.city);
				return ink(chosen ? 1 : 0.3 + 0.6 * Math.min(1, share));
			})
			.hexSideColor(() => ink(0.3))
			.onHexHover((hex) => {
				const found = hex as Hex | null;
				box.style.cursor = found ? 'pointer' : '';
				if (!insideRef.current || !found) {
					setTip(null);
					return;
				}
				const top = topOf(found);
				const others = found.points.length - 1;
				setTip({
					label: others ? `${top.label} and ${others} more` : top.label,
					visitors: found.sumWeight
				});
			})
			.onHexClick((hex) => onPickRef.current('city', topOf(hex as Hex).key));
		return () => sea.dispose();
	}, [countries, cities, active.country, active.city, theme]);

	// turn to what the page is filtered by
	useEffect(() => {
		const globe = globeRef.current;
		if (!globe) return;
		let target: { lat: number; lng: number; altitude: number } | null = null;
		const city = active.city && cities.find((row) => row.key === active.city);
		if (city) {
			target = { lat: city.lat, lng: city.lng, altitude: 0.3 };
		} else if (active.region && cities.length) {
			// the cities left are the region's
			const lat = cities.reduce((sum, row) => sum + row.lat, 0) / cities.length;
			const lng = cities.reduce((sum, row) => sum + row.lng, 0) / cities.length;
			target = { lat, lng, altitude: 0.5 };
		} else if (active.country) {
			const entry = BY_CODE.get(active.country);
			const middle = entry && middleOf(entry.geometry);
			if (middle) target = { lat: middle[1], lng: middle[0], altitude: 0.9 };
		}
		if (!target) return;
		globe.controls().autoRotate = false;
		const ms = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900;
		globe.pointOfView(target, ms);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only when the filters change
	}, [active.country, active.region, active.city]);

	// the buttons zoom by steps
	const zoom = (by: number) => {
		const globe = globeRef.current;
		if (!globe) return;
		const altitude = Math.max(NEAREST, Math.min(FARTHEST, globe.pointOfView().altitude * by));
		globe.pointOfView({ altitude }, 400);
	};

	return (
		<div>
			<div className="flex items-center justify-end pb-2">
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Zoom out"
					onClick={() => zoom(1.8)}
					className="rounded-r-none"
				>
					<MinusIcon />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Zoom in"
					onClick={() => zoom(1 / 1.8)}
					className="-ml-px rounded-l-none"
				>
					<PlusIcon />
				</Button>
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
