# `applyAction` returns the events it emits

`applyAction` returns `{ state, events }` — the next game state and the ordered `RaceEvent`s that the transition produced — rather than the state alone. The engine builds each event at the moment it makes the change, so the `RaceEvent` channel (the single source for both the game log and the animation choreography) has exactly one producer: the engine.

Previously the Durable Object reconstructed events after each call by inspecting state before and after `applyAction`. It captured a card before a `DISCARD` (the card has moved to the discard pile afterwards), read the new position after an `EXTEND`, stashed the previous qualifying cards and re-sorted the grid on `QUALIFY`, and read a resolved challenge back off `GameState.lastChallenge` — an event smuggled through state, set inside `applyAction` and cleared at the top of the next call. The knowledge of what happened already existed inside `applyAction`; the old interface threw it away and forced every caller to re-derive it.

Returning events from the engine removes `GameState.lastChallenge` (and its clear-on-entry ritual) entirely, shrinks the persisted snapshot, and makes event production a pure, unit-testable property asserted directly in `engine.test.ts` instead of only being reachable through the WebSocket DO test. The Durable Object becomes pure transport: apply, persist, append to the log, broadcast.

This complements ADR-0001: stats remain accumulated counters on state (the per-driver truth for the whole race); events remain the transient "what changed" channel. This decision changes only who *produces* the events — the engine, not the DO.

## Considered Options

- **Keep `applyAction` returning state; derive events in the DO.** Rejected: the status quo. It splits "what happened" across the engine (`lastChallenge`) and four DO cases, and the derivation is only testable through a WebSocket.
- **A dual entry point: a new `step(state, action): { state, events }` with `applyAction` kept as a thin `.state` wrapper.** Rejected: zero test churn, but two doors into the engine is a shallower interface than one — it preserves the very split this change removes.
- **Carry events as a non-persisted field on the returned state.** Rejected: pollutes `GameState` with a transient field — the same mistake `lastChallenge` was.
