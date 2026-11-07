# Civ sim: handoff

Where things stood at the end of the cloud session (Nov 7, 2026). The plan itself
lives in the Claude Doc "Civilization Sim — Plan":
https://claude.ai/artifact/EaXLQZLoHkniXhZxfJ5JYk. Delete this file once you've read it.

## What's built

- **`/civ`**: the world, people and history run in a background worker and are
  drawn on a canvas. It has speed buttons, "New world", a live chronicle, and
  click-to-follow a person with their needs, family, knowledge and memories. No
  language model is involved yet: people run on simple rules.
- **`lib/civ/world`**: a seeded 256×256 map with height, rivers, lakes, biomes and
  deposits.
- **`lib/civ/discovery`**: about 115 materials, 14 actions and 69 rules. Discovery
  is open-ended and climbs a heat ladder: fire, then cooking, pottery, the kiln
  and smelting.
- **`lib/civ/people`** and **`lib/civ/sim`**:
  - needs, choosing what to do, acting, sudden ideas (the model will hook in at
    `decideIdea` in `people/insight.ts`), births, pairing and deaths
  - leaders, named places, farming, tame herds, weather and the ecology
- **`lib/llm`** and **`/civ/bench`**: the model worker (Gemma 4 E2B/E4B through
  Transformers.js on WebGPU) with answers limited to fixed choices, a request
  queue and prompt-start reuse, plus a page that measures its speed. It has
  only been run on the CPU with a tiny stand-in model. Gemma on WebGPU is
  untested.

## Checks (all passing at handoff)

From `workspaces/web`:

```
pnpm exec vitest run --project worker app/lib/civ app/lib/llm   # 187 pass, 2 skipped (reports)
pnpm exec tsc --noEmit -p .
pnpm exec eslint app/lib/civ app/lib/llm app/components/civ
pnpm build
```

The `[vpw:warn] Could not resolve ... server-entry` lines in test output are
harmless.

## Run it

- `pnpm dev` from `workspaces/web`, then open `/civ`.
- **Speed check:** open `/civ/bench` in desktop Chrome or Edge, which have
  WebGPU. The first run downloads the model, about 1–3 GB, so it's slow. Copy
  the results back into the plan's AI budget section.
- **Pace report** (about 9 min for 8 seeds × 300 years):
  `VITE_PACE=1 pnpm exec vitest run --project worker app/lib/civ/sim/pace`.
  Optional settings: `VITE_PACE_YEARS`, `VITE_PACE_SEEDS=1,2,3`.

## Pace now vs target

Median in-game year a milestone first happened, over 8 seeds and 300 years:

| Milestone | Target | Now (median, range) | Reached |
| --- | --- | --- | --- |
| fire | ~17 | 15 (5–40) | 8/8 |
| cooking | ~50 | 25 (16–116) | 8/8 |
| first named place | ~50 | 31 (1–58) | 8/8 |
| planting | ~100 | 56 (25–119) | 8/8 |
| pottery | ~100 | 131 (25–233) | 8/8 |
| a village of 50 | ~170 | 99 (75–157) | 8/8 |
| copper | ~230 | 183 (109–257) | **2/8** |
| bronze | ~300 | – | **0/8** |
| writing | ~300 | 173 (149–226) | 7/8, too early |

Population by year (median): 23 at year 50, 47 at 100, 98 at 170, 275 at 300,
reaching the 300 limit. Causes of death: old age 68%, sickness 32%, cold 0%.

The tuning pass was cut off by a container restart before it finished. What's
left:

1. **Writing comes before copper.** Make writing deeper, for example by
   needing a settled village or a store.
2. **Copper is rare and bronze never happens.** Tin is far away on purpose, so
   people need to travel or trade, which is build step 5. Copper probably also
   needs the kiln to arrive earlier.
3. **Planting and fields come early and pottery comes late.** Swap their
   weights.
4. **Villages never split** (0/8), and the population fills the cap. Splitting
   is build step 5.

The settings to tune are named constants at the top of:

- `discovery/depth.ts` (`DEPTH_FACTOR`)
- `people/insight.ts`
- `people/life.ts` (births, sickness, carrying capacity)
- `sim/farming.ts`
- `people/places.ts`

## Next build steps (from the plan's build order)

0. Run `/civ/bench` on real hardware, then set the AI budget (calls a minute,
   E2B vs E4B).
3. Connect the model worker to `decideIdea`, then add the Plan, Talk and Name
   requests. The page side is `useMind` in `lib/llm/client.ts`.
4. Felt god: prayers, favor, whispers (free text, filtered).
5. Villages splitting, trade and raids (needed for tin and bronze).
6. History: recap, timeline, save and load.
7. Launch: a device check page ("explain and stop" if a device can't run the
   model), then remove `noindex`.

## Known issues

- The 4-bit model files fail on the CPU (WebAssembly) fallback because an
  operation (`GatherBlockQuantized`) is missing. Devices without WebGPU will
  need the 8-bit files or the "explain and stop" path.
- Prompt-start reuse checks itself when the model loads and falls back to
  reading the whole prompt each time if the check fails. Watch for the
  fallback when you run the bench.
- Commits on `claude/nice-bohr-f7wwna` include several work-in-progress
  snapshots. Squash them before merging if you want a clean history.
