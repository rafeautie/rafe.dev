// The requests waiting for the model, which answers one at a time. Higher
// priority goes first, and the same priority in the order asked. A request
// whose deadline has passed by the time its turn comes is dropped rather than
// answered: by then the person it was for has moved on.

type Waiting = { priority?: number; deadline?: number };

export class AskQueue<T extends Waiting> {
	// highest priority first, in the order they came within one
	private items: { item: T; priority: number }[] = [];

	get size() {
		return this.items.length;
	}

	push(item: T) {
		const priority = item.priority ?? 0;
		const at = this.items.findIndex((waiting) => waiting.priority < priority);
		this.items.splice(at < 0 ? this.items.length : at, 0, { item, priority });
	}

	// The next request to answer, and those dropped on the way to it
	take(now: number): { next?: T; expired: T[] } {
		const expired: T[] = [];
		for (;;) {
			const first = this.items.shift();
			if (!first) return { expired };
			const { deadline } = first.item;
			if (deadline !== undefined && deadline <= now) expired.push(first.item);
			else return { next: first.item, expired };
		}
	}

	// Everything still waiting, which is no longer
	clear(): T[] {
		const items = this.items.map(({ item }) => item);
		this.items = [];
		return items;
	}
}
