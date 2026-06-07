# `engine/` splits into `cards`, `rules`, and the state machine

The Race engine is laid out as three concerns, each in its own module:

- **`cards.ts`** — card vocabulary: `createDeck`, `shuffleDeck`, the card-kind predicates (`isExtendCard`, `isDraftingCard`, `isRedline`), and `effectiveValue`. What a card *is* and what it is worth.
- **`rules.ts`** — game rules over cards and positions: `resolveChallenge`, `computeScores`, `buildStartingGrid`, and the `POINTS` table.
- **`engine.ts`** — the state machine: `applyAction`, `createGame`, and the private state helpers.

`legalMoves.ts` (the shared extend/turn predicates) imports `cards.ts` like the other two.

This replaces a single `engine.ts` that held all three. The trigger was a circular dependency: `engine.ts` imported `canExtendWithCard` from `legalMoves.ts`, while `legalMoves.ts` needed `isExtendCard`/`isDraftingCard` from `engine.ts` — so it could not import back and duplicated the predicates inline, leaving two definitions of the same rule free to drift. Extracting `cards.ts` as a leaf that both modules depend on breaks the cycle and removes the duplicate.

`resolveChallenge` lands in `rules.ts`, not `cards.ts`: it is the rule for who wins a Challenge, and card-comparison is only its mechanism — it belongs beside the other rules (scoring, grid), not with the card vocabulary. With that, every module's name describes its contents: `cards` is vocabulary, `rules` is rules, `engine` is the state machine.

This refines ADR-0002 (games are self-contained modules) with the intra-`engine` layering. Imports remain direct to source files — no barrel — so call sites point at `cards`, `rules`, or `engine` as needed.

## Considered Options

- **One `cards.ts` leaf holding everything that is not the state machine** (deck, kinds, `effectiveValue`, `resolveChallenge`, `computeScores`, `buildStartingGrid`). Rejected: fewest files, but the name `cards.ts` would also cover scoring and grid layout — a name promising less than the file delivers, the kind of shallow naming the split exists to remove.
- **Extract `cards.ts` but leave `computeScores`/`buildStartingGrid` in `engine.ts`.** Rejected: `engine.ts` stays a grab-bag of state machine plus scoring, and `resolveChallenge` would sit in `cards` while the sibling scoring rules sit elsewhere — an inconsistent seam.
- **Minimal fix: extract only the card-kind predicates to break the cycle.** Rejected: solves the import cycle but leaves the larger mixing of vocabulary, rules, and state machine in one file.
