# GitHub Copilot Instructions for rafe.dev

## Architecture Overview

This project is a monorepo-style setup for a personal engineering site and a real-time multiplayer game ("Race").

- **Main Application**:
  - **Framework**: React 19 with TanStack Start (SSR) and TanStack Router.
  - **Styling**: Tailwind CSS v4, `tw-animate-css`, and Motion One.
  - **Deployment**: Cloudflare Workers via `@tanstack/react-start/server-entry`.
  - **State**: Server functions (`createServerFn`) persist UI state (theme, sidebar) to cookies.

- **Race Game Service** (`src/race/worker`):
  - **Runtime**: Cloudflare Worker with Durable Objects (`WebSocketHibernationServer`).
  - **Logic**: `xstate` state machine (`gameStateMachine`) manages game rules and turns.
  - **Communication**: WebSockets for real-time bidirectional updates.
  - **Persistence**: Durable Object storage persists game snapshots.

## Critical Workflows

- **Development**:
  - Main App: `npm run dev` (Port 3000)
  - Race Server: `npm run dev:race-server` (Must run separately for game features)
  - **Note**: Ensure `npm run cf-typegen` is run after changing worker bindings.

- **Deployment**:
  - Main App: `npm run deploy` (Uses `wrangler.json`)
  - Race Server: `npm run deploy:race-server` (Uses `src/race/worker/wrangler.json`)

## Project Conventions

### Component Architecture
- **UI Library**: Shadcn UI components live in `src/components/ui`.
- **Motion**: Use `motion/react` for complex animations.
- **Icons**: `lucide-react` is the standard icon set.

### State Management
- **Global UI State**: React Context + `createServerFn` (Cookies) for preferences (e.g., `theme.ts`, `sidebar.ts`).
- **Game Client State**: TanStack Store (`@tanstack/react-store`) manages local game state (`raceStore` in `src/race/client/state.ts`).
- **Server State**: TanStack Query (`@tanstack/react-query`) for data fetching.
- **Game Logic**:
  - **Strict Separation**: Game logic resides in `src/race/worker/game-state-machine.ts`.
  - **Frontend**: `src/race/client` components only render state and dispatch events.
  - **Protocol**: Define new game messages in `src/race/messages.ts` and types in `src/race/types.ts`.

### Routing
- **File-Based**: Routes are defined in `src/routes`.
- **Race Routes**: `src/routes/race/$roomId.tsx` handles the game room connection.

### Forms
- Use `react-hook-form` with `zod` validation.
- Example: `src/components/contact-form.tsx`.

## Key Files & Directories

- `src/routes/__root.tsx`: Root layout and provider setup.
- `src/race/worker/durable-object.ts`: WebSocket handling and Durable Object implementation.
- `src/race/worker/game-state-machine.ts`: Core game logic (XState).
- `src/lib/utils.ts`: Shared utility functions (cn, etc.).
- `wrangler.json`: Main app Cloudflare config.
- `src/race/worker/wrangler.json`: Race worker Cloudflare config.
