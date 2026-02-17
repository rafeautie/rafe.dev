import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './auth-schema.ts',
    out: './migrations',
    dialect: 'sqlite',
    driver: 'd1-http',
    dbCredentials: {
        // @ts-ignore
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        // @ts-ignore
        databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
        // @ts-ignore
        token: process.env.CLOUDFLARE_D1_TOKEN!,
    },
});
