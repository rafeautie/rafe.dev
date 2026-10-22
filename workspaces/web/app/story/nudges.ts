// Rules for readers' nudges, shared by the API and the page. A nudge is a short
// wish for what happens next. It goes into the next chapter not yet being
// written, and a reader can send one per chapter: after that they wait until
// the chapter it went into is out, so a day that fails to publish does not
// hand anyone a second say.

// What the daily job is doing for the pending chapter; late means it failed
// and will try again.
export type State = 'reading' | 'writing' | 'publishing' | 'late';

export const NUDGE_MAX = 200;

// The job reads at most this many nudges a day, picked at random.
export const NUDGE_CAP = 5000;

// While the job is working on the pending chapter, new nudges go to the one
// after it. A late day leaves its nudges waiting for the retry.
export function nudgeTarget(latest: number, status: { chapter: number; state: State } | null) {
	const pending = latest + 1;
	const busy = status?.chapter === pending && status.state !== 'late';
	return busy ? pending + 1 : pending;
}

// The state the page shows: only a status for the pending chapter counts, as
// one for an older chapter is left over from a day that went fine.
export function pendingState(latest: number, status: { chapter: number; state: State } | null) {
	return status?.chapter === latest + 1 ? status.state : null;
}

// Whether a reader who nudged `chapter` must still wait.
export function waiting(chapter: number | null, latest: number) {
	return chapter !== null && chapter > latest;
}

// Spaces folded and trimmed. Null when nothing is left or it is too long.
export function cleanNudge(text: unknown): string | null {
	if (typeof text !== 'string') return null;
	const clean = text.replace(/\s+/g, ' ').trim();
	return clean && clean.length <= NUDGE_MAX ? clean : null;
}
