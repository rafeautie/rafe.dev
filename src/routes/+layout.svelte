<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.png';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Rafe Autie</title>
	<meta property="og:site_name" content="Rafe Autie" />
</svelte:head>
{@render children()}
