# /race tracks: handoff

Branch `claude/race-tracks-wip`. It holds the framework, the three ovals, Monza and the general pieces below. Spa, Watkins Glen, Silverstone and the Daytona road course are not on it: one session each builds them from here, each in its own file.

## The user's direction

- **Real scale.** Every track, oval and road course, is 1:1 with the real one: its real-world length and width in metres. Monza, for example, is about 5.8 km a lap, so a Monza drawn into a 240 m world (as on this branch, see below) is not real scale.
- **Everything to scale.** Cars, the pit lane and its boxes, side and slip roads, the pit crew, the tow trucks and the truck yard are all at true scale too.
- **Per-track world and camera.** Each track gets its own world size, camera and follow-view bounds that work at that size. The framework session (the one that wrote this) owns that and the ovals and Monza; it is not done yet, see "Framework work still to do".
- **Pit lanes where the real ones are.** Real entry, real pit straight, real exit. Where a real pit straight is too short for 8 boxes and the truck yard, the boxes and yard carry on past the next corner (box rows, `yard`; see below).
- **No driving tuning.** Track sessions don't change grip, speed, AI or the racing-line code. Geometry and data checks must pass. If at real scale races don't finish, cautions don't clear or cars leave the tarmac, report it in the PR rather than tuning around it; driving gets tuned separately later.
- **Track PRs target `claude/race-tracks-wip`, not `main`.** It is the integration branch for the whole tracks change, and it goes to `main` as one PR at the end. Branch from it, open your PR against it, and don't push to it directly.
- Don't merge anything; the orchestrator merges into `claude/race-tracks-wip`.

## How a track is defined

A track is a file `workspaces/web/app/lib/race/tracks/<id>.ts`. Its file name is its id. It exports:

- `layout: Layout` (type in `tracks/layout.ts`):
  - `name`, `kind` (`'oval'` or `'road'`).
  - `world`: the world's width in metres (always 16:9). At real scale this is a few hundred metres for Martinsville and a few kilometres for Spa.
  - `control`: centre-line control points in metres from the world's top left, driven in order, closed. The first point is the start line, with at least 6 + 6.5 × 7 m of near-straight road behind it for the grid (racing-line radius over 30 m). Either direction works; the infield is whichever side the track turns towards overall (`track.hand`).
  - `banking?`: `[fromControl, toControl, degrees]` for banked stretches (ovals).
  - `restart?`: a sample where the green is given after a caution, if not at the line. Laps and the finish still count at the line. Use it where the real start line has a corner right after it (Spa: on the Kemmel).
  - `pits`: samples counted from the start line, wrapping round:
    - `from`, the way in leaving the track; `slip`, how long the way in is.
    - `boxes`: the sample of the first box, or rows `[[firstSample, count], ...]` with the lane running on round a bend between rows.
    - `yard?`: puts the two tow trucks' stands at that sample past a bend, instead of straight after the last box.
    - `away?: [leave, join]`: where the way out leaves the lane, and where it joins the track. `leave` must come after the lane's end (`out0` in `pitsFor`); otherwise it wraps a whole lap.
    - `thirst`: fuel per metre relative to the others; tune it so there are fuel-only and fuel-plus-tyres stops and nobody runs dry.
- `checks: Checks`: what the tests race on it:
  - `wreck`: a seed that loses one car early (sim.test).
  - `clean`: a seed with nobody in trouble when a caution is thrown by hand (sim.test).
  - `behind`: two wrecks on a straight, in metres on from where the pits' way out joins and across, and when the second happens (recovery.test).

To register a track, add one import and one line to `LAYOUTS` in `app/lib/race/tracks.ts`. Then run `node scripts/race-lines.mjs <id>`, which writes `app/lib/race/lines/<id>.json`, the racing line in centimetres. Rerun it after every change to the shape, including turning the control list to move the start: the cache is only rebuilt automatically when the lap length changes, so a stale one silently gives wrong bends to every check.

Test data is gathered from the track files by name (`tracks/checks.ts`), so a new track touches only its own file, its lines file and one line of `tracks.ts`.

## Checks every track must pass

Run `npx vitest run app/lib/race` in `workspaces/web`; `-t <id>` narrows to one track. Tests run in workerd, whose floating point differs from node: seeds or tunings picked in node can behave differently there, so confirm in vitest.

- **tracks.test:** the world is 16:9 and in-bounds with walls; recordings keep positions to at least 1/16 m (`placing`, see below); no centre-line radius under 8.4 m; other stretches far enough apart; a straight behind the line for the grid; the pits and yard clear of every other stretch; laps and recording size.
- **line.test:** the cached racing line is current, quicker than the alternatives, and takes each corner of 45° or more outside–inside–outside.
- **pits.test:**
  - a box for every car (8), clear of the next, on near-straight lane (radius over 50 m), with the stands over 45 m;
  - stops happen and are all valid; no sliding, no tyre off the paving;
  - the lane limit is kept;
  - the entry and exit speed shares: entry against the slower of track pace and the fastest a car may leave the track (`entering`); median over 0.85, 15th percentile over 0.75;
  - stops are also made under caution, and never once the field is lining up;
  - two cars in the lane at once.
- **recovery.test:** the trucks fetch wrecks round the lap, at and just past the pit exit's join (−15, 4, 8 and 15 m), back up to a wreck just behind one they lifted (`behind`), share wrecks, and park in the yard.
- **sim.test:**
  - wheels on the tarmac;
  - the pit-lane line (`ring`) clears the walls and is steerable where the lane and trucks use it (from the way in's end to where the way out leaves);
  - cautions with the `wreck` and `clean` seeds: the wreck is fetched before the green, lineup two by two, pace at the green, restarts always go green;
  - races reach a result over 100 seeds and with the largest field.
- **Sweeps:** 100 seeds × 3, 6 and 8 cars. The harness is in the shared notes folder: `famous-tracks/sweep/run.sh <label> <ids>`, with `summary.mjs` for the table. All races should finish with none capped, no cautions open at the end and nobody dry; report best and median lap times.

## Framework work still to do (framework session, not track sessions)

- Real scale for the constants that are not yet real: road width (`HALF_ROAD` 4.5 m), the pit-lane line's offset (`RING` 10 m), box and stand sizes, the car and truck outlines, the crew. All of them still date from the first, smaller tracks.
- Per-track camera and follow-view bounds. Today a world is drawn whole in one 640×360 frame, which at real scale would make cars a pixel or two.
- The three ovals and Monza redrawn at real scale.
- Recordings: x and y are stored in 16 bits as metres × `placing(track)`. That is 256 per metre in worlds under 256 m, so old recordings still play; in bigger worlds it is as fine as fits, about 21 per metre for a 3 km world.

## What is on this branch that is new (all tracks)

- Base `oval` and `circuit` removed.
  - New races default to Daytona.
  - Saved settings naming a removed track fall back to the default.
  - The room won't send or replay a stored recording whose track is gone; one packed before tracks were named is not played.
- Pit box rows and a yard past a bend (`boxes`, `yard`).
- Per-track `restart` point.
- `entering(lane, rules)`, and the pit-entry check that uses it.
- The pit-lane line checked only where it is used (from the way in's end to where the way out leaves); a hairpin elsewhere may pinch it.
- The restart pace check now runs until the leader brakes for the first corner, or 3 s, whichever comes first. Each row must gain 2 m/s × (time / 3 s).
- Restarts: the leader eases back while the lineup is strung out behind it, and the green comes only when it has closed up (from #120).
- A car shoving a moving wreck at an angle counts as stuck and backs off.
- The way into the pits is paved 3 m short of where it leaves the track.
- Per-track racing-line files (`lines/<id>.json`) and per-track test data (`checks`).

## Monza on this branch

Monza is traced 1:1 in shape from the real outline, but in a 240 m world, about 1/10 scale, not real scale. All its tests pass at that size. The framework session will redraw it at real scale.

## The four road courses

Drafts at about 1/10 scale exist on the local branch `claude/race-silverstone-daytona` (same repo; not pushed, not merged here). The shapes may be worth comparing against; the numbers won't carry over to real scale.

Learned along the way:

- **Real outlines:** GeoJSON from bacinger/f1-circuits, copied to the shared notes `famous-tracks/geo`: `be-1925` Spa, `gb-1948` Silverstone, `us-1956` Watkins Glen. They are already in race direction and clockwise; check with the tools' `dir`. There is no Daytona road course file: find a source (OpenStreetMap) or build it on the Daytona oval.
- **Tools:** in the shared notes `famous-tracks/tools` (README there).
  - `realfit2.mjs` / `realrelax.mjs` turn an outline into control points.
  - `probe.mjs`, `bends.mjs`, `spots.mjs` and `ring.mjs` check pit placement.
  - `seedprobe.test.ts` finds seeds in workerd.
  - `pitgrid` in the sweep folder scores pit placements fast.
- **Real scale:**
  - These problems came from shrinking tracks to 1/10. At real size the tightest corners and the gaps between stretches are about ten times bigger relative to the road, so most of them should go away, provided the road and pit constants are also real.
  - Re-check them anyway: narrow V hairpins (La Source, Rivage, Silverstone's Loop) collapsing; the pit-lane line pinching inside hairpins; boxes or the yard landing near another stretch.
- **Pit placement:**
  - Box samples are along the box line, so they bunch on bends.
  - `away[0]` must come after the lane end, or it wraps a lap.
  - A pit exit joining just after a tight corner fails the trucks' "−15 m from the join" test: trucks won't reverse round a bend to a wreck there. Join on a straight.
  - Fast real pit entries were the reason the entry check now uses `entering`.
- **Restarts:** a real start line with a corner soon after it (Spa: La Source about 45 m on at 1/10) fails the lineup and pace checks. Use `restart` on a long straight, as the user chose for Spa.
- **Seeds:** pick in workerd (`seedprobe.test.ts`); every geometry change moves them.

### Spa-Francorchamps

At 1/10 in a 240 m world:

- La Source and Rivage needed hand-drawn r13 hairpins.
- Pouhon was nudged about 5 m to clear the pit infield.
- The boxes ran from the last right-hander before the Bus Stop, along the start straight, with the yard just before La Source and the exit down the inside of La Source onto the run to Eau Rouge.
- Green after cautions on the Kemmel (`restart`).
- Seeds wreck 6, clean 4.
- Still failing: the racing line into Rivage (wide-entry check) and a tow truck 0.24 m off the tarmac at the start of the Eau Rouge run.

Next: redo at real scale. The real pit lane runs from before the Bus Stop along the start straight and exits down the inside of La Source.

### Watkins Glen

At 1/10:

- The real outline fit was fine, with no narrow hairpins.
- The front straight is about 92 m at 1/10, so the yard had to go past T1 (`yard`).
- The last corner (T11) is a long fast sweep, so entries inside it either never happened or were too fast.
- The pit placement tried (from 600, boxes 622, yard 82, away [128, 140]) broke races in the sweep: no winners, cautions left open. Untested beyond that.

Next: real scale. The pit entry is inside the last corner, the lane runs along the front straight, and the exit joins at the Esses after T1.

### Silverstone

At 1/10, the outline fit lost the Luffield loop and the Loop at Village; they need drawing back as arcs. In the earlier stretched draft:

- the Hamilton straight needed lengthening to fit the pits;
- Abbey just after the line hurt restarts;
- a pit exit joining in Abbey or Village failed the trucks' −15 m test, and joining out of the Loop at the start of the Wellington straight passed it.

Next: real scale. The pits are on the Hamilton straight between Club and Abbey: entry inside Club, exit after Abbey.

### Daytona road course

Not started. There is no outline file. Build it on the Daytona oval at real scale: tri-oval, the infield section and the Bus Stop chicane on the back straight. The pits are on the tri-oval front stretch, as on the oval.
