<script lang="ts">
	import { resolve } from '$app/paths';
	import { getImageUrl } from '$lib/utils';
</script>

<svelte:head>
	<title>About | Rafe Autie</title>
	<meta
		name="description"
		content="Learn more about Rafe Autie, a developer based in California specializing in mobile interfaces and front-end architecture, with a passion for photography."
	/>

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="profile" />
	<meta property="og:url" content="https://rafe.dev/about" />
	<meta property="og:title" content="About | Rafe Autie" />
	<meta
		property="og:description"
		content="Based in California, I am a developer specializing in mobile interfaces and front-end architecture."
	/>
	<meta property="og:image" content={getImageUrl('DSCF0740.JPEG')} />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content="https://rafe.dev/about" />
	<meta property="twitter:title" content="About | Rafe Autie" />
	<meta
		property="twitter:description"
		content="Based in California, I am a developer specializing in mobile interfaces and front-end architecture."
	/>
	<meta property="twitter:image" content={getImageUrl('DSCF0740.JPEG')} />
</svelte:head>

<div class="flex flex-col gap-8 p-8 text-xl text-black">
	<div>
		<p class="text-4xl font-semibold"><a href={resolve('/')}>rafe / about</a></p>
		<a href="mailto:rafe@rafe.dev">rafe@rafe.dev</a>
	</div>
	<div class="flex max-w-4xl flex-col gap-8">
		<p>
			Based in California, I am a developer specializing in mobile interfaces and front-end
			architecture. I believe the best digital experiences feel as intentional as a well-composed
			photograph.
		</p>
		<p>
			When I’m not behind a screen, I’m usually lost in a National Park with a camera in my hand,
			chasing light and documenting the rugged beauty of the West.
		</p>
	</div>
	<div class="flex flex-col gap-6">
		<img src={getImageUrl('DSCF0740.JPEG')} alt="Yosemite Valley" />
		<div class="grid grid-cols-3 gap-6">
			<img src={getImageUrl('DSCF0770.JPEG')} alt="Yosemite Lodge" />
			<img src={getImageUrl('DSCF0784.JPEG')} alt="Yosemite Abandoned Gas Station" />
			<img src={getImageUrl('DSCF0754.JPEG')} alt="Half Dome and a Plane" />
		</div>
	</div>
</div>

<style>
	:global(html) {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}

	:global(html::-webkit-scrollbar) {
		display: none;
	}
</style>
