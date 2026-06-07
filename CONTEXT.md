# Context: The Race

A card-based F1 racing game playable in the browser, part of the /games hub on rafe.dev.

## UI Naming Conventions

### PlayingCard (component)

The React component that renders a game mechanic card (values 1–12 or Redline). Named `PlayingCard` to distinguish it from the shadcn `Card` container component, which is used for panel/surface layout (lobby player list, challenge panels, result rows).

## Glossary

### Player

A human participant in a game room, identified by a client-generated UUID. Controls one car (3–6 player games) or two cars ([Team Mode](#team-mode)). The **Player** is the person; the **Driver** is the F1 identity their car races under — the two are deliberately distinct.
_Avoid_: User, owner

### Livery

The F1 identity kit assigned to a car at race start: a **Driver** name, a **Team**, a car number, and team colours (plus a cockpit-camera "tertiary" colour that tells teammates apart). In [Team Mode](#team-mode) one whole team's pair of liveries goes to one player.

### Driver

The F1 driver a car races under (e.g. "Max Verstappen"), drawn from the car's **Livery**. This is the **primary identity** for a car everywhere it is surfaced — log, standings, and results — with the controlling **Player** shown secondarily, if at all.

### Team

The F1 constructor a **Livery** belongs to (e.g. "Red Bull Racing"), shared by its two paired liveries. In [Team Mode](#team-mode) a player controls one team's two cars.
_Avoid_: Constructor — except deliberately, for championship-style standings framing

### Position

An absolute integer representing a car's location on the track. Positions are not necessarily consecutive — gaps can exist between cars. Two cars cannot share the same position. Higher position = further ahead in the race.

A car can **extend** only when `position + 1` is unoccupied. A car must **challenge** when `position + 1` is occupied by another car. Adjacency is what matters: a gap of one or more empty positions in front means `position + 1` is free, so the car takes a [Solo Turn](#solo-turn) — it is **never** challenged against a car two or more positions ahead.

### Persistence

Game state is written to Durable Object storage (`this.ctx.storage.put`) after every state mutation. Ensures full reconnection even if all players disconnect and the DO evicts.

### Pending This Round

A set of car indices (by identity) tracking which cars have not yet acted in the current round. The next car to act is always the lowest-position car in this set. A car is removed when: its turn ends (discard, extend, lose challenge, 2nd challenge win), OR it loses as a defender (turn cancelled), OR it goes `outOfCards`. When the set empties, the round is complete.

### Turn Order

Cars act in ascending position order (last place first). `turnOrder` is only recalculated after a successful challenge (the only action that changes relative rank). Extending never changes rank — it only closes a gap without passing another car.

### Solo Turn

When the acting car has a **free space directly ahead** (`position + 1` is unoccupied), its turn is a _solo turn_: the only legal actions are **discard** and **extend**. This is the **only** situation in which discarding or extending is allowed — the engine rejects both when a car sits directly ahead. It applies regardless of standing: the leader (who always has a free space ahead) and any car with a gap in front both take solo turns. Conversely, when `position + 1` is occupied the car has no solo turn and **must** challenge the adjacent car (see [Challenge](#challenge)); it can neither discard nor extend, and a car mid-challenge must commit challenge cards rather than act.

A solo turn uses **exactly one card**: the discard or extend submits a single card and the UI does not offer Redline pairing. Stacking a Redline (see [Redline](#redline)) is a challenge-only mechanic — there is no second card to commit on a solo turn.

### Challenge Outcome — Turn Consequences

- **Challenger wins**: Positions swap. The **defender's turn is cancelled** for this round (removed from `pendingThisRound`). The engine immediately auto-declares the next challenge for the challenger if position+1 is now occupied (max 2 wins per turn). Both chains happen within the same state transition — no client action between them.
- **Challenger loses or ties**: No position change. The **challenger's turn ends** (removed from `pendingThisRound`). The defender's turn proceeds normally.

### Track

An unbounded integer number line. Cars hold absolute positions; higher = further ahead. There is no finish line — the race ends only when a car runs out of cards. The visual track renders the current spread of positions dynamically.

### Qualifying Reveal

All cars submit their qualifying card independently and blindly. Once every car has submitted, all cards are revealed and all cars animate to their starting grid positions simultaneously. No car's position is shown until all have submitted. The UI action button during qualifying is labelled "Qualify".

### Qualifying Tiebreak

Equal qualifying card values are resolved by server-side `Math.random()`. No visible tiebreak animation.

### Card Usage in Challenges

Any card in hand (values 1–12 or Redline) may be played in a challenge. The "extend cards" (1–3) restriction applies only to the extend _action_ — not to challenge eligibility.

### Deck Composition (per suit, 13 cards total)

- Cards 1–2: regular Extend cards
- Card 3: the Drafting Extend card (see below)
- Cards 4–12: regular challenge/discard cards
- 1 Redline card

### Season

A fixed-length sequence of **Races** (currently seven) played out in one game room, across which the **Drivers' Championship** and **Constructors' Championship** are decided. A room runs one Season at a time.
_Avoid_: Championship (when you mean the container — "Championship" names the titles contested, not the sequence of races), Series, Campaign

### Race winner

The **Driver** whose car finishes 1st in a single **Race** — the highest final [Position](#position) that Race. Every Race has exactly one; it is that Race's headline result.
_Avoid_: Drivers' Champion (that is the Season-long title, not a single Race's winner)

### Drivers' Champion

The **Driver** with the most championship points across the whole **Season**, decided when the Season's final **Race** finishes. Exactly one — ties resolved by the [Championship Tiebreak](#championship-tiebreak).

### Constructors' Champion

[Team Mode](#team-mode) only: the **Team** with the most championship points across the **Season**, summed over its two cars. Exactly one of the two teams — a separate title from the [Drivers' Champion](#drivers-champion): a pair of steady scorers can take it while a lone star takes the drivers' title, so the two need not coincide.

### Championship Tiebreak

Equal Season points are resolved by **countback** — most wins (P1 finishes), then most P2s, then P3s, and so on — then by **head-to-head** (who finished ahead in more Races). Two cars never share a [Position](#position) within a Race, so head-to-head resolves any realistic tie; a stable final fallback guarantees there is always exactly one champion.

### Overtake

A [Challenge](#challenge) won as the challenger: positions swap and the challenger gains a place. Tallied per **Driver** across the whole race; a turn's second challenge win counts as a second overtake.

### Defense

A [Challenge](#challenge) faced as the defender in which the car **keeps its position** — outcome "defender" _or_ a tie (a tie holds the place). Tallied per **Driver** as "defenses held".

### Driver of the Day

The post-race award for the **Driver** who gained the most places between their [Starting Grid](#starting-grid) slot and their finish, tie-broken by [Overtake](#overtake) count. Omitted when no driver finished ahead of their grid slot.

### Results Display

Every **Race** ends on a results screen with two layers, all presented as tables (no charts). **This Race:** a per-**Driver** podium ordered by finishing [Position](#position) headlines the [Race winner](#race-winner); each classification row carries that driver's [Overtake](#overtake) and [Defense](#defense) tallies, plus one [Driver of the Day](#driver-of-the-day) when applicable. **The Season so far:** the [Drivers' Championship](#drivers-champion) standings always (and the [Constructors' Championship](#constructors-champion) standings in [Team Mode](#team-mode)), a results matrix of each driver's finish per Race, the running points after each Race, and per-driver Season stat leaders (wins, overtakes, defenses, places gained). The Season's final Race additionally crowns the champions. The controlling **Player** is shown only as a secondary label.

### Game Lifecycle

A **Season** runs `lobby` → (`qualifying` → `race` → `results`) once per **Race** → `lobby`. The host starts the Season from the lobby. After each non-final Race the host's **Next Race** goes straight from `results` into the next Race's `qualifying` — the lobby is _not_ revisited between Races. The final Race's `results` crowns the [Drivers'](#drivers-champion) and [Constructors'](#constructors-champion) champions, and the host's **New Season** returns to the `lobby`, where the roster can change again before the next Season starts. Intermediate and final `results` are the same phase, told apart only by the Season standings. Same game code, no navigation needed.

### Lobby Capacity

Maximum 6 players. The DO rejects a 7th `JOIN` with an error. Once `START_GAME` fires, no new player IDs can join — unrecognised IDs during `qualifying` or `race` phase are rejected.

### Game Code

A 4-character uppercase alphanumeric string (e.g. `XKCD`) generated client-side via `crypto.randomUUID().substring(0,4).toUpperCase()`. Used as the DO name via `idFromName(code)`. Collision probability is negligible for a personal site. If a code collision does occur, the DO rejects the second "create" and the client regenerates.

### Self-Challenge (Team Mode)

When Car 1 challenges Car 2 and both belong to the same player: the player sees **both hands simultaneously** and chooses both cards strategically. The player sends two separate `COMMIT_CHALLENGE_CARDS` actions — one per car, in any order — just like a normal challenge. Resolution triggers when both car slots are filled. Normal challenge outcome rules apply — if Car 1 wins, Car 2 loses its turn this round; if Car 2 wins, Car 1's turn ends.

### Team Car Control

In [Team Mode](#team-mode) each player controls 2 cars. Cars act independently in turn order — the same player may act for Car 1 in one turn slot and Car 2 in a later slot. The UI makes the active car explicit.

Whenever a player must act for **both** their cars in the same moment (qualifying, self-challenge), they see both hands simultaneously and choose moves strategically for each car. This is the one exception to card secrecy.

### Drafting Extend

The "3" card in each suit. In a challenge, its effective value is 3. As an Extend action, it follows normal extend rules **except** the car currently in 1st place (highest position) cannot use it to extend. The leader may still play it in a challenge or discard it.

Like every extend card, the Drafting card requires a **free space directly ahead** — there is no "drafting" into an occupied position. If a car is directly ahead, the holder must challenge it (see [Solo Turn](#solo-turn)). The Drafting card's only distinction from the value-1 and value-2 extend cards is the leader restriction.

### Redline

A card held in hand like any other. Can be played alone (effective value 0) or selected alongside a main card (adds +2 to that card's effective value). Both cards are submitted together in a single CHALLENGE or DEFEND action. Pairing a Redline onto a main card is only available in a challenge — on a [Solo Turn](#solo-turn) the car selects a single card, so a Redline can only be discarded or played on its own, never stacked.

### Round

A complete pass through all cars, where each car acts exactly once. Tracked by car identity (not position) via a `pendingThisRound` set. When a car goes `outOfCards` — whether as an attacker or a defender — the car is immediately removed from `pendingThisRound`. If that car is the **leader** (highest position), the race ends immediately (`phase → results`). If it is any other car, `endAfterRound = true` is set and the race ends once the remaining cars in `pendingThisRound` have all acted.

### Team Mode

The mode activated automatically when exactly **2 players** start the game. Each player controls one whole F1 **Team** — 2 independent cars (4 cars total on track) sharing a team **Livery**, told apart only by the cockpit-camera colour. Suits are assigned randomly from the 6 available. With 3–6 players the game is single-car: each player controls 1 car, each on a distinct team.
_Avoid_: 2-player mode, two-player mode

### Host

The first player to join a game room. Exclusive right to trigger `START_GAME`. Non-transferable. Has no special role during the race itself.

### Player Identity

Each player has a client-generated UUID stored in `localStorage`. Sent with every `JOIN` message. The DO uses it to re-attach reconnecting players to their existing game slot. Low-security by design — appropriate for a casual personal site.

### State Broadcast

The DO sends a personalised `STATE_UPDATE` to each connection: the recipient's cars show full hand contents; all other cars show hand size (card count) only. During an active challenge, **neither participant's committed cards are broadcast until both have submitted** — each player sees their own committed cards but not their opponent's. This mirrors the Qualifying Reveal pattern.

### Challenge

A mandatory turn action declared automatically by the engine when `pending[0]`'s `position + 1` is occupied — i.e. another car is _directly adjacent_ ahead. A car two or more positions ahead (with a gap between) does not trigger a challenge; the acting car takes a [Solo Turn](#solo-turn) instead. The engine sets `pendingChallenge` — with both card slots empty — as part of the same state transition that advances the turn. Both the challenger and defender independently commit cards via `COMMIT_CHALLENGE_CARDS { carId, cardIndices }`. Neither player's cards are revealed until both slots are filled, at which point the engine resolves and reveals simultaneously. The UI action button is labelled "Challenge" for both participants.

### Starting Grid

After qualifying, cars are placed at consecutive positions: last place at 0, pole at `numCars - 1`. No gaps between cars at race start.
