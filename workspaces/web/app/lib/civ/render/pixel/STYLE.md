# Civ pixel-art style

Every sprite and tile in the civ map follows these rules, so it reads as one
piece of art. Sprites are hand-authored as text rows (`sprite.ts`).

## Scales

| Mode | Zoom (px a tile) | Art pixels | What's drawn |
| --- | --- | --- | --- |
| overview | 1.5–16, smooth | 1 px a tile | the generated terrain image only |
| map | 16–192, 1×–12× | 16 × 16 a tile | one map tile per tile; small icons for villages, herds, people |
| local | 240–960, 1×–4× | 240 × 240 a tile, 6 a metre | every tree, rock, hut, person and animal as its own sprite |

Sizes in local mode, in art pixels (people and animals are larger than life,
as in most games of this kind; scenery is roughly to scale):

- adult 14–16 tall, child 10–11, elder 14 and stooped
- deer 12–14 long, aurochs 18–20, boar 12, goat 10, wolf 13
- broadleaf tree 26–36 tall, conifer 30–40, scrub tree 16–20, bush 8–10,
  grass tuft 3–5, boulder 6–12, reeds 6–9
- tent 20–24 wide, hut 30–36, kiln 16, furnace 18, store 20, shrine stones 8–12

## Look

- Colours only from `palette.ts` (or a village cloth colour). No gradients,
  no anti-aliasing, no half-transparent pixels inside sprites.
- 2–3 shades per material: base, dark, light. Light comes from the top left.
- A 1-pixel outline in `ink` (or the material's darkest shade for soft
  things like foliage) around the outer silhouette only.
- Shadows: a flat oval of `shadow` at 35% alpha under standing things,
  drawn on the pixel grid, offset a pixel or two down-right.
- Seasons by recolouring keys (spring blossom, summer green, autumn
  gold/orange, winter bare or snow-capped), never by tinting at draw time.
- Animation: 2–4 frames, chosen from `state.now`; nothing animates faster
  than ~6 frames a second.
- Everything lands on the art grid: positions go through `snapToArt`, and
  sprites draw with `drawSprite` at `view.scale`.
