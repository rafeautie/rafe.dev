import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';

// Whether the admin sidebar is open or tucked down to its icons. shadcn's
// SidebarProvider keeps the choice in this cookie; reading it here too lets
// the server draw the sidebar the way it was left, so it never jumps on load.
const SIDEBAR_COOKIE = 'sidebar_state';

const readOnServer = createServerFn().handler(() => getCookie(SIDEBAR_COOKIE) !== 'false');

export async function sidebarOpen() {
	if (typeof window === 'undefined') return readOnServer();
	return !document.cookie.split('; ').includes(`${SIDEBAR_COOKIE}=false`);
}
