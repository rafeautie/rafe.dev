# Race stats are accumulated in game state, not derived from the event log

The results screen surfaces per-driver race stats (overtakes, defenses, and places gained from the starting grid). The event log is capped at the last 50 events (`MAX_LOG` in the Durable Object), so it cannot reliably reconstruct whole-game stats — a long race has already dropped its early events. Instead, the engine accumulates these as counter fields on each `Car`, incremented inside `applyAction` at the moment a challenge resolves, plus a one-time snapshot of each car's starting grid position taken when the race begins. The stats are surfaced to the client through `toPublicState`.

This keeps the event log's role (the last-N history that drives the log panel and animation) separate from cumulative stats (the per-driver truth for the whole race), and makes the stats deterministic and unit-testable in `engine.test.ts`.

## Considered Options

- **Raise or remove `MAX_LOG` and derive stats from the full log at results time.** Rejected: bloats persisted DO state for every game and pushes derivation logic onto the client. The cap exists deliberately.
- **A separate stats aggregate maintained in the DO, outside the engine state.** Rejected: splits the source of truth — the engine would mutate positions while a second mechanism watched and tallied.
