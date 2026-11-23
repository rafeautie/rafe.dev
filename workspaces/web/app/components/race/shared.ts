import { useEffect, useRef, useState } from 'react';
import type { Duel, Market } from '~/lib/race/betting';
import type { Bet } from '~/lib/race/room';
import { ROSTER } from '~/lib/race/roster';
import type { Flag } from '~/lib/race/sim';

// What the pieces of the race UI have in common: how a bet and a number are
// written, and the two small shapes Live hands down.

export const entry = (id: string) => ROSTER.find((entry) => entry.id === id)!;

/** A bet as the ticker shows it. */
export type Tick = { name: string; market: Market; outcome: string; stake: number };

/** The running order, lifted out of the replay a few times a second. */
export type Running = {
	/** Car ids, first place first. */
	order: string[];
	/** Per car, by id: how far round (0 to 1) and whether it is out or home. */
	cars: Record<string, { fraction: number; lap: number; retired: boolean; finished: boolean }>;
	/** Whether any car has retired so far. */
	anyOut: boolean;
	/** The flag that is flying. */
	flag: Flag;
};

/** What each flag is called where it is shown, and what it means, said in full. */
export const FLAGS: Record<Flag, string> = {
	green: 'Green',
	yellow: 'Caution',
	restart: 'Going green',
	checkered: 'Finish'
};
export const FLAG_MEANS: Record<Flag, string> = {
	green: 'Green flag: the race is on.',
	yellow: 'Caution: the field is held in order behind the leader.',
	restart: 'Going green: the field lines up two by two for the restart at the line.',
	checkered: 'Checkered flag: the race has been won.'
};

/** Whether a bet would win if the race ended now, where the running order says. */
export function holding(bet: Bet, running: Running | null, duel: Duel): boolean | null {
	if (!running || bet.payout !== null) return null;
	const [a, b] = bet.outcome.split('>');
	switch (bet.market) {
		case 'win':
			return running.order[0] === a;
		case 'podium':
			return running.order.slice(0, 3).includes(a);
		case 'exacta':
			return running.order[0] === a && running.order[1] === b;
		case 'clean':
			return bet.outcome === 'yes' ? !running.anyOut : running.anyOut;
		case 'duel':
			// the first of the two in the running order is ahead of the other
			return duel ? running.order.find((id) => duel.includes(id)) === a : null;
		// who sets the best lap is not in the running order
		default:
			return null;
	}
}

/** Short names, to fit six tabs in a row. */
export const SHORT: Record<Market, string> = {
	win: 'Win',
	podium: 'Top 3',
	exacta: 'Exacta',
	duel: 'Duel',
	lap: 'Fast lap',
	clean: 'Clean'
};

/** What a market asks, in a line. */
export const ASKS: Record<Market, string> = {
	win: 'Which car wins',
	podium: 'Which car finishes in the top three',
	exacta: 'Which two cars finish first and second, in order',
	duel: 'Which of the two cars finishes ahead of the other',
	lap: 'Which car sets the fastest lap',
	clean: 'Whether every car finishes without retiring'
};

/** What an outcome is called: a car, two cars in order, or yes and no. */
export function label(market: string, outcome: string) {
	if (market === 'clean') return outcome === 'yes' ? 'Clean' : 'Not clean';
	return outcome
		.split('>')
		.map((id) => entry(id).name)
		.join(' then ');
}

/**
 * A control with nothing of its own to show: the graphic drawn under it is
 * the button (hud.ts). It lights a little under the pointer and is outlined
 * when the keyboard is on it.
 */
export const hit =
	'pointer-events-auto absolute cursor-pointer hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-default disabled:hover:bg-transparent';

/**
 * The same for a text field: what is typed is drawn under it, so its own
 * letters are not shown, nor its caret, nor its highlight over what is
 * selected. Those are drawn too, from `useSelection`.
 */
export const ghost =
	'absolute cursor-text appearance-none border-0 bg-transparent p-0 text-transparent caret-transparent shadow-none outline-none selection:bg-transparent selection:text-transparent focus:border-0 focus:ring-0 focus:outline-none';

/** Where a text field's caret is, or what of it is selected: from and to, counted in characters. */
export type Selection = [number, number];

/**
 * Follows the caret and the selection of a text field, for drawing them. Give
 * the field the ref it returns.
 */
export function useSelection() {
	const field = useRef<HTMLInputElement>(null);
	const [selection, setSelection] = useState<Selection>([0, 0]);
	useEffect(() => {
		const read = () => {
			const input = field.current;
			if (!input) return;
			const [from, to] = [input.selectionStart ?? 0, input.selectionEnd ?? 0];
			setSelection((was) => (was[0] === from && was[1] === to ? was : [from, to]));
		};
		// browsers differ on which of these they send for a caret that moved
		const events = ['selectionchange', 'input', 'keyup', 'pointerup', 'focusin'];
		for (const event of events) document.addEventListener(event, read);
		const first = requestAnimationFrame(read);
		return () => {
			for (const event of events) document.removeEventListener(event, read);
			cancelAnimationFrame(first);
		};
	}, []);
	return [field, selection] as const;
}

/** Whole chips, grouped, with a real minus sign. */
export function chips(value: number) {
	const text = Math.abs(Math.round(value)).toLocaleString('en-US');
	return value < 0 ? `−${text}` : text;
}

/** A change in chips, always signed. */
export function signed(value: number) {
	return value === 0 ? '±0' : value > 0 ? `+${chips(value)}` : chips(value);
}
