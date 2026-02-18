<script lang="ts" module>
	import { z } from 'zod/v4';

	const formSchema = z.object({
		email: z.string().email(),
		password: z.string().min(8)
	});
</script>

<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { page } from '$app/state';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index';
	import * as Form from '$lib/components/ui/form/index';
	import { Input } from '$lib/components/ui/input/index';
	import { authClient } from '$lib/auth-client';
	import { resolve } from '$app/paths';

	const returnTo = page.url.searchParams.get('returnTo');

	let signUpUrl = $derived.by(() => {
		const url = new URL(resolve('/signup'), page.url);

		if (returnTo) {
			url.searchParams.set('returnTo', returnTo);
		}

		return url.toString();
	});

	const form = superForm(defaults(zod4(formSchema)), {
		validators: zod4(formSchema),
		SPA: true,
		onSubmit: async ({ formData }) => {
			const { error } = await authClient.signIn.email({
				email: formData.get('email')?.toString() ?? '',
				password: formData.get('password')?.toString() ?? '',
				rememberMe: true,
				callbackURL: returnTo ?? '/'
			});

			if (error) {
				toast.error(`Login Failed`, {
					description: error.message
				});
			} else {
				toast.success(`You logged in successfully!`);
			}
		}
	});

	const { form: formData, enhance } = form;
</script>

<Card.Root class="mx-auto w-full max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Login</Card.Title>
		<Card.Description>Enter your email below to login to your account</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" class="space-y-6" use:enhance>
			<Form.Field {form} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Email</Form.Label>
						<Input {...props} bind:value={$formData.email} type="email" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="password">
				<Form.Control>
					{#snippet children({ props })}
						<div class="flex items-center">
							<Form.Label>Password</Form.Label>
							<!-- <a href="##" class="ms-auto inline-block text-sm underline">Forgot your password?</a> -->
						</div>
						<Input {...props} bind:value={$formData.password} type="password" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<div class="space-y-2">
				<Form.Button class="w-full">Login</Form.Button>
				<p class="text-center text-sm text-muted-foreground">
					Don't have an account? <a class="underline" href={signUpUrl}>Sign up</a>
				</p>
			</div>
		</form>
	</Card.Content>
</Card.Root>
