# Developer contracts (internal)

The game spec is `docs/DESIGN.md` (Japanese). This file fixes the **code interfaces** shared by modules written in
parallel. All code: plain ES modules, no build step, three.js r186 from the importmap (`three`, `three/addons/`,
`@pixiv/three-vrm`). UI text in Japanese. Never `innerHTML` with game/AI strings — use `textContent`.

## File ownership (one owner per file)

| Area | Files | Owner |
|---|---|---|
| Core loop, systems wiring, player state, actions, fire, cooking, water, sleep, fauna, fishing, save | `js/core/*`, `js/sim/body.js`, `js/sim/weather.js`, `js/sim/inventory.js`, `js/sim/player.js`, `js/sim/actions.js`, `js/world/*` (except below), `js/player/*`, `js/gesture/*`, `js/companion/*` | lead (Opus) |
| Items | `js/data/items.js`, `js/data/water.js` | items agent |
| Crafting | `js/data/recipes.js`, `js/data/crafted.js`, `js/sim/crafting.js`, `tests/crafting.mjs` | crafting agent |
| Buildings | `js/data/buildings.js`, `js/world/structures.js`, `js/sim/building.js`, `tests/building.mjs` | building agent |
| Field guide + companion text | `js/data/guide.js`, `js/sim/knowledge.js`, `js/data/lines.js`, `js/data/personas.js` | guide agent |
| Events, endings, score, achievements | `js/data/events.js`, `js/data/achievements.js`, `js/sim/events.js`, `js/sim/score.js`, `tests/events.mjs` | events agent |
| UI | `css/style.css`, `js/ui/*`, `dev/ui.html`, `dev/mock-game.js` | UI agent(s) (see their brief) |
| Sound | `js/audio/sfx.js` (done) | – |
| Vegetation | `js/world/flora.js`, `js/world/flora/*` | flora agent |

## Item stacks (inventory)

```js
stack = {
  uid,            // unique number
  id,             // item id (key of ITEMS / CRAFTED)
  n,              // count
  q,              // quality 0–100 (DESIGN §11.7)
  fresh,          // 0–100 for foods (100 = just caught), null otherwise (§7.2)
  done,           // cooking progress 0–130+ for cookable foods (§7.3), 0 = raw
  proc,           // 'none' | 'dried' | 'smoked' | 'salted' | 'salted_dried' | 'stew'
  dur,            // durability left (uses) for tools, null otherwise
  wet,            // 0–100 (fuel, tinder, clothes, sleeping bag)
  attrs,          // optional per-instance attribute override (crafted items inherit, §11.4)
  stats,          // optional per-instance performance numbers of crafted tools (e.g. { sharp, melee, chop, power, range, liters })
  name,           // optional per-instance display name ("粗悪な 石斧", AI names)
  water,          // optional: water held in a container { src: 'river_low' | …, cups, treat: 'none' | 'boil' | 'filter' | … }
  contents,       // optional: things inside a container
}
```
`js/sim/inventory.js` exports `Inventory` (add(id, n, extra) / take(idOrUid, n) / removeStack(uid) / get(uid) /
count(id) / withTag(tag) / weight() / stacks) and `makeStack(id, n, extra)`; `itemDef(id, stack?)` comes from
`js/data/items.js` and must also find crafted ids from `js/data/crafted.js` (items.js imports and merges CRAFTED).

## Item definitions (`js/data/items.js`)

```js
export const ITEMS = { [id]: ItemDef }          // natural, found, food, herb, starter, clothing, misc
export function itemDef(id, stack = null)       // ITEMS[id] || CRAFTED[id]; applies stack.attrs/stats/name overrides
export function attrsOf(stack)                  // effective attributes (stack.attrs || def.attrs), wet reduces burn/tinder
ItemDef = {
  name, icon (one emoji), cat: 'material'|'food'|'herb'|'tool'|'weapon'|'ammo'|'clothing'|'container'|'medicine'|'fuel'|'misc',
  weight (kg), attrs: { hard, sharp, long, flex, fiber, burn, tinder, waterproof, container, heavy, sticky, toxic,
  insul, float, edible, med, heatproof, absorb, shine, spark, scent }  (0–10, omit zeros),
  tags: [...material tags: wood stone metal steel feather bone leaf cloth food fish meat plant shell glass plastic fiber salt],
  stack (max per stack; tools 1), q: [min, max] default quality when found,
  fuel: fuelH when burned (§10.3), tinder: tinder multiplier (§10.1), board: friction-board multiplier (§22.9),
  food: { food, water, B, parasite, decay, thick (1.5 | 1.0 | 0.6), rawPenalty (morale), mustCook, cookable,
          poison: { id, chance, sev: [a, b], hp, heatKills (bool), incubation }, opensTo, stage },
  med: { type, power, use: 'apply' | 'tea' | 'eat' },
  tool: { kind, durability, sharp, chop, melee, power, range, view },   // view = js/player/viewmodel.js tool name
  container: { liters, heatproof, maxBoils },
  wear: { slot: 'body' | 'head' | 'cloak' | 'feet' | 'bed', insul, rain, sun, days },
  starter: { star, score, p },   // only the take-along items (§3, §21)
  guide: guideId,                // field-guide entry (§20)
  desc, p: 'P0' | 'P1' | 'P2',
}
```

## Game object (what UI / events / buildings may call)

`window.ISLE.game` → `game`:

- `game.bus` — `on(name, fn)`, `emit(name, arg)`. Events: `toast {text, kind}`, `log {text, kind}`, `item:gained {id, n, name}`,
  `craft:done {stack, recipe, first}`, `build:done {id}`, `eat`, `drink`, `condition {id, name, sev}`, `healed`, `hour {day, hour}`,
  `day {day}`, `weather {type, name}`, `animal:killed {kind, name}`, `fire:lit`, `fire:out`, `player:dead {cause}`, `game:end {result}`,
  `companion:say {text, who}`, `subtitle {who, text, final}`, `screen {name}`.
- `game.clock` — `day`, `hour`, `total` (game minutes), `label()`, `tide()`, `realSecPerHour`, `scale` (time speed).
- `game.setup` — `{ count: 0|1|2|3|'all', starters: [ids], ammo: 12|30|'inf', companion: 'none'|'nagi'|'touko'|'gen',
  days: 3|7|14|30|60|100|0 (0 = unlimited), dayMinutes: 12|24|36|48|72, difficulty: 'easy'|'normal'|'hard'|'extreme',
  season: 'dry'|'wet'|'auto', seed, control: 'mouse'|'touch'|'gesture', subtitles, micMode: 'auto'|'ptt', quality, playerName }`
- `game.diff` — the DIFFICULTY entry (`js/data/conditions.js`).
- `game.sys.weather` — `name`, `type`, `windSpeed` (m/s), `windDir` (rad, air moves toward sin/cos), `rain`, `airTemp(h, {y, zone, day})`.
- `game.sys.player` — `body` (`s: {hp, food, water, stamina, staminaMax, rest, bodyTemp, wet, morale, hygiene}`, `visible()`,
  `feel` felt °C), `inv` (Inventory), `hotbar` [6 uids or null], `held` (uid), `wear` `{ body, head, cloak, feet, bed }` (uids),
  `heldStack()`, `zone`, `shelter` `{ rain, wind, insul, name }`, `nearFire` (m or null).
- `game.sys.knowledge` — `level(guideId)` 0–3, `nameOf(itemId)` (provisional name below K3), `entries()`, `learn(guideId, level, how)`.
- `game.sys.crafting` — `preview(method, uids)`, `craft(method, uids)`, `book()`.
- `game.sys.building` — `defs()`, `startPlacing(id)`, `sites`.
- `game.actions` — verbs for menus: `eat(uid, {nibble})`, `drink(uid)`, `equip(uid)`, `wear(uid)`, `drop(uid, n)`,
  `use(uid)`, `inspect(uid)`, `treat(uid)`, `sleep(untilHour | hours)`, `fillContainer(uid)`, `giveToCompanion(uid, n)`,
  `eatCard(uid)` → `{ name, foodGain, waterGain, risk: { p, band, label, shown: 'percent'|'band'|'none'|'unknown' }, warnings: [] }`.
- `game.screens` — `show(name, data)`, `hide()`, `current`. Screens pause the game while open (except `hud`).
- `game.debugState()` — JSON for tests.

All game-time values are **game hours / minutes**; real-time UI animation uses `performance.now()`.
