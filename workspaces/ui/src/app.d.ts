// See https://svelte.dev/docs/kit/types#app.d.ts

import type { getAuth } from "$lib/auth";

type AuthSession = Awaited<ReturnType<ReturnType<typeof getAuth>['api']['getSession']>>;

declare global {
	namespace App {
		interface Platform {
			env: Env & {
				PHOTOS: R2Bucket;
				DB: D1Database;
			};
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			session: Exclude<AuthSession, null>['session'] | null;
			user: Exclude<AuthSession, null>['user'] | null;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export { };
