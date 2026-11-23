// How much the tests ask of a track, for its size: a race on a real-sized
// circuit, a few kilometres a lap, takes many times as long to run as one
// on the first tracks' 600 m, and walking its centre line takes as many
// times more steps. Only the tests use this.
import { getTrack, type TrackId } from './track';

/** The lap the tests' limits were first set for, in metres. */
const FIRST_LAP = 600;

/** How many times that a track's lap is, and never less than once. */
export const lapScale = (id: TrackId) => Math.max(1, getTrack(id).length / FIRST_LAP);

/** A test's time limit (ms) on a track, for one set on a 600 m lap. */
export const budget = (id: TrackId, ms: number) => ({ timeout: Math.round(ms * lapScale(id)) });

/**
 * How many seeds a test that races `count` on a 600 m lap races on a track:
 * fewer on a longer lap, so the test takes about as long, but never fewer
 * than `least`, the fewest it can still tell anything from.
 */
export const seedsFor = (id: TrackId, count: number, least: number) =>
	Math.max(least, Math.round(count / lapScale(id)));
