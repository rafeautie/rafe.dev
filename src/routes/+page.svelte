<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Rafe Autie | Developer & Photographer</title>
	<meta name="description" content="Digital home of Rafe Autie, a developer specializing in mobile interfaces and front-end architecture. Exploring the intersection of code and creativity." />
	
	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://rafe.dev/" />
	<meta property="og:title" content="Rafe Autie | Developer & Photographer" />
	<meta property="og:description" content="Digital home of Rafe Autie, a developer specializing in mobile interfaces and front-end architecture." />
	<meta property="og:image" content={`https://cdn.rafe.dev/${data.image.key}`} />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content="https://rafe.dev/" />
	<meta property="twitter:title" content="Rafe Autie | Developer & Photographer" />
	<meta property="twitter:description" content="Digital home of Rafe Autie, a developer specializing in mobile interfaces and front-end architecture." />
	<meta property="twitter:image" content={`https://cdn.rafe.dev/${data.image.key}`} />
</svelte:head>

<div class="flex flex-col items-center justify-center w-full">
    <div 
        class="flex flex-col items-center justify-center w-full h-dvh text-xl md:text-3xl text-white font-semibold p-10 md:p-20" 
        style:background-image={`url('https://cdn.rafe.dev/${data.image.key}')`}
        style:background-size="contain"
        style:background-position="center"
        style:background-repeat="no-repeat"
        style:background-origin="content-box"
    >
        <p><a href="/about">rafe</a> / <a href="/photography">photography</a> / <a href="/development">development</a></p>
    </div>
</div>