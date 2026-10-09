---
name: ha-custom-card-design
description: Design, build, test and ship Home Assistant Lovelace custom cards (vanilla JS web components, Mushroom-matched look, HACS bundle) and fold them into a live dashboard. Use this whenever the user wants a new or redesigned dashboard card, wants to merge several cards into one, asks for card/dashboard design ideas or mock-ups, reports a card bug (taps not registering, pop-up closing, fonts or sizes looking off, overflow on mobile), or wants cards installed via HACS, screenshotted, or swapped into a view – even if they only say "make this section nicer" or show a screenshot of a dashboard.
---

# Home Assistant custom card design

This skill captures how cards were designed and shipped for a real home dashboard
(the `homeassistant-custom-cards` repo): the visual language that ended up matching
Mushroom / Bubble Card, the engineering rules that made taps reliable on phones, and
the workflow that got cards from idea to a live view without breaking anything.

Reference files (read when you reach that step):

- `references/design-tokens.md` – exact sizes, colours, glow, pills, tiles, dialogs.
- `references/card-skeleton.js` – a complete card to copy: build once, update in place,
  value taps, confirm dialog, registration.
- `references/testing.md` – jsdom harness and the gotchas that bite.
- `references/ship-and-verify.md` – bundle, HACS, saving a view safely, live checks,
  README screenshots.
- `references/lessons.md` – the feedback log: what the user rejected or asked for, and
  the rule each one became. Skim it before proposing a design.

If those files are not next to this SKILL.md, they live in the GitHub repo
`igiannakas/homeassistant-custom-cards` under `skills/ha-custom-card-design/`.

## The workflow

1. **Look before designing.** Read the current view config over the websocket
   (`lovelace/config`) and pull the live states of every entity you might use. Check that
   each entity id exists, its unit, and its typical value. Guessed ids are the most
   common source of a card that renders dashes. For example, the VOC delta sensor was
   really `..._intake_exhaust_voc_delta`, not `..._voc_delta`. Ask about anything you
   can't see: which rooms are controllable, what is automated, which entity means "home".
2. **Ideas, then a mock-up, before code.** For a new design, give 2–4 short options
   labelled A/B/C and render a mock-up with real names and values (an HTML page or
   image). Let the user pick and tweak, and iterate on the mock-up because that is cheap.
   Implement only after the user says go. For a pure bug fix, skip straight to step 3.
3. **Build** each card as one vanilla custom element in `cards/<name>/<name>.js`, with a
   README and a test (see the rules below and the skeleton).
4. **Test in jsdom.** Cover rendering, every tap target, every service call and state
   transitions. Then rebuild the HACS bundle and run the bundle test.
5. **Commit and hand off the push.** If the shell that can reach the repo has no GitHub
   credentials, commit there and ask the user to `git push origin main`. Never claim
   something is published until the push is confirmed.
6. **Install through HACS** (`hacs/repository/refresh`, then `hacs/repository/download`)
   and confirm the served bundle has the new version headers.
7. **Back up, then save the view.** Write the old view JSON to a file first. Then save
   with `lovelace/config/save` and re-read it to confirm the number of views.
8. **Verify live.** Check desktop and a 375 px phone viewport, click the real taps,
   open and cancel each dialog, and filter console errors to your cards. Report what
   you checked and what you didn't.

Ask before restarting Home Assistant. Never edit `.storage` files while HA is running.
If you find a secret in plain text (e.g. an SSH password in a script), tell the user
to move it to `secrets.yaml` and never repeat it.

## Design language

The aim is that a custom card is indistinguishable from the Mushroom, tile and Bubble
cards around it. Users notice a 1px or 100-weight difference immediately, so match
exactly rather than "close enough".

- **Type scale:**
  - Names 14px / 500 / .1px, primary text colour.
  - Secondary text and readings 12px / 400 / .4px, secondary text colour.
  - Label-row title 13px / 500.
  - Label-row summary 12px / 500, right aligned.
  - Mode and segment labels 12px.
  - One weight family per card. A status word ("Excellent") and the readings beside it
    are the same size.
- **Icons:**
  - 24px inside a 36px circle "shape" whose background is the state colour at 20%.
  - Inactive is grey.
  - Small reading icons (thermometer, drop, lux) are 14px at about 55% of the
    secondary text colour, so they never outshine the card's purpose.
- **Glow means "active or needs you":** the tile background takes the state colour at
  about 10% (a lit room, a heater that is on, a room that needs air in red). Keep
  everything else neutral (`rgba(primary-text-rgb, .04)`) so the glow carries meaning.
- **Coloured text** is mixed toward the text colour so it stays readable:
  `color-mix(in srgb, var(--amber-color) 70%, var(--primary-text-color))`.
- **Pills:** 36px high (44px on phones), radius 18. Use them for links and toggles
  in a header (presence, climate, power). A split pill does two things: the left half
  toggles and the right half opens the reading.
- **Tiles:** radius 10, padding 8–10, gap 6, `grid-auto-rows: 1fr` so every tile in a
  grid has the same height.
- **Units are always shown** (°, %, lx, W, kWh, ppm), numbers are formatted with
  thousands separators, and the reading's unit is never left to guess.
- **The summary line says something useful**, such as "Ventilate Living Room",
  "4 of 8 loaded" or "At temperature". A count the user can already see below is noise.
- **Don't show what is automated:** e.g. brightness % when Adaptive Lighting controls
  it. Don't show internals the user didn't ask for (e.g. the filament buffer state).
- **Theme variables only**, with fallbacks (`var(--green-color, #4caf50)`), so dark mode
  just works.

## Interaction rules

- **Every number opens its own more-info.** Containers (tile, lane, side) are
  `div role="button" tabindex="0"`. Values inside are `<button data-e="entity_id">`.
  One delegated click handler uses `closest("[data-e]")`, falling back to the tile's
  main entity. Never nest buttons inside buttons.
- **Confirmation follows the stakes, so ask the user which actions confirm:**
  - Immediate: all lights on/off, turning a plug on, choosing a mode.
  - Confirm with a dialog: anything that moves hardware, ends a job or cuts power
    (home axes, cancel print, safe power-off, plug off). Warn in red when it would
    interrupt something running.
  - Leave out what the user doesn't want on the card at all (e.g. an emergency stop).
- **Confirm dialogs** use the Bubble look: blurred backdrop, 32px radius, 56px buttons,
  a coloured confirm button, Escape and backdrop cancel. See the skeleton.
- **Pop-ups** owned by Bubble Card open with `history.pushState(null, "", "#hash")`
  plus a `location-changed` event. A hold gesture can open the card's own sheet, which
  has the actions below a divider and the main call-to-action in the accent colour.
- **Placement follows the page's flow.** Put context first (weather and presence), then
  shortcuts, then per-item cards. Link to deeper dashboards with a pill rather than
  embedding them, so the scroll isn't broken up.

## Engineering rules (each one fixed a real bug)

- **Build the DOM once, then update only what changed.** Use a `set(node, value)` helper
  that compares before writing. Rebuilding `innerHTML` on every `hass` update replaces
  the element under the user's finger, and the tap is lost. Rebuild action buttons only
  when the set of actions changes.
- **No `transform` on `:active`.** Use `filter: brightness(.92)`, because scaling moves
  the hit area mid-tap.
- **Long-press on mobile:**
  - Ignore clicks in a just-opened sheet until 350 ms after `pointerup` or `touchend`.
    Otherwise the finger-lift click lands on the backdrop and closes the sheet at once.
  - `preventDefault` the `touchend` after a hold, and block `contextmenu`.
- **Register after the app exists:**
  `await customElements.whenDefined("home-assistant")`. Guard against defining twice,
  and push to `window.customCards`.
- **Dialogs and sheets** are an *undefined* custom tag with `attachShadow`, appended to
  `document.body`. Don't define elements for them, because HA uses a scoped registry.
- **Editors:**
  - `getConfigForm()` covers simple cards.
  - HA's object selector silently drops `entity { multiple: true }` fields inside list
    items. For those, write a custom editor (`getConfigElement`).
  - Entity pickers only render inside the `home-assistant` tree, so test editors there.
- **Embed other cards** with `(await loadCardHelpers()).createCardElement(cfg)`, and pass
  `hass` on every update.
- **Responsive:**
  - Container queries can't style the container itself, so put layout on an inner
    wrapper.
  - When text may not fit, measure it (ResizeObserver plus `scrollWidth`) and switch to
    a stacked layout, or let the line `flex-wrap`.
  - Ellipsis on names, never on numbers.
  - Check at 375 px, where a heater line like "249.6° → 250° · 38%" overflowed until the
    power moved beside its bar.
- **Versioning:** a `VERSION` constant and a `console.info` badge in each card. Bump it
  on every change so HACS and cache issues are visible.
- **HACS plugin = one file.** A build script wraps each card in an IIFE and
  concatenates them into `dist/<repo>.js`. `hacs.json` names that file. A `--check`
  mode fails CI when the bundle is stale. Never write `*/` inside a comment, because it
  ends the comment in the bundle.

## Talking to the user

- Show mock-ups and screenshots rather than describing them.
- After a change, say what changed and what you verified in a sentence or two.
  Mention bugs you found and fixed on the way.
- When the user rejects a direction ("too grey, the room name gets lost"), revert
  cleanly and offer two or three alternatives, not a single guess.
- Keep a short list of their stated preferences (in project memory or `lessons.md`)
  and apply them to the next card unasked.
