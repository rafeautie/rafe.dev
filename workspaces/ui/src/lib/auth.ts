import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../schemas/auth-schema'
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { redirect } from "@sveltejs/kit";

export const getAuth = (env: App.Platform['env']) => {
    const db = drizzle(env.DB);
    return betterAuth({
        database: drizzleAdapter(db, {
            provider: 'sqlite',
            schema: schema,
        }),
        emailAndPassword: {
            enabled: true,
        },
        plugins: [
            sveltekitCookies(getRequestEvent)
        ]
    });
};

export const tryRedirectToLogin = (locals: App.Locals, url: URL) => {
    if (!locals.user) {
        throw redirect(302, `/login?returnTo=${encodeURIComponent(url.pathname)}`);
    }
}

export const tryRedirectToHome = (locals: App.Locals, url: URL) => {
    if (locals.user) {
        const returnTo = url.searchParams.get('returnTo');
        throw redirect(302, returnTo ? decodeURIComponent(returnTo) : `/`);
    }
}