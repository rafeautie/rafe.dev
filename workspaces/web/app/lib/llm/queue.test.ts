import { describe, expect, it } from 'vitest';
import { AskQueue } from './queue';

type Item = { id: number; priority?: number; deadline?: number };

const ids = (items: Item[]) => items.map((item) => item.id);

function drain(queue: AskQueue<Item>, now = 0): number[] {
	const order: number[] = [];
	for (;;) {
		const { next } = queue.take(now);
		if (!next) return order;
		order.push(next.id);
	}
}

describe('AskQueue', () => {
	it('answers higher priority first, and the same priority in the order asked', () => {
		const queue = new AskQueue<Item>();
		queue.push({ id: 1 });
		queue.push({ id: 2, priority: 5 });
		queue.push({ id: 3 });
		queue.push({ id: 4, priority: 5 });
		queue.push({ id: 5, priority: -1 });
		queue.push({ id: 6, priority: 9 });
		expect(queue.size).toBe(6);
		expect(drain(queue)).toEqual([6, 2, 4, 1, 3, 5]);
		expect(queue.size).toBe(0);
	});

	it('drops what has passed its deadline on the way to the next', () => {
		const queue = new AskQueue<Item>();
		queue.push({ id: 1, priority: 2, deadline: 100 });
		queue.push({ id: 2, priority: 1, deadline: 50 });
		queue.push({ id: 3, deadline: 500 });
		queue.push({ id: 4 });
		const first = queue.take(200);
		expect(first.next?.id).toBe(3);
		expect(ids(first.expired)).toEqual([1, 2]);
		expect(queue.take(1000)).toEqual({ next: { id: 4 }, expired: [] });
	});

	it('counts a deadline reached as passed', () => {
		const queue = new AskQueue<Item>();
		queue.push({ id: 1, deadline: 100 });
		expect(queue.take(100)).toEqual({ next: undefined, expired: [{ id: 1, deadline: 100 }] });
	});

	it('hands back everything waiting when cleared', () => {
		const queue = new AskQueue<Item>();
		queue.push({ id: 1 });
		queue.push({ id: 2, priority: 3 });
		expect(ids(queue.clear())).toEqual([2, 1]);
		expect(queue.take(0)).toEqual({ expired: [] });
	});
});
