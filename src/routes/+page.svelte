<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="flex flex-col items-center justify-center w-full">
    <div 
        class="flex flex-col items-center justify-center w-full h-screen text-xl md:text-3xl text-white font-semibold" 
        style:background-image={`url('https://cdn.rafe.dev/${data.image.key}')`}
        style:background-size="contain"
        style:background-position="center"
        style:background-repeat="no-repeat"
    >
        <p><a href="/about">rafe</a> / <a href="/photography">photography</a> / <a href="/development">development</a></p>
    </div>
</div>