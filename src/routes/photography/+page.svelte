<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>


<div class="grid grid-cols-2">
    {#each data.images as image}
        <img src={`https://cdn.rafe.dev/${image.key}`} alt="Photograph" class="self-center min-h-1/2" />
    {/each}
</div>