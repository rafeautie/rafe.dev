<script lang="ts" module>
	import { z } from 'zod/v4';

	const formSchema = z
		.object({
			name: z.string().min(2).max(100),
			email: z.email(),
			password: z.string().min(8),
			confirmPassword: z.string().min(8)
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: 'Passwords do not match.',
			path: ['confirmPassword']
		});
</script>

<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import { toast } from 'svelte-sonner';
	import * as Form from '$lib/components/ui/form/index';
	import { Input } from '$lib/components/ui/input/index';
	import * as Card from '$lib/components/ui/card/index';
	import { authClient } from '$lib/auth-client';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const returnTo = page.url.searchParams.get('returnTo');

	let loginUrl = $derived.by(() => {
		const url = new URL(resolve('/login'), page.url);
		if (returnTo) {
			url.searchParams.set('returnTo', returnTo);
		}
		return url.toString();
	});

	const form = superForm(defaults(zod4(formSchema)), {
		validators: zod4(formSchema),
		SPA: true,
		onSubmit: async ({ formData }) => {
			const { error } = await authClient.signUp.email({
				email: formData.get('email')?.toString() ?? '',
				password: formData.get('password')?.toString() ?? '',
				name: formData.get('name')?.toString() ?? '',
				callbackURL: returnTo ?? '/'
			});

			if (error) {
				toast.error(`Sign Up Failed`, {
					description: error.message
				});
			}
		}
	});

	const { form: formData, enhance } = form;
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Create an account</Card.Title>
		<Card.Description>Enter your information below to create your account</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" class="space-y-6" use:enhance>
			<Form.Field {form} name="name">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Full Name</Form.Label>
						<Input {...props} bind:value={$formData.name} placeholder="John Doe" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Email</Form.Label>
						<Input
							{...props}
							bind:value={$formData.email}
							type="email"
							placeholder="m@example.com"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Password</Form.Label>
						<Input {...props} bind:value={$formData.password} type="password" />
					{/snippet}
				</Form.Control>
				<Form.Description>Must be at least 8 characters long.</Form.Description>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="confirmPassword">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Confirm Password</Form.Label>
						<Input {...props} bind:value={$formData.confirmPassword} type="password" />
					{/snippet}
				</Form.Control>
				<Form.Description>Please confirm your password.</Form.Description>
				<Form.FieldErrors />
			</Form.Field>
			<div class="space-y-2">
				<Form.Button class="w-full">Create Account</Form.Button>
				<p class="px-6 text-center text-sm text-muted-foreground">
					<a class="underline" href={loginUrl}>Sign in</a>
				</p>
			</div>
		</form>
	</Card.Content>
</Card.Root>
