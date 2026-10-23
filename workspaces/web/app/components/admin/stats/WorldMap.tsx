import { geoEqualEarth } from 'd3-geo';
import { ArrowLeftIcon } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import type { CityRow, RegionRow, Row } from '~/lib/stats/report';
import { cn } from '~/lib/utils';
import { country, NUMBER } from './format';
import WORLD from './world-map.json';

// Visitors on a map, darker for more. The world shows countries; choosing one
// filters the page by it and zooms in, to its states or provinces and its
// cities as dots, each of which filters the page too. The outlines come from
// scripts/world-map.mjs.

type RegionFile = {
	box: [number, number, number, number];
	regions: { d: string; name: string; codes: string[]; names: string[]; groups: string[] }[];
};

// a country's regions load when the map first zooms into it
const REGION_FILES = import.meta.glob<RegionFile>('./regions/*.json', { import: 'default' });

const projection = geoEqualEarth()
	.scale(WORLD.projection.scale)
	.translate(WORLD.projection.translate as [number, number]);

export type MapZoom = { country: string; regions: RegionRow[]; cities: CityRow[] };

const visitors = (count: number) =>
	`${NUMBER.format(count)} ${count === 1 ? 'visitor' : 'visitors'}`;

// darker for more, from a faint 15% to 90%
function shade(count: number, max: number) {
	return count
		? {
				fill: `color-mix(in oklab, var(--foreground) ${Math.round(15 + (count / max) * 75)}%, transparent)`
			}
		: undefined;
}

function Shape({
	label,
	count,
	max,
	active,
	onPick,
	shape,
	dot = false
}: {
	label: string;
	count: number;
	max: number;
	active: boolean;
	onPick?: () => void;
	shape: ReactElement;
	// a city: solid, on top of the shaded regions
	dot?: boolean;
}) {
	const text = `${label} · ${visitors(count)}`;
	return (
		<Tooltip>
			<TooltipTrigger
				render={shape}
				aria-label={text}
				onClick={onPick}
				className={cn(
					'fill-foreground/[0.07] stroke-background stroke-[0.5px] transition-[fill-opacity] outline-none [vector-effect:non-scaling-stroke]',
					onPick && 'cursor-pointer hover:[fill-opacity:0.8]',
					dot && 'fill-foreground stroke-[1px]',
					active && 'stroke-foreground stroke-[1.5px]',
					active && dot && 'stroke-background stroke-[2px]'
				)}
				style={dot ? undefined : shade(count, max)}
			/>
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}

export function WorldMap({
	rows,
	zoom,
	active,
	onPick,
	onWorld
}: {
	rows: Row[];
	zoom: MapZoom | null;
	active: { country?: string; region?: string; city?: string };
	onPick: (key: 'country' | 'region' | 'city', value: string) => void;
	onWorld: () => void;
}) {
	const [loaded, setLoaded] = useState<{ code: string; file: RegionFile | null }>();
	const code = zoom?.country;
	useEffect(() => {
		if (!code) return;
		let current = true;
		const load = REGION_FILES[`./regions/${code}.json`];
		(load ? load() : Promise.resolve(null))
			.catch(() => null)
			.then((file) => current && setLoaded({ code, file }));
		return () => {
			current = false;
		};
	}, [code]);
	const file = code && loaded?.code === code ? loaded.file : undefined;

	return (
		<div className="relative">
			{zoom && (
				<div className="flex items-center gap-2 pb-2 text-sm text-foreground/50">
					<Button variant="ghost" size="sm" onClick={onWorld} className="-ml-2 font-normal">
						<ArrowLeftIcon />
						World
					</Button>
					<span>{country(zoom.country)}</span>
				</div>
			)}
			{zoom && file ? (
				<CountryMap zoom={zoom} file={file} active={active} onPick={onPick} />
			) : zoom && file === null ? (
				<p className="py-3 text-foreground/50">No map of {country(zoom.country)}.</p>
			) : (
				<World rows={rows} active={active.country} onPick={(value) => onPick('country', value)} />
			)}
		</div>
	);
}

function World({
	rows,
	active,
	onPick
}: {
	rows: Row[];
	active?: string;
	onPick: (code: string) => void;
}) {
	const counts = new Map(rows.map((row) => [row.key, row.visitors]));
	const max = Math.max(1, ...rows.map((row) => row.visitors));
	return (
		<svg
			viewBox={WORLD.viewBox}
			className="h-auto w-full"
			role="group"
			aria-label="Visitors by country"
		>
			{Object.entries(WORLD.paths as Record<string, string>).map(([code, d]) => {
				const count = counts.get(code) ?? 0;
				return (
					<Shape
						key={code}
						label={country(code)}
						count={count}
						max={max}
						active={active === code}
						onPick={count ? () => onPick(code) : undefined}
						shape={<path d={d} />}
					/>
				);
			})}
		</svg>
	);
}

function CountryMap({
	zoom,
	file,
	active,
	onPick
}: {
	zoom: MapZoom;
	file: RegionFile;
	active: { region?: string; city?: string };
	onPick: (key: 'region' | 'city', value: string) => void;
}) {
	// each region of visitors on its outlines: by Cloudflare's code, or by name
	// for visits from before codes were kept, or else as the larger region a
	// group of outlines makes up, as England is the UK's English counties.
	const byOutline = new Map<number, RegionRow[]>();
	const outlines = (match: (region: RegionFile['regions'][number]) => boolean) =>
		file.regions.flatMap((region, index) => (match(region) ? [index] : []));
	for (const row of zoom.regions) {
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
	const regionMax = Math.max(1, ...zoom.regions.map((row) => row.visitors));
	const cityMax = Math.max(1, ...zoom.cities.map((row) => row.visitors));
	const [x, y, width, height] = file.box;

	return (
		<svg
			viewBox={`${x} ${y} ${width} ${height}`}
			className="h-auto w-full"
			role="group"
			aria-label={`Visitors in ${country(zoom.country)}`}
		>
			{file.regions.map((region, index) => {
				const rows = byOutline.get(index) ?? [];
				const count = rows.reduce((sum, row) => sum + row.visitors, 0);
				return (
					<Shape
						key={index}
						label={rows[0]?.label ?? region.name}
						count={count}
						max={regionMax}
						active={rows.some((row) => row.key === active.region)}
						onPick={rows.length ? () => onPick('region', rows[0].key) : undefined}
						shape={<path d={region.d} />}
					/>
				);
			})}
			{zoom.cities.map((city) => {
				const point = projection([city.lng, city.lat]);
				if (!point) return null;
				return (
					<Shape
						key={city.key}
						label={city.label}
						count={city.visitors}
						max={cityMax}
						active={city.key === active.city}
						onPick={() => onPick('city', city.key)}
						shape={
							<circle
								cx={point[0]}
								cy={point[1]}
								r={width * (0.004 + 0.01 * Math.sqrt(city.visitors / cityMax))}
							/>
						}
						dot
					/>
				);
			})}
		</svg>
	);
}
