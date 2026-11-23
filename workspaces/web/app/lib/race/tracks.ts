// The tracks /race can run on, as data: each one's shape, how big a world it
// sits in, its banking and where its pits are, in a file of its own in
// ./tracks/. track.ts works out the rest from these: the centre line, the
// racing line, the walls and the infield. Adding a track is adding its file
// and a line here, then running `node scripts/race-lines.mjs` to work out
// its racing line (docs/race-tracks-handoff.md).
import * as daytona from './tracks/daytona';
import * as indianapolis from './tracks/indianapolis';
import type { Layout } from './tracks/layout';
import * as martinsville from './tracks/martinsville';
import * as monza from './tracks/monza';
import * as silverstone from './tracks/silverstone';

export * from './tracks/layout';

export const LAYOUTS = {
	daytona: daytona.layout,
	indianapolis: indianapolis.layout,
	martinsville: martinsville.layout,
	monza: monza.layout,
	silverstone: silverstone.layout
} satisfies Record<string, Layout>;
