import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DataItem } from "./components/charts/shared.svelte";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function roundTo(num: number, precision: number): number {
	const factor = Math.pow(10, precision);
	return Math.round(num * factor) / factor;
}

export function bucketData(data: DataItem[], bucketSize: number): DataItem[] {
	const buckets: Record<number, number[]> = {};

	data.forEach(item => {
		// Determine the bucket "floor" (e.g., 123 becomes 100 if size is 100)
		const bucket = Math.floor(item.clock / bucketSize) * bucketSize;

		if (!buckets[bucket]) buckets[bucket] = [];
		buckets[bucket].push(item.value);
	});

	// Map back to DataItem[] by averaging values in each bucket
	return Object.keys(buckets).map(key => ({
		clock: Number(key),
		value: buckets[Number(key)].reduce((a, b) => a + b, 0) / buckets[Number(key)].length
	}));
}

export function binMarketData(
	data: {
		clock: number;
		prices: Record<string, number>;
		volumes: Record<string, { BUY: number; SELL: number }>;
	}[],
	symbol: string,
	binSize: number
): BinnedMarketData[] {
	if (data.length === 0) return [];

	if (binSize === 1) {
		return data.map((state) => ({
			clock: state.clock,
			price: state.prices[symbol],
			buyVolume: state.volumes[symbol].BUY,
			sellVolume: state.volumes[symbol].SELL
		}));
	}

	const result: BinnedMarketData[] = [];
	for (let i = 0; i < data.length; i += binSize) {
		const chunk = data.slice(i, i + binSize);
		if (chunk.length === 0) break;

		const lastItem = chunk[chunk.length - 1];

		const price = lastItem.prices[symbol];
		const buyVolume = chunk.reduce((acc, curr) => acc + curr.volumes[symbol].BUY, 0);
		const sellVolume = chunk.reduce((acc, curr) => acc + curr.volumes[symbol].SELL, 0);

		result.push({
			clock: lastItem.clock,
			price,
			buyVolume,
			sellVolume
		});
	}
	return result;
}

export interface BinnedMarketData {
	clock: number;
	price: number;
	buyVolume: number;
	sellVolume: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
