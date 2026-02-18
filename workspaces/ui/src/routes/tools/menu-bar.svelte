<script>
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import * as Menubar from '$lib/components/ui/menubar';

	const signOut = async () => {
		await authClient.signOut();
		goto(resolve('/login'));
	};
</script>

<Menubar.Root>
	<Menubar.Menu>
		<Menubar.Trigger>File</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.Sub>
				<Menubar.SubTrigger>New</Menubar.SubTrigger>
				<Menubar.SubContent>
					<Menubar.Item>Time Entry</Menubar.Item>
				</Menubar.SubContent>
			</Menubar.Sub>
		</Menubar.Content>
	</Menubar.Menu>
	<Menubar.Menu>
		<Menubar.Trigger>View</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.CheckboxItem>Show Amounts</Menubar.CheckboxItem>
		</Menubar.Content>
	</Menubar.Menu>
	<Menubar.Menu>
		<Menubar.Trigger>User</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.Item variant="destructive" onclick={signOut}>Sign Out</Menubar.Item>
		</Menubar.Content>
	</Menubar.Menu>
</Menubar.Root>
