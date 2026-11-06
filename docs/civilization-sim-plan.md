# Civilization Sim — Plan

A top-down 2D world in the browser where a small band of people grows into a civilization. Their minds run on a language model on your own machine (Gemma 4 to start). You don't control them. You shape the world around them and watch what they make of it.

---

## TL;DR

- **The rules engine decides what is true. The AI model decides what people want, try, say and believe.** The model never makes up physics. It picks from options the engine offers, and the engine works out what happens.
- **There is no tech tree.** Materials have real properties (hard, brittle, burns, melts at 1085°C...). People try things: strike, heat, soak, mix, plant, tame. When an attempt works, that's a discovery. Bronze happens because someone heated copper ore and tin ore hot enough. No button unlocks it.
- **Ages are named after the fact.** The game tracks a few measures (hottest fire, food surplus, power source, record keeping, travel range, settlement size). The current age is a label read off those measures. Two villages can be in different ages, and a village can slide backwards.
- **Knowledge lives in people's heads.** It spreads by watching and teaching. It dies with them unless it gets written down.
- **You act like weather, land and fate:** rain, drought, lightning, a meteorite, a herd moving in, a dream sent to one person. People notice, explain it in their own way, and may start believing in you.
- **The model is slow, so it's spent carefully.** Everyday actions run on plain rules. Model calls go to the moments that matter. The world starts right away with rules only, and the minds switch on once the model has downloaded.

---

## 1. What it feels like to use

1. Open `/civ`. A new world is generated from a seed. A band of 8–12 people appears by a river. The sim runs right away. The model downloads in the background (about 3 GB, cached after the first time).
2. Watch people forage, sleep, argue and pair up. Click anyone to see their needs, what they're thinking, what they remember and what they know.
3. Step in when you like: make it rain, start a fire with lightning, reveal a seam of copper, send a dream.
4. A **Chronicle** feed tells the story ("Year 14: Asha's clay bowl survived the fire. The others call it *hardened earth*.").
5. Over hours of play, spread across sessions with speed controls, they move from flint and fire to farming, metal, writing and towns. The path is never the same twice and can go backwards.

---

## 2. How it's built

| Part | Runs in | Job |
|---|---|---|
| **World engine** | Background worker | Ticks the world: terrain, weather, plants, animals, people's bodies and actions, and the discovery rules. Fully repeatable from a seed. |
| **Mind worker** | Background worker | Loads Gemma 4 with Transformers.js on the graphics card (WebGPU), falling back to the processor. Answers "mind requests" from a priority queue. |
| **Renderer + UI** | Main page | Draws the map on a canvas. React panels for inspecting, tools, chronicle and timeline. |
| **Save** | Browser storage (IndexedDB) | Snapshots plus a log of every model answer, so saved games replay exactly. Export/import as a file. |

**Reuse from `/chess`.** `app/lib/chess/ai.worker.ts` already loads Gemma 4 E2B/E4B, checks the browser cache, picks graphics card vs processor, and limits output to legal moves. Lift that into a shared `app/lib/llm/` and swap the "legal moves" list for a general "legal options" list. That one trick is what keeps a small model's answers valid every time.

**Code layout:** `app/routes/civ.tsx`, `app/lib/civ/{world,people,minds,discovery,history,render,ui}`.

**Model options:**
- Default: Gemma 4 E2B in the browser (about 3.1 GB).
- "Smarter minds": Gemma 4 E4B (about 4.9 GB).
- Later: point it at a local server (Ollama / LM Studio) for bigger models on strong machines.

**Time scale (1× speed):** 1 day = 5 seconds. 1 year = 4 seasons × 12 days = 4 minutes. Speeds: pause, 1×, 3×, 10×, 50×, and "skip to next interesting thing". At high speed, only the important model calls happen (see §5).

---

## 3. The world

### Land
- **Map:** 192×192 tiles to start, about 1 tile per 10 m. Zoom from the whole region down to single people.
- **Layers per tile:** height, moisture, temperature, soil fertility, ground type (sand, clay, loam, rock, chalk), plant cover, water (river, lake, sea, spring), resource deposits, and anything built on it.
- **Made from noise + rules:** height first. Rivers run downhill to the sea. Climate comes from height and latitude. Biomes come from climate.
- **Deposits follow geology** so finding them makes sense: flint in chalk, clay along rivers, copper in hills, tin rare and far away (which drives trade later), bog iron in wetlands, obsidian near volcanoes, salt on coasts.

### Cycles
- Day/night (people sleep, fire matters at night).
- Seasons (plants fruit, animals migrate, winter hunger).
- Weather (rain, storms, droughts, cold snaps).
- Slow change: rivers flood and leave fertile silt, forests regrow, soil wears out when overfarmed.

### Living things
- **Plants:** each kind has a season, nutrition, toxicity, and whether its seeds can be planted. Wild grain grows thick by rivers, which is the first nudge toward farming.
- **Animals:** herds and predators with simple population numbers (born, eaten, starve). Each kind has fear, danger, and how easily it can be tamed. Overhunting empties a valley.
- **Sickness:** more likely with crowding, dirty water, and living near animals. Cooking, clean water and herbal knowledge cut it.

### Materials (the heart of discovery)
Every material has a handful of properties. Rules read these properties, so new combinations still behave sensibly.

| Property | Example values |
|---|---|
| hardness | flint 7, copper 3, wood 2 |
| breaks into sharp edges | flint yes, granite no |
| burns / burn heat | dry wood yes, charcoal hotter |
| melts at | copper 1085°C, tin 232°C, iron 1538°C |
| shapes when wet | clay yes |
| hardens when fired | clay at 600°C+ |
| fiber strength | flax, sinew, bark |
| food value / poison | per plant or animal |
| holds water | hide, gourd, fired clay |

Start with about 40 base materials and about 12 actions. Everything is data tables, so adding content means editing a table, not rewriting code.

---

## 4. People

### What a person has
| | |
|---|---|
| **Body** | age, health, hunger, thirst, warmth, energy, injuries |
| **Needs** | food, water, rest, warmth, safety, company, respect, curiosity |
| **Traits** (fixed, partly inherited) | curious, bold, kind, stubborn, patient, social, plus a "knack" in hands, nature, words or people |
| **Skills** (grow by doing) | foraging, hunting, crafting, building, farming, herding, healing, talking, leading |
| **Knowledge** | list of known things, each with a skill level from 0 to 1 (see §6) |
| **Beliefs** | what they think causes things ("the river spirit sends floods"), what's right ("food is shared") |
| **Memory** | the last ~12 notable events as short sentences, plus a few lifelong "core memories" |
| **Relationships** | trust and affection toward people they know, plus family links |

### Life cycle
Born → child (learns by watching, can't do heavy work) → adult (about 14) → elder (about 45, slower but teaches better) → dies of age, hunger, sickness, injury or violence. Life expectancy starts around 35 and rises with food, medicine and safety. Children inherit a blend of their parents' traits and learn their family's knowledge first.

### What a person can do

Everything is an action with requirements the engine checks.

| Group | Actions |
|---|---|
| **Survive** | forage, drink, hunt, fish, scavenge, eat, sleep, find or make shelter, keep warm |
| **Make** | pick up, carry, strike, heat, soak, dry, grind, mix, shape, bind, cut, dig, build |
| **Grow** | plant, water, weed, harvest, store seed, feed animal, pen animal, breed |
| **Explore** | wander, scout, follow herd, mark a place, return home |
| **Wonder** | watch (an animal, the sky, a fire), experiment (try an action on something new), think it over |
| **Social** | talk, share food, teach, learn, court, raise child, comfort, argue, fight, make peace |
| **Group** | propose (move camp, build, ban something), vote/agree, follow leader, trade, raid, ally |
| **Believe** | ritual, offering, tell a story, mourn, bury, pray, give meaning to an omen |

### How choices get made (three layers)
1. **Reflexes (no model, every tick):** the engine scores each available action by need × chance × distance, nudged by traits, and picks the best. This handles 95%+ of what happens. Hungry → forage.
2. **Plans (model, a few times per in-game day per notable person):** the engine offers 4–8 sensible plans for the day ("gather reeds by the lake", "teach Oru to knap flint", "try heating the red stone"). The model picks one, with a one-line reason. The reason shows in the inspector.
3. **Big moments (model, when they happen):** a discovery, a death, a fight, an omen, a group decision, a first meeting with strangers. These get richer prompts and free-text output (thoughts, speech, names).

---

## 5. How the model is used

### Kinds of request
| Request | When | Output |
|---|---|---|
| **Choose plan** | morning, for notable people | one option from a list, plus a reason |
| **Wonder** | an idle, curious person near something unfamiliar | one experiment from a list (action × object) |
| **Talk** | two people meet and the engine thinks it's worth it | one spoken line, plus an effect (teach X / ask for Y / flirt / insult / share news / propose) |
| **Interpret** | omen, disaster, dream, death | a short belief statement, plus a belief tag (spirit / ancestor / sky / nature / "the watcher") |
| **Name** | discovery, place, child, group, era | a short name in their own words |
| **Council** | group choice (move, fight, adopt a custom) | a speech from each of 2–4 voices, then the leader's pick from a list |
| **Historian** | end of each year | a 2–3 sentence chronicle entry, plus an era name when the measures shift |

### Keeping a small model reliable
- **Always choose from a menu** when it matters. Output is limited to valid options, the same technique as the chess legal-move limiter. Free text is only for flavor (thoughts, speech, names) and is length-capped.
- **Short prompts:** who you are (3 lines), what you need (1 line), what you remember (≤5 lines), what's around (≤5 lines), the options. Aim for under 300 tokens in, under 40 out.
- **One fixed format** per request type so the start of every prompt stays cached between calls.

**Example "Wonder" prompt and answer:**
```
You are Asha, 19, curious and patient. You make bowls from wet clay.
Last night a bowl left by the fire came out hard.
Nearby: fire pit, wet clay, river stones, dry reeds.
What do you try?
1) put wet clay bowl in fire  2) put clay in water  3) mix clay with reeds  4) nothing
> 1 — "The fire made it hard. Maybe on purpose it will be harder."
```
The engine then runs "heat(clay bowl, campfire 600°C)": success, *fired pottery*. Asha names it, and the Chronicle records it.

### Budget and scheduling
- Measure speed when the model loads (tokens per second). Gemma 4 E2B on a mid-range laptop graphics card should manage roughly one short call every 1–3 seconds. That's about 20–40 calls per real minute, and it sets the budget.
- **Priority queue:**
  1. Your own actions (dreams, the person you're inspecting)
  2. Discoveries and naming
  3. Big moments and councils
  4. Conversations
  5. Daily plans
- Requests that are too old get dropped and the reflex layer covers them. At 10× only levels 1–3 run. At 50× only 1–2 plus the yearly historian.
- **"Notable" people** get model time: leaders, elders, makers, the curious, anyone you've clicked, and anyone in a big moment. Everyone else runs on reflexes. At large populations, ordinary people are grouped into **households** that the engine tracks as one unit. This keeps 500+ people affordable.
- **No model yet, or no graphics card?** Everything still works in **instinct mode**: rule-based choices, name lists, template chronicle lines. The model makes the story richer but isn't required for the world to run.

---

## 6. Discovery and progress

### 6.1 How a discovery happens
A discovery is a **successful attempt nobody in the group has done before.** There are three ways in:

1. **Experiment:** a curious person tries an action on something (the "Wonder" request above).
2. **Accident:** the world does it for them. Lightning sets a tree alight. Fruit left in a gourd ferments. Clay near the hearth hardens. Seeds dropped by camp sprout next spring. The engine creates these "happy accidents" from normal events, and you can cause them too.
3. **Watching:** watching animals (they eat that berry and live), the sky (the moon repeats), or other people (strangers with boats).

**Chance of an insight per day:**
`base × curiosity × exposure × spare time × related knowledge × pressure`
- *Exposure:* how often they handle these materials.
- *Spare time:* fed, safe, not exhausted. Surplus feeds invention.
- *Related knowledge:* knowing fire makes heat-based ideas likelier.
- *Pressure:* an unmet need in this area ("necessity is the mother of invention"). Hunger makes food ideas likelier.

### 6.2 The engine decides the outcome
Recipes are written as **rules over properties, not fixed recipes**, so combinations nobody listed still work.

| Rule (simplified) | Result |
|---|---|
| strike(hard + breaks sharp, hard) | sharp flake → cutting, scraping |
| heat(food, ≥ fire) | cooked food: more nutrition, less sickness |
| heat(clay shape, ≥ 600°C) | fired pottery: holds water, stores grain |
| bind(sharp flake, stick, fiber) | spear / axe |
| plant(seed, fertile soil, water, right season) | crop next season |
| tame(animal, food, time, low fear) | herd animal |
| heat(ore that melts below current heat, with charcoal) | metal |
| mix(metal A melted, metal B melted) | alloy with blended properties (copper + tin → bronze, harder) |
| soak(fiber) + beat + dry | cord, cloth, later paper |

**The heat ladder** is the clearest example of progress with no gates. How hot a group can get things is itself discovered:

| Heat source | About | Discovered by |
|---|---|---|
| open fire | 600°C | lightning / friction |
| pit fire, insulated | 800°C | covering a fire |
| charcoal | 900°C | burning wood with little air |
| enclosed kiln | 1100°C | building walls around fire |
| bellows / blowpipe | 1300°C | blowing on coals, then a leather bag |
| tall furnace | 1500°C+ | stacking kilns, a forced draft |

Copper (melts at 1085°C) only becomes possible once kilns exist. Iron (1538°C) needs a forced draft. Nobody "unlocks the Bronze Age". It shows up when someone with kiln knowledge happens to have copper and tin nearby. If tin is three valleys away, that group may skip bronze or trade for it.

### 6.3 Ideas that aren't tools
Same process, different "materials": the engine has a library of **customs** with clear effects. The model picks which one is proposed and what it's called. The group adopts it through a council.

| Kind | Examples | Effect |
|---|---|---|
| **Knowing** | counting, seasons calendar, herbal medicine, star paths | better storage, planting timing, healing, navigation |
| **Living together** | food sharing, marriage custom, ownership, chief, council of elders, laws, money | fewer fights, more trade, different inequality |
| **Believing** | spirits, burial, festivals, priests, gods (possibly you) | morale, cohesion, sometimes conflict between groups |
| **Records** | tally marks → picture signs → writing | knowledge stored in objects, so it can outlive people |

### 6.4 Knowledge lives in heads
- Each known thing has a **skill level 0–1.** The first try at a new thing often fails. Practice raises the level.
- **Spread:** watching (slow, partial), teaching (faster, needs a teacher with a higher level and time), stories (keeps it alive but blurry).
- **Loss:** if every person who knows something dies before passing it on, it's gone and has to be found again. A plague can wipe out a craft.
- **Writing changes everything:** a written record in a building stores knowledge at a fixed level. Anyone who can read can learn from it. This is the big jump that makes later progress stable.
- **Between groups:** trade, marriage, captives and migrants carry knowledge. Isolated groups fall behind or go their own way.

### 6.5 Ages without hard lines
The engine tracks six measures for each settlement. They're based on what's **common** (known by, say, 25%+ of adults), not what one person has tried once.

| Measure | Low → high |
|---|---|
| **Heat** | open fire → kiln → furnace → blast furnace |
| **Food** | foraging → herding/gardens → fields + storage → irrigation |
| **Power** | muscle → animals → water/wind → steam |
| **Records** | memory → tally → writing → books |
| **Reach** | walking → boats → carts/roads → ships |
| **Scale** | band (10s) → village (100s) → town (1000s) → city |

- The **era label** is the nearest match to known patterns (e.g. heat=kiln + food=fields + scale=village → "Early Farming"). It's shown as a smooth color band on the timeline, not a jump.
- The **Historian** also gives each era the culture's *own* name ("The Time of Red Stone").
- Settlements are measured separately: a city in a bronze age can trade with a forest band still using flint.
- Measures can **drop**: a famine, plague or war can push a town back to village life.

**Rough content target for v1:** stone tools → fire → cooking → pottery → farming and herding → copper → bronze → writing → towns → iron. The table-based design means later eras (wheel, sails, water mills, paper, printing, steam) are mostly new rows of data.

---

## 7. How you (the observer) influence things

You never control a person directly. Everything you do goes through the world.

| Tool | Examples | What it tends to cause |
|---|---|---|
| **Sky** | rain, drought, storm, lightning strike, cold snap, clear season | lightning → first fire; drought → migration or irrigation ideas |
| **Land** | raise/lower ground, carve a river, flood, plant forest, earthquake, volcano | floods → fertile soil; volcano → obsidian and fear |
| **Life** | send a herd, predators, a wild grain field, crop blight, sickness, cure | wild grain → farming pressure; sickness → medicine ideas |
| **Gifts** | reveal a deposit, meteorite (iron!), wash an object ashore | jump-starts metal; strange objects spark curiosity |
| **People** | a wandering band arrives (different knowledge, language, beliefs) | contact, trade, marriage, war, ideas crossing over |
| **Whisper** | send a dream to one person (you type it) | they interpret it their way; nudges curiosity toward what you mentioned |
| **Omen** | eclipse, comet, aurora, seen by everyone | beliefs, rituals, sky-watching → calendar |
| **Time** | pause, speeds, skip to next event, follow a person, bookmark | — |

### Rules for your influence
- **Whispers are nudges, not instructions.** Your text is shortened and passed in as a vague dream. The engine picks out materials or actions it recognizes ("fire", "red stone", "seeds") and raises insight chances for those. The person may ignore it, misread it, or turn it into a religion.
- **They notice you.** Unusual events are remembered and explained. If rain keeps following their rituals, belief in "the one who watches" grows. Priests, temples and offerings to *you* can emerge, and they may beg you for help during famines.
- **Optional limit:** a "favor" meter that refills over time, with big acts costing more. Two modes: *Sandbox* (unlimited) and *Patient* (limited, which rewards subtle play).
- **Everything shows up in the Chronicle,** so you can see the effects of what you did years later.

---

## 8. Screen layout

- **Center:** the map. Tiles, people as small figures with name tags when zoomed in, speech bubbles for Talk results, smoke from fires, fields, buildings.
- **Left:** your tools (§7), favor meter, speed controls.
- **Right: Inspector.** Click a person to see needs bars, current plan and reason, last thought, memories, knowledge with skill levels, relationships and family. Click a tile for its terrain and deposits. Click a settlement for population, customs, beliefs and its six measures.
- **Bottom:** the Chronicle feed (filter by settlement or person) and the Timeline (era color bands per settlement, with discoveries marked).
- **Ideas Web** (separate panel): a graph of discoveries *as they actually happened*, each linked to who found it, when, and what it built on. Each world draws its own.

Start with plain shapes and simple tiles on a 2D canvas. Move to a faster drawing library (PixiJS) only if large maps get slow.

---

## 9. Build order

| Step | Build | Done when |
|---|---|---|
| **1. Living map** | world generation, seasons, weather, plants, animals, people with needs and reflexes, canvas view, inspector | a band survives (or doesn't) for 10 years with no model |
| **2. Making** | materials table, ~12 actions, outcome rules, heat ladder, accidents, skill levels, teaching | fire → cooking → pottery can happen by itself in rules-only mode |
| **3. Minds** | shared model worker (lifted from chess), menu-limited output, request queue, budget, Wonder / Plan / Name / Talk | inspector shows real thoughts; discoveries get named; stays smooth at 1× |
| **4. Your hand** | sky, land, life, gifts, whisper, omen tools; Interpret request; beliefs | a lightning strike leads to fire use plus a story about it |
| **5. Society** | families, inheritance, councils, customs library, multiple bands, contact, trade, conflict | two bands meet and either trade knowledge or fight, without scripting |
| **6. Settling** | farming, herding, buildings, storage, settlements, households grouping | a village of 100+ forms and stays fast |
| **7. History** | six measures, era labels, Historian, Chronicle, Timeline, Ideas Web, save/load/replay | a 200-year run reads as a coherent story you can replay |
| **8. More content** | metals, writing, wheel, boats, iron; local-server model option | iron and writing appear in a long run on the default seed |

Steps 1–2 are fun to watch even without the model. That's on purpose, because it proves the world is interesting before the minds get added.

---

## 10. Risks and how to handle them

| Risk | Handling |
|---|---|
| Model too slow | reflexes do most of the work; strict budget; only notable people think; instinct mode |
| Model says nonsense | menu-limited output; short fixed prompts; engine validates every result |
| 3–5 GB download / no graphics card | world starts instantly in instinct mode; download is optional and cached; smaller model tier |
| Phones can't run it | desktop-first for minds; phones get instinct mode or watch-only |
| Too many recipe combinations | property-based rules plus data tables; test each rule on its own |
| Slow, boring stretches | "skip to next interesting thing"; accidents tuned up early; pressure drives invention |
| Runs drift into nothing happening | tune insight chances with automated rules-only runs over many seeds; report the average time to fire, pottery, farming and metal |
| Saves break when the model differs | log every model answer so replays never re-ask the model |

---

## 11. Decisions for you

1. **Where it lives:** a page on rafe.dev (`/civ`, public, desktop-first), or a separate private project?
2. **Favor limit:** ship *Sandbox* only at first, or both modes?
3. **Tone:** grounded and realistic (illness, war, death shown plainly) or gentler?
4. **How far:** stop v1 at iron and writing, or plan the data for steam and beyond from day one?
