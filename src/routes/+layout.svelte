<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.png';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Rafe Autie</title>
	<meta property="og:site_name" content="Rafe Autie" />
</svelte:head>

<main>
	<Toaster position="bottom-right" richColors />
	{@render children()}
</main>
