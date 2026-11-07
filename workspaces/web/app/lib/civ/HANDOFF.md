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

Median in-game year a milestone first happened, over 8 seeds and 300 years
(seeds 1-8, after the second tuning pass):

| Milestone         | Target | Now (median, range) | Reached |
| ----------------- | ------ | ------------------- | ------- |
| fire              | ~17    | 11 (6-15)           | 8/8     |
| cooking           | ~50    | 59 (23-74)          | 8/8     |
| first named place | ~50    | 64 (13-112)         | 8/8     |
| planting          | ~100   | 75 (19-118)         | 8/8     |
| pottery           | ~100   | 81 (42-169)         | 8/8     |
| a village of 50   | ~170   | 130 (87-160)        | 8/8     |
| kiln              | -      | 166 (57-278)        | 8/8     |
| copper            | ~230   | 200 (124-248)       | 5/8     |
| tin smelted       | -      | 212 (168-268)       | 5/8     |
| bronze            | ~300   | 242 (229-248)       | 3/8     |
| writing           | ~300   | 205 (162-236)       | 4/8     |

Population by year (median): 22 at year 50, 36 at 100, 69 at 170, 172 at 300
(peak 176, under the 300 limit). Causes of death: old age 69%, sickness 31%.

What changed in this pass:

- **Writing** needs a seed store and a kiln in the village (`mark-clay` `needs`).
  Built things now count as "to hand" for rules (`structuresAt` in
  `people/village.ts`), so a rule can name `seed-store` or `kiln` as a need.
- **Smelting** needs a kiln (`smelt-ore` `needs`), so metal comes after the kiln.
- **Copper was rare because nobody went far enough**: a day's gathering only
  reaches about 35 tiles (the walk home at dusk and thirst turn people back),
  and copper is 28-129 tiles from the start. `people/trips.ts` adds long
  walks (copper ore for the curious, tin ore for metalworkers) from any
  distance, rare (`TRIP_CHANCE`). Tin stays far away.
- **Cooking** needs a hearth, **planting** needs a dug pit (`needs` again).
- `DEPTH_FACTOR` is gentler at depths 3-7 (it was 0.14 flat, 0.08 at 7).
- Population: base capacity 14, a full store adds at most 12, a field adds 2.3,
  births 0.002 a day with a stronger boost for tiny bands.
- Naming a place is rarer (`NAME_DAILY` halved).

What's left:

1. **Results swing a lot between seeds.** Some bands stay tiny for 100+ years
   (seeds 1, 2, 4 in earlier runs), which delays everything; medians over 8
   seeds can move by 30% for a small tweak. Use 12 seeds x 150 years to check
   the early milestones (about 3 minutes).
2. **Copper 5/8, bronze 3/8, writing 4/8**: metal and writing wait on the kiln
   (median 166, late in some seeds). Bronze lands a bit early (242).
3. Village of 50 comes a little early (130 vs 170); first named place late (64).
4. **Villages never split** (0/8). Splitting is build step 5.

Diagnostics: `sim/geo.diag.test.ts` (`VITE_GEO=1`, and `VITE_GEO_PLAY=1,2,3`
for the metals chain) prints how far each deposit is from the start. Add
`--disableConsoleIntercept` to see `console.log` output from any of these.

The settings to tune are named constants at the top of:

- `discovery/depth.ts` (`DEPTH_FACTOR`)
- `people/insight.ts`
- `people/life.ts` (births, sickness, carrying capacity)
- `sim/farming.ts`
- `people/places.ts`

## Next build steps (from the plan's build order)

0. Run `/civ/bench` on real hardware, then set the AI budget (calls a minute,
   E2B vs E4B).
1. Connect the model worker to `decideIdea`, then add the Plan, Talk and Name
   requests. The page side is `useMind` in `lib/llm/client.ts`.
2. Felt god: prayers, favor, whispers (free text, filtered).
3. Villages splitting, trade and raids (needed for tin and bronze).
4. History: recap, timeline, save and load.
5. Launch: a device check page ("explain and stop" if a device can't run the
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
