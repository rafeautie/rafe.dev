import type { LayerCake } from 'layercake';
import type { Readable } from 'svelte/store';

export interface DataItem {
    clock: number;
    value: number;
}

export interface LayerCakeContext {
    data: Readable<DataItem[]>;
    xGet: Readable<(d: DataItem) => number>;
    yGet: Readable<(d: DataItem) => number>;
    xScale: Readable<any>;
    yScale: Readable<any>;
    xRange: Readable<[number, number]>;
    yRange: Readable<[number, number]>;
    width: Readable<number>;
    height: Readable<number>;
    config: Readable<{}>;
}
