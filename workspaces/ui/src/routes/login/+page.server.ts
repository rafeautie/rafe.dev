import type { PageServerLoad } from "../$types";
import { tryRedirectToHome } from "$lib/auth";

export const load: PageServerLoad = async ({ locals, url }) => {
    tryRedirectToHome(locals, url);
};
