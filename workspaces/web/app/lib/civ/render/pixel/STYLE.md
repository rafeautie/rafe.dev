# Civ pixel-art style

Every sprite and tile in the civ map follows these rules, so it reads as one
piece of art. Sprites are hand-authored as text rows (`sprite.ts`).

## Projection

Map and local modes are **isometric** (`iso.ts`): 2:1 diamond tiles seen
from one fixed side (no rotation), with land raised in steps by height.
The far overview stays a flat top-down minimap.

- A tile is a diamond `2 × artPerTile` wide and `artPerTile` tall: 32 × 16
  art px on the map, 480 × 240 close up. Its top corner is the tile's
  (x, y) corner; +x runs down-right on screen, +y down-left.
- Height: water is level 0, land levels 1–8. Each level lifts the ground
  `MAP_LIFT` (4) art px on the map, `LOCAL_LIFT` (24) close up. Where a tile
  is higher than the neighbour in front of it (+x or +y), its front faces
  show as a cliff down to that neighbour's level.
- Draw order: by depth `x + y` (`depthOf`); a ground tile's depth is its
  back corner, so it draws before anything standing on it. Use `snapToArt`
  for every position: it projects, lifts by the tile's level and snaps to
  the art grid.
- Light comes from the top left: of a tile's two visible cliff faces, the
  left (+y) face is lighter, the right (+x) face darker.

## Scales

| Mode     | Zoom (px a half-tile) | Art pixels                    | What's drawn                                                   |
| -------- | --------------------- | ----------------------------- | -------------------------------------------------------------- |
| overview | 1.5–16, smooth        | 1 px a tile, top-down         | the generated terrain image only                               |
| map      | 16–96, 1×–6×          | 32 × 16 diamond a tile        | one iso map tile per tile; small icons for villages and people |
| local    | 240–960, 1×–4×        | 480 × 240 diamond, ~6 a metre | every tree, rock, hut, person and animal as its own sprite     |

Sizes in local mode, in art pixels (people and animals are larger than life,
as in most games of this kind; scenery is roughly to scale):

- adult 14–16 tall, child 10–11, elder 14 and stooped
- deer 12–14 long, aurochs 18–20, boar 12, goat 10, wolf 13
- broadleaf tree 26–36 tall, conifer 30–40, scrub tree 16–20, bush 8–10,
  grass tuft 3–5, boulder 6–12, reeds 6–9
- tent 20–24 wide, hut 30–36, kiln 16, furnace 18, store 20, shrine stones 8–12

Standing sprites are drawn front-on (a 3/4 view), which is how they read in
isometric. Things with a footprint on the ground (fields, pens, paths, hut
floors, shadows) are drawn as diamonds or along the diamond axes.

## Look

- Colours only from `palette.ts` (or a village cloth colour). No gradients,
  no anti-aliasing, no half-transparent pixels inside sprites.
- 2–3 shades per material: base, dark, light. Light comes from the top left.
- A 1-pixel outline in `ink` (or the material's darkest shade for soft
  things like foliage) around the outer silhouette only.
- Diamond edges use the classic 2-across-1-down pixel stair, never smooth
  lines.
- Shadows: a flat 2:1 oval of `shadow` at 35% alpha under standing things,
  on the pixel grid, offset a pixel or two down-right.
- Seasons by recolouring keys (spring blossom, summer green, autumn
  gold/orange, winter bare or snow-capped), never by tinting at draw time.
- Animation: 2–4 frames, chosen from `state.now`; nothing animates faster
  than ~6 frames a second.
- Everything lands on the art grid: positions go through `snapToArt`, and
  sprites draw with `drawSprite` at `view.scale`.
