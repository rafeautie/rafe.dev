// Plotting into the race's frame: colours as the canvas stores them, boxes,
// and a small bitmap font. The frame is one Uint32Array of pixels, so text and
// panels are drawn pixel by pixel like the track and the cars are, and scale
// up with them.

// colours are packed the way the canvas stores them: alpha, blue, green, red
export function hex(colour: string) {
	const v = parseInt(colour.slice(1), 16);
	return (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0;
}
export function mix(a: number, b: number, t: number) {
	const channel = (shift: number) =>
		(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t) << shift;
	return (0xff000000 | channel(16) | channel(8) | channel(0)) >>> 0;
}

/** A letter is 5 pixels by 7, and the next one starts 6 along. */
export const ADVANCE = 6;

// The font, drawn here as it is drawn on screen: each block is ten letters
// side by side, seven rows deep. Capitals only; small letters are shown as
// capitals.
const SHEETS: [string, string][] = [
	[
		'ABCDEFGHIJ',
		`.###. ####. .###. ####. ##### ##### .###. #...# .###. ..###
		 #...# #...# #...# #...# #.... #.... #...# #...# ..#.. ...#.
		 #...# #...# #.... #...# #.... #.... #.... #...# ..#.. ...#.
		 ##### ####. #.... #...# ####. ####. #.### ##### ..#.. ...#.
		 #...# #...# #.... #...# #.... #.... #...# #...# ..#.. ...#.
		 #...# #...# #...# #...# #.... #.... #...# #...# ..#.. #..#.
		 #...# ####. .###. ####. ##### #.... .###. #...# .###. .##..`
	],
	[
		'KLMNOPQRST',
		`#...# #.... #...# #...# .###. ####. .###. ####. .#### #####
		 #..#. #.... ##.## ##..# #...# #...# #...# #...# #.... ..#..
		 #.#.. #.... #.#.# #.#.# #...# #...# #...# #...# #.... ..#..
		 ##... #.... #.#.# #..## #...# ####. #...# ####. .###. ..#..
		 #.#.. #.... #...# #...# #...# #.... #.#.# #.#.. ....# ..#..
		 #..#. #.... #...# #...# #...# #.... #..#. #..#. ....# ..#..
		 #...# ##### #...# #...# .###. #.... .##.# #...# ####. ..#..`
	],
	[
		'UVWXYZ0123',
		`#...# #...# #...# #...# #...# ##### .###. ..#.. .###. .###.
		 #...# #...# #...# #...# #...# ....# #...# .##.. #...# #...#
		 #...# #...# #...# .#.#. .#.#. ...#. #..## ..#.. ....# ....#
		 #...# #...# #.#.# ..#.. ..#.. ..#.. #.#.# ..#.. ...#. ..##.
		 #...# #...# #.#.# .#.#. ..#.. .#... ##..# ..#.. ..#.. ....#
		 #...# .#.#. ##.## #...# ..#.. #.... #...# ..#.. .#... #...#
		 .###. ..#.. #...# #...# ..#.. ##### .###. .###. ##### .###.`
	],
	[
		'456789.,:!',
		`...#. ##### .###. ##### .###. .###. ..... ..... ..... ..#..
		 ..##. #.... #.... ....# #...# #...# ..... ..... .##.. ..#..
		 .#.#. ####. #.... ...#. #...# #...# ..... ..... .##.. ..#..
		 #..#. ....# ####. ..#.. .###. .#### ..... ..... ..... ..#..
		 ##### ....# #...# ..#.. #...# ....# ..... ..... .##.. ..#..
		 ...#. #...# #...# ..#.. #...# ....# .##.. .##.. .##.. .....
		 ...#. .###. .###. ..#.. .###. .###. .##.. ..#.. ..... ..#..`
	],
	[
		"?'-+/()%><",
		`.###. ..#.. ..... ..... ....# ...#. .#... ##..# .#... ...#.
		 #...# ..#.. ..... ..#.. ....# ..#.. ..#.. ##.#. ..#.. ..#..
		 ....# ..... ..... ..#.. ...#. .#... ...#. ...#. ...#. .#...
		 ...#. ..... ##### ##### ..#.. .#... ...#. ..#.. ....# #....
		 ..#.. ..... ..... ..#.. .#... .#... ...#. .#... ...#. .#...
		 ..... ..... ..... ..#.. #.... ..#.. ..#.. #..## ..#.. ..#..
		 ..#.. ..... ..... ..... #.... ...#. .#... #..## .#... ...#.`
	],
	[
		'×·…↑↓●○→_=',
		`..... ..... ..... ..#.. ..#.. ..... ..... ..... ..... .....
		 ..... ..... ..... .###. ..#.. .###. .###. ..#.. ..... .....
		 #...# ..... ..... #.#.# ..#.. ##### #...# ...#. ..... #####
		 .#.#. .##.. ..... ..#.. ..#.. ##### #...# ##### ..... .....
		 ..#.. .##.. ..... ..#.. #.#.# ##### #...# ...#. ..... #####
		 .#.#. ..... ..... ..#.. .###. .###. .###. ..#.. ..... .....
		 #...# ..... #.#.# ..#.. ..#.. ..... ..... ..... ##### .....`
	],
	[
		'±',
		`..#..
		 ..#..
		 #####
		 ..#..
		 ..#..
		 .....
		 #####`
	]
];

/** Each letter as seven rows, a bit for each of its five pixels. */
const GLYPHS = new Map<string, Uint8Array>([[' ', new Uint8Array(7)]]);
for (const [letters, sheet] of SHEETS) {
	sheet.split('\n').forEach((line, row) => {
		line
			.trim()
			.split(' ')
			.forEach((cell, index) => {
				const letter = [...letters][index];
				if (!GLYPHS.has(letter)) GLYPHS.set(letter, new Uint8Array(7));
				GLYPHS.get(letter)![row] = parseInt(cell.replace(/#/g, '1').replace(/\./g, '0'), 2);
			});
	});
}
// the minus sign numbers are written with (shared.tsx)
GLYPHS.set('−', GLYPHS.get('-')!);

/** The letter to draw for a character: its capital, without accents, or a question mark. */
function glyph(character: string) {
	let found = GLYPHS.get(character);
	if (!found) {
		found = GLYPHS.get(character.normalize('NFD')[0].toUpperCase()) ?? GLYPHS.get('?')!;
		GLYPHS.set(character, found);
	}
	return found;
}

/** How wide a line of text is drawn, in pixels. */
export function measure(text: string, size = 1) {
	return Math.max(0, [...text].length * ADVANCE - 1) * size;
}

/** The text, cut short with an ellipsis if it is wider than `width`. */
export function clip(text: string, width: number, size = 1) {
	const fits = Math.floor((width / size + 1) / ADVANCE);
	const letters = [...text];
	return letters.length <= fits
		? text
		: letters
				.slice(0, Math.max(0, fits - 1))
				.join('')
				.trimEnd() + '…';
}

/** The text as lines no wider than `width`, broken between words. */
export function wrap(text: string, width: number) {
	const lines: string[] = [];
	for (const word of text.split(' ')) {
		const longer = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
		if (lines.length && measure(longer) <= width) lines[lines.length - 1] = longer;
		else lines.push(word);
	}
	return lines;
}

export type Painter = ReturnType<typeof createPainter>;

/**
 * The same painter with each of its pixels drawn `k` of the frame's across
 * and down, for graphics that must stay a readable size on a frame that is
 * shown small. Everything given to it and handed back is in its own pixels.
 */
export function enlarge(p: Painter, k: number): Painter {
	if (k === 1) return p;
	const fill = (x: number, y: number, w: number, h: number, colour: number, alpha = 1) =>
		p.fill(x * k, y * k, w * k, h * k, colour, alpha);
	const text = (x: number, y: number, string: string, colour: number, size = 1) =>
		p.text(x * k, y * k, string, colour, size * k) / k;
	return {
		width: Math.ceil(p.width / k),
		height: Math.ceil(p.height / k),
		fill,
		text,
		clip(box: { x: number; y: number; w: number; h: number } | null) {
			p.clip(box && { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k });
		},
		right(x: number, y: number, string: string, colour: number, size = 1) {
			text(x - measure(string, size), y, string, colour, size);
		},
		centre(x: number, y: number, string: string, colour: number, size = 1) {
			text(x - Math.floor(measure(string, size) / 2), y, string, colour, size);
		},
		outline(x: number, y: number, w: number, h: number, colour: number) {
			fill(x, y, w, 1, colour);
			fill(x, y + h - 1, w, 1, colour);
			fill(x, y, 1, h, colour);
			fill(x + w - 1, y, 1, h, colour);
		}
	};
}

/** Draws into a frame `width` pixels by `height`. Everything is cut off at its edges. */
export function createPainter(frame: Uint32Array, width: number, height: number) {
	// what may be drawn on: the frame, or the part of it `clip` keeps to
	let [left, top, right, bottom] = [0, 0, width, height];

	/** A filled box. With `alpha`, the colour is laid over what is there. */
	function fill(x: number, y: number, w: number, h: number, colour: number, alpha = 1) {
		const across = Math.min(right, x + w);
		const down = Math.min(bottom, y + h);
		for (let py = Math.max(top, y); py < down; py++) {
			for (let k = py * width + Math.max(left, x); k < py * width + across; k++) {
				frame[k] = alpha < 1 ? mix(frame[k], colour, alpha) : colour;
			}
		}
	}

	/** Text with its top left corner at x, y. Returns where it ended. */
	function text(x: number, y: number, string: string, colour: number, size = 1) {
		for (const character of string) {
			const rows = glyph(character);
			for (let row = 0; row < 7; row++) {
				for (let column = 0; column < 5; column++) {
					if (rows[row] & (16 >> column)) {
						fill(x + column * size, y + row * size, size, size, colour);
					}
				}
			}
			x += ADVANCE * size;
		}
		return x;
	}

	return {
		width,
		height,
		fill,
		text,
		/** Keeps what is drawn next inside a box, or, given nothing, the frame again. */
		clip(box: { x: number; y: number; w: number; h: number } | null) {
			[left, top, right, bottom] = box
				? [
						Math.max(0, box.x),
						Math.max(0, box.y),
						Math.min(width, box.x + box.w),
						Math.min(height, box.y + box.h)
					]
				: [0, 0, width, height];
		},
		/** Text that ends at x. */
		right(x: number, y: number, string: string, colour: number, size = 1) {
			text(x - measure(string, size), y, string, colour, size);
		},
		/** Text centred on x. */
		centre(x: number, y: number, string: string, colour: number, size = 1) {
			text(x - Math.floor(measure(string, size) / 2), y, string, colour, size);
		},
		/** The outline of a box, one pixel thick. */
		outline(x: number, y: number, w: number, h: number, colour: number) {
			fill(x, y, w, 1, colour);
			fill(x, y + h - 1, w, 1, colour);
			fill(x, y, 1, h, colour);
			fill(x + w - 1, y, 1, h, colour);
		}
	};
}
