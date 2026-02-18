import type { PageServerLoad } from "../$types";
import { tryRedirectToLogin } from "$lib/auth";

export const load: PageServerLoad = async ({ locals, url }) => {
    tryRedirectToLogin(locals, url);

    return {
        user: locals.user,
    };
};
