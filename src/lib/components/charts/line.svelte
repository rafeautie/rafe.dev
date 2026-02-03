<script lang="ts">
	import { getContext } from 'svelte';
	import type { LayerCakeContext } from './shared.svelte';

	const { data, xGet, yGet } = getContext<LayerCakeContext>('LayerCake');

	let { stroke = 'red' } = $props();

	let path = $derived(
		'M' +
			$data
				.map((d) => {
					return $xGet(d) + ',' + $yGet(d);
				})
				.join('L')
	);
</script>

<path class="path-line" d={path} {stroke}></path>

<style>
	.path-line {
		fill: none;
		stroke-linejoin: round;
		stroke-linecap: round;
		stroke-width: 2;
	}
</style>
