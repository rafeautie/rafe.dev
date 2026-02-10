const darkPages: string[] = [];

export const handle = async ({ event, resolve }) => {
    let theme = 'light';

    if (darkPages.some(page => event.url.pathname.startsWith(page))) {
        theme = 'dark';
    }

    return await resolve(event, {
        transformPageChunk: ({ html }) => html.replace('%theme%', theme)
    });
};