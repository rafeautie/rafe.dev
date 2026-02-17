<script lang="ts">
	import { authClient } from '$lib/auth-client';
	const session = authClient.useSession();
</script>

<p>
	{$session.data?.user?.email}
</p>
