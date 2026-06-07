# The Season is accrued in game state as a per-Race fact table

A **Season** (a fixed sequence of Races played in one room) is held on the engine's
`GameState` as a per-Race, per-car **fact table**: when a Race enters the `results` phase,
`applyAction` appends one record per car — `{ carId, rank, points, gridPosition, overtakes,
defensesHeld }` — built from `computeScores` plus the `Car` stat counters it already
maintains. This extends ADR 0001 to the season grain: cumulative, whole-Season truth is
_accumulated as it happens_, in engine state, rather than re-derived after the fact. Every
downstream view — the Drivers'/Constructors' Championship standings, the results matrix, the
running-points progression, and the per-driver stat leaders — is a **pure derivation** over
that fact table; nothing is stored pre-computed.

The Durable Object orchestrates the **surrounding loop** but owns no scoring: it deals each
Race via `createGame` (carrying the Season forward), assigns each player's **Livery once for
the whole Season** (fixed driver/team identity), and gates the three host transitions
(`START_SEASON` / `ADVANCE_RACE` / `NEW_SEASON`). Liveries stay a DO concern, not engine
state, because the engine is livery-agnostic — liveries are an identity map keyed by car id,
and the DO already owns that map and the non-determinism (deck/team shuffles). This relies on
car ids being **stable across Races**: `createGame` assigns ids `0..N-1` in player order and
the DO never reorders players, so car `i` is the same player — and the same fixed livery —
every Race, which is what keeps per-car accrual coherent.

Intermediate and final results reuse the **same `results` phase**; whether a Race-over is "play
the next Race" or "crown the champions" is a property of the Season state
(`races.length` vs `totalRaces`), so the per-Race engine loop is untouched.

## Considered Options

- **Accrue in the Durable Object, outside the engine.** Rejected: splits the source of truth
  (the engine mutates positions while a second mechanism tallies), and makes accrual testable
  only through a WebSocket rather than as a pure engine property — the same split ADR 0003
  removed for events.
- **Derive Season stats from the event log.** Rejected for the same reason as ADR 0001: the
  log is capped (`MAX_LOG = 50`), so it cannot reconstruct a whole Season's worth of results.
- **Store only each Race's finishing `Score[]`.** Rejected: sufficient for standings but not
  for the results matrix / stat leaders. Retaining the full per-car record per Race makes
  every table a derivation and costs only a few numbers per car per Race.
- **A distinct `season-complete` phase.** Rejected: redundant — completion is derivable from
  the Season state, so the `results` phase is reused and no new engine phase is introduced.
