<script lang="ts">
	import { resolve } from '$app/paths';
	import { getImageUrl } from '$lib/utils';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Rafe Autie | Developer & Photographer</title>
	<meta
		name="description"
		content="Digital home of Rafe Autie, a developer specializing in mobile interfaces and front-end architecture. Exploring the intersection of code and creativity."
	/>

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://rafe.dev/" />
	<meta property="og:title" content="Rafe Autie | Developer & Photographer" />
	<meta
		property="og:description"
		content="Digital home of Rafe Autie, a developer specializing in mobile interfaces and front-end architecture."
	/>
	<meta property="og:image" content={getImageUrl(data.image.key)} />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content="https://rafe.dev/" />
	<meta property="twitter:title" content="Rafe Autie | Developer & Photographer" />
	<meta
		property="twitter:description"
		content="Digital home of Rafe Autie, a developer specializing in mobile interfaces and front-end architecture."
	/>
	<meta property="twitter:image" content={getImageUrl(data.image.key)} />
</svelte:head>

<div class="flex w-full flex-col items-center justify-center">
	<div
		class="tall:bg-red-500 flex h-dvh w-full flex-col items-center justify-center p-10 text-[clamp(1rem,2.5vmin,10rem)] font-semibold tracking-wide text-background transition-colors duration-500 sm:p-15 smh:text-background/0"
		style:background-image={`url('${getImageUrl(data.image.key)}')`}
		style:background-size="contain"
		style:background-position="center"
		style:background-repeat="no-repeat"
		style:background-origin="content-box"
	>
		<p>
			<a href={resolve('/about')}>rafe</a> /
			<a href={resolve('/photography')}>photography</a> /
			<a href={resolve('/development')}>development</a>
		</p>
	</div>
</div>
