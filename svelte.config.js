import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = { 
    kit: { 
        adapter: adapter(),
        experimental: {
            remoteFunctions: true,
        }, 
    },
    compilerOptions: {
        experimental: {
            async: true,
        }
    },
 };

export default config;
