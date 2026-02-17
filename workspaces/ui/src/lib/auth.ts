import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../auth-schema'

export const getAuth = (env: App.Platform['env']) => {
    const db = drizzle(env.AUTH_DB);
    return betterAuth({
        database: drizzleAdapter(db, {
            provider: 'sqlite',
            schema: schema,
        }),
        emailAndPassword: {
            enabled: true,
        },
    });
};