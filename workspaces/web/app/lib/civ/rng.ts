// A seeded random number generator (sfc32), so a world and everything that
// happens in it can be replayed from its seed. Its whole state is four
// numbers, so it saves with the world.

export type RngState = [number, number, number, number];

export class Rng {
	private a: number;
	private b: number;
	private c: number;
	private d: number;

	constructor(seed: number | RngState) {
		if (Array.isArray(seed)) {
			[this.a, this.b, this.c, this.d] = seed;
		} else {
			this.a = 0x9e3779b9;
			this.b = 0x243f6a88;
			this.c = 0xb7e15162;
			this.d = seed >>> 0;
			// stir, so nearby seeds don't start out alike
			for (let i = 0; i < 15; i++) this.next();
		}
	}

	// a float in [0, 1)
	next(): number {
		this.a >>>= 0;
		this.b >>>= 0;
		this.c >>>= 0;
		this.d >>>= 0;
		let t = (this.a + this.b) | 0;
		this.a = this.b ^ (this.b >>> 9);
		this.b = (this.c + (this.c << 3)) | 0;
		this.c = (this.c << 21) | (this.c >>> 11);
		this.d = (this.d + 1) | 0;
		t = (t + this.d) | 0;
		this.c = (this.c + t) | 0;
		return (t >>> 0) / 4294967296;
	}

	// an integer in [min, max]
	int(min: number, max: number): number {
		return min + Math.floor(this.next() * (max - min + 1));
	}

	range(min: number, max: number): number {
		return min + this.next() * (max - min);
	}

	chance(p: number): boolean {
		return this.next() < p;
	}

	pick<T>(items: readonly T[]): T {
		return items[Math.floor(this.next() * items.length)];
	}

	// picks by weight; weights need not sum to 1
	weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
		let total = 0;
		for (const item of items) total += Math.max(0, weight(item));
		if (total <= 0) return undefined;
		let roll = this.next() * total;
		for (const item of items) {
			roll -= Math.max(0, weight(item));
			if (roll < 0) return item;
		}
		return items[items.length - 1];
	}

	// roughly normal, mean 0 and spread 1
	gauss(): number {
		return (this.next() + this.next() + this.next() + this.next() - 2) * 1.732;
	}

	// an independent generator, so one system's draws don't shift another's
	fork(): Rng {
		return new Rng([
			(this.next() * 4294967296) >>> 0,
			(this.next() * 4294967296) >>> 0,
			(this.next() * 4294967296) >>> 0,
			(this.next() * 4294967296) >>> 0
		]);
	}

	state(): RngState {
		return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
	}
}
