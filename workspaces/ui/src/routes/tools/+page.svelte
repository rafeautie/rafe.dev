<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import MenuBar from './menu-bar.svelte';
	const session = authClient.useSession();
</script>

<div class="space-y-5 p-5">
	<p class="text-2xl font-medium">Tools</p>
	<MenuBar />
</div>
