import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        adapter: adapter(),
        experimental: {
            remoteFunctions: true,
        },
        alias: {
            "@/*": "./path/to/lib/*",
        },
    },
    compilerOptions: {
        experimental: {
            async: true,
        }
    },
};

export default config;
