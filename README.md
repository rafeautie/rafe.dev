# rafe.dev

Marketing site and engineering services landing page for rafe.dev, built on TanStack React Start and deployed to Cloudflare Workers. The app showcases service offerings, a motion-enhanced hero, and a contact form powered by Web3Forms.

## Features
- SSR-ready routing with `@tanstack/react-router` and `@tanstack/react-start`
- Cloudflare Worker deployment via Wrangler and the Cloudflare Vite plugin
- Tailwind CSS v4 with custom themes and dark mode persisted through server functions
- Inset sidebar layout with motion-driven header typography and Lucide icons
- Contact form with `react-hook-form`, Zod validation, optimistic UI feedback, and Sonner toasts
- Built-in TanStack Devtools overlays for router, query, and general inspection

## Tech Stack
- React 19 with Server Components enabled through TanStack React Start
- Vite 7 with TypeScript, `vite-tsconfig-paths`, and React Fast Refresh
- Tailwind CSS v4, `tw-animate-css`, and Motion One for styling and animations
- TanStack Query for data mutations and caching
- Cloudflare Workers runtime with Wrangler for production deployments

## Prerequisites
- Node.js 20+
- npm 10+ (a `package-lock.json` is committed; switch tools only if you regenerate the lockfile)
- Wrangler CLI (`npm install -g wrangler`) for Cloudflare deployments

## Quick Start
1. Install dependencies: `npm install`
2. Start the dev server: `npm run dev`
3. Open `http://localhost:3000`
4. Toggle the sidebar trigger or theme (devtools tray ➜ Theme) to confirm server-driven UI state works

## Available Scripts
- `npm run dev` – start Vite in development mode on port 3000
- `npm run build` – create a production bundle with SSR entrypoints
- `npm run serve` – preview the built bundle locally
- `npm run test` – execute the Vitest suite (jsdom environment)
- `npm run lint` – run the flat ESLint config
- `npm run format` – check formatting with Prettier (no write)
- `npm run check` – format + lint with autofix applied
- `npm run deploy` – deploy the SSR bundle with Wrangler

## Project Structure
```text
src/
	routes/           Route components registered via TanStack file-based routing
	components/       UI primitives (sidebar, cards, forms, motion text, etc.)
	hooks/            React Query mutations and device helpers
	integrations/     TanStack Query provider and devtools wiring
	lib/              Server functions for theme + sidebar state and shared utils
	styles.css        Tailwind, theme tokens, and global styles
public/             Manifest, robots, and static assets
```

## Styling & Theming
- Tailwind v4 utilities are composed in `src/styles.css`
- Theme tokens are shared across light/dark modes with CSS custom properties
- `ThemeProvider` wraps the app and persists selections via TanStack server functions + cookies
- Sidebar open state is also persisted through server functions in `src/lib/sidebar.ts`

## Contact Form Integration
- `src/components/contact-form.tsx` validates input with Zod and `react-hook-form`
- `use-contact-form-mutation.ts` posts to Web3Forms (`https://api.web3forms.com/submit`)
- Replace the hardcoded `access_key` with an environment-specific secret before going live
- Toast notifications surface success and failure states without leaving the page

## Deployment
- Ensure you are authenticated with Cloudflare: `wrangler login`
- Build and deploy: `npm run deploy`
- Default Wrangler configuration lives in `wrangler.json` and targets `@tanstack/react-start/server-entry`
- Set any required environment variables through Wrangler (`wrangler secret put`)

## Devtools
- TanStack Devtools are enabled in production builds but hidden behind a floating toggle
- Open the tray to inspect router matches, React Query cache, and general TanStack diagnostics
- Disable the devtools plugin in `src/routes/__root.tsx` if you need a cleaner production build

