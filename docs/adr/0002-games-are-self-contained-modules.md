# Games are self-contained modules under `app/games/<game>/`

Each game lives in one directory — `app/games/<game>/` — holding all of its code except its routes (which TanStack file-based routing requires under `app/routes/`). The Race is laid out as `engine/` (pure game logic), `components/` (React), `hooks/` (React), and `do/` (its Durable Object). This replaces the previous by-file-type layout (`app/lib/the-race`, `app/components/the-race`, `app/hooks`, `worker/do`) so a game reads as one unit and a second game can be added without threading new files through four shared directories.

Three properties are deliberate and would otherwise look surprising:

- **The Durable Object lives in the app tree** (`app/games/the-race/do/`), not under `worker/`, even though `wrangler.jsonc`'s `main` is `worker/server.ts`. The worker entry stays the runtime-wiring layer (the analog of routes): it re-exports the DO class — `export { TheRaceGame } from '~/games/the-race/do/the-race-game'`, which Cloudflare requires to come from the `main` module — and matches the game's WebSocket path. That single re-export is the breadcrumb from the runtime config to the game code. A game-agnostic dispatcher is deferred until a second game exists.
- **No barrel.** The old `~/lib` barrel (which meant *only* the Race engine) is gone; call sites import directly from engine source files (`../engine/liveries`, `../engine/engine`, …). This couples call sites to the engine's file layout on purpose. All shared data types stay consolidated in `engine/types.ts`, so the most common import remains one stable path.
- **Styling is a documented exception.** The Race's CSS tokens/animations in `app/styles/app.css` and its `cva` variants (`the-race-*`) baked into the shared `app/components/ui/*` primitives stay global for now. The module is therefore not fully self-contained on the styling axis — a known gap left for a later de-entanglement pass.

## Considered Options

- **Keep the Durable Object under `worker/`.** Rejected: it splits a game across the app and worker trees, the exact fragmentation this convention removes. The cost — worker-runtime code sitting in `app/` — is contained to one `do/` folder and one re-export line in the worker entry.
