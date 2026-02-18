import { getAuth } from "$lib/auth"; // path to your auth file
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from '$app/environment'
import { sequence } from "@sveltejs/kit/hooks";
import type { Handle } from "@sveltejs/kit";

const darkPages: string[] = [
    // "/login",
    // "/signup",
];

export const themeHandle: Handle = async ({ event, resolve }) => {
    let theme = 'light';

    if (darkPages.some(page => event.url.pathname.startsWith(page))) {
        theme = 'dark';
    }

    return await resolve(event, {
        transformPageChunk: ({ html }) => html.replace('%theme%', theme)
    });
}

export const authHandle: Handle = async ({ event, resolve }) => {
    if (!event.platform?.env) {
        return resolve(event);
    }

    const auth = getAuth(event.platform.env);
    const session = await auth.api.getSession({
        headers: event.request.headers,
    });

    event.locals.session = session?.session ?? null;
    event.locals.user = session?.user ?? null;

    return svelteKitHandler({
        event,
        resolve,
        auth,
        building
    })
};

export const handle = sequence(themeHandle, authHandle);