<script lang="ts">
	import { getContext } from 'svelte';
	import type { LayerCakeContext } from './shared.svelte';
	import { cn } from '$lib/utils';

	const { data, xGet, yGet } = getContext<LayerCakeContext>('LayerCake');

	let path = $derived(
		'M' +
			$data
				.map((d) => {
					return $xGet(d) + ',' + $yGet(d);
				})
				.join('L')
	);
</script>

<svg>
	<path
		class={cn('fill-none stroke-blue-500 stroke-2')}
		style:stroke-linejoin="round"
		style:stroke-linecap="round"
		d={path}
	></path>
</svg>
