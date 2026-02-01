<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Photography | Rafe Autie</title>
    <meta name="description" content="A curated selection of photographs by Rafe Autie, showcasing moments captured through the lens in the American West." />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://rafe.dev/photography" />
    <meta property="og:title" content="Photography | Rafe Autie" />
    <meta property="og:description" content="A curated selection of photographs by Rafe Autie, showcasing moments captured through the lens." />
    {#if data.images.length > 0}
        <meta property="og:image" content={`https://cdn.rafe.dev/${data.images[0].key}`} />
        <meta property="twitter:image" content={`https://cdn.rafe.dev/${data.images[0].key}`} />
    {/if}

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="https://rafe.dev/photography" />
    <meta property="twitter:title" content="Photography | Rafe Autie" />
    <meta property="twitter:description" content="A curated selection of photographs by Rafe Autie, showcasing moments captured through the lens." />
</svelte:head>

<div class="grid grid-cols-2">
    {#each data.images as image}
        <img src={`https://cdn.rafe.dev/${image.key}`} alt="Photograph" class="self-center min-h-1/2" />
    {/each}
</div>