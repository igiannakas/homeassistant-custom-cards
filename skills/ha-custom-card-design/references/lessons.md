# Lessons – the rules

Rules learned building the `homeassistant-custom-cards` set: home status, room lights, energy
summary, weather & presence, climate modes, air quality, printer status, robot vacuum, printer
temperatures, MMU lanes, enclosure filter and appliances. Read them before proposing a design.
Most of them generalise to any dashboard.

## Content: show what matters, drop what doesn't

- A header must *do* something (here: a one-tap all on/off) or say something new. Don't repeat the tiles below.
- Don't show values an automation owns. Ask what is automated.
- Don't assume entity lists line up across domains. Ask, or derive from what exists.
- A summary card stays a summary. Detail lives one tap away.
- Leave out internals the user doesn't act on, even when they're available.
- Group a reading with the thing it describes (each side), not in a leftover "extras" line.
- Thresholds come from the user's world. Make them options with their defaults.
- Support several sensors per slot (`21.1/21.7°`) without breaking the layout.

## Look: match the neighbours exactly

- Icons are 24px in a 36px shape, like Mushroom. Measure against a neighbour card.
- Names are 14px / 500, not 600. Use the theme's text colours, never hard-coded black.
- Pop-ups copy the existing Bubble pop-ups (20px title, 56px rows, 16px / 600).
- One type style for every reading on a card. Status words match the readings.
- Mode labels are 12px. Check on a phone, where differences are most visible.
- Hierarchy: primary state gets colour and glow, names stay strong, secondary information is quiet. When a fix overshoots, revert and offer options.
- Every reading carries its unit.
- One header style for every card (label row: 24px icon in a 36px slot, 14px title, 40×24 switch). Compare cards side by side on the dashboard, not one at a time.
- A filled circle signals a tap target. Keep it on tappable icons even inside a compact header; decorative header icons get none.
- Size the row for its tallest control (40px for a 24px switch) and check vertical alignment by measuring rects, then nudge text 1px for optical centring.
- Icons share a left edge, not a centre line. Measure every card's insets; adopt the insets of the stock cards on the same dashboard (Mushroom: 10px) and add air vertically instead.
- Header icons use Mushroom's 24px glyph in a 36px slot, so glyph and title positions match Mushroom cards exactly. Compare glyph rects (svg), not element boxes.
- Tiles in a grid are equal height (`grid-auto-rows: 1fr`). Add content by wrapping inside the tile, not by growing one tile.
- Mushroom's 10px are from the card's outer edge: its content overlaps the card border, so on a view with bordered cards (the subviews here; the Home view's theme has none) a plain 10px padding sits 1px right of Mushroom. Move the content row out with `margin: 0 calc(-1 * var(--ha-card-border-width, 1px))`. Never `calc(10px - var(--ha-card-border-width))` in a padding: themes set the width to a bare `0`, the calc goes invalid and the padding drops to 0 (the alert card on the home view, "looks horrendous"). Check every card on both a bordered and a borderless view.
- The same alert in two places is the same card with the same config – not a variant with its own text, links or circle ("It should be the exact same card… Not a new card").
- A card whose whole job is an alert doesn't glow: it keeps the theme's card background, and red goes on the glyph and the status line only ("I don't like it being red background. Keep the red icon and text"). Glow stays for tiles and rows inside a card.

## Interaction

- Don't re-render under the finger (update only changed nodes) and don't `transform` on `:active`.
- After a long-press opens a sheet, ignore clicks until 350 ms after the finger lifts.
- Benign bulk actions are immediate.
- Anything that moves hardware or cuts power asks first. Leave out what the user doesn't want on the card at all.
- Show one control per job: the plug pill only while on, the Power on button only while off. Powering hardware up confirms too.
- The printer keeps both ways off while on: the plug pill (cuts the power at once, after asking) and Power off (safe shutdown first). They are different jobs; don't merge them.
- A reading follows the circuit it measures, not the switch on the card (`power_sensor_switch`). While the machine is off and the strip is on, show the watts on their own: no toggle (the one-control rule still holds) and no glow. Never add a control for an upstream plug the user didn't ask to switch.
- A dashboard monitors a machine; it does not operate it. Offer power and convenience (light) only, and ask which other actions go when removing one.
- Confirmation belongs in the card (`confirmation` on the action, templated text), not in a pop-up card on every view. Fewer dependencies, one dialog look.
- The moment an icon gets an action it gets the Mushroom circle (36px, colour at 20%).
- Alignment is checked by measurement on every change: glyph x, title x (edge + 46), and one shared vertical centre for icon, text block and trailing control.
- Every number is its own tap target. The watts on a power pill open the power sensor, while On/Off still toggles.
- Went 44 → 40px on phones; then superseded by the size tiers below (primary pills 36px = icon circle on every screen; tap comfort comes from width, not height).
- Pills move to their own row only when they don't fit beside the content – decided by measuring natural widths (ResizeObserver), not by counting pills or by a breakpoint. Let secondary text wrap first. Pill height stays the same either way.
- Two pill tiers only: primary 36px (= icon circle) on every screen, secondary 30px (Armed chip, TV / A/C toggles, message row). Supersedes the 40/44px phone pills and the 44px printer action buttons.
- Subtext lines start on the title's vertical line, measured on ink: icon glyph bearings (thermometer 3px, water drop 2.5px off) and a leading "1" are corrected by the shared `inkAlign` helper in every card with text blocks. Check with glyph bboxes and canvas text metrics, then pixels.
- Every row: circle, text block and controls on one centre line, measured. `ha-icon` is always `inline-flex` (as a block its glyph sat 0.4–3px low on a text line). The home-status header was rebuilt as `[circle] [title + detail] [Armed]` instead of a chip on the title line only.
- Behaviour is consistent across items, even when one room has a single lamp.
- Sheet actions go below a divider. The main action is filled in the card's colour.
- A sheet closes with a round ✕ in its title row; a confirmation keeps a full-size, light-grey Cancel
  beside the confirm button (the user's pick of three mock-ups). A Close row in the rows' grey read as "a
  continuation of the tiles"; a `.28` grey gave "low contrast on text"; a dark-grey slab was "I don't like
  it". After the first rejection, show two or three options on the real pop-up instead of another guess.
  Apply it to every pop-up at once, including the cards inside integrations (washing machine, Roomstat).
- Reuse the icons the user already chose in their room views. Read them from the view config.
- The user picks icons. Align secondary bits with the line they belong to.
- Check the real timing: automations turned lights off within 3–5 min, so a 10 min threshold never fired. The default became 2 min.

## Layout and flow

- Prefer one coherent card per section over a stack of small cards. Reuse the same concept across sections.
- Think about the scroll order (context → shortcuts → per-room controls → later sections). Link deeper dashboards from a pill rather than embedding them.
- Global switches go in the section header, not in the tile grid.
- Design for what's coming next, but build only what was asked.
- One line that wraps in one tile makes every tile taller (equal rows). Before letting it wrap, win the space back by measuring: the tight phone spacing (6px tile sides, 6px icon gap) when that keeps every name and reading line whole. Judge it from where the text actually lands (line tops, heights), never by adding up rounded widths – a VOC 0.4px too wide slipped through that way. Never shrink the font, never cut the text.
- Lines that wrap keep their groups: a status and its readings share a line only if all fit; otherwise the status gets its own line and the readings stay together on the next (never a lone "VOC 80").

## Robot vacuum (Oct 2026)

- An attention state informs; it never disables an action. Only an unreachable device greys the controls out. If the machine refuses a job, its own error shows in the message row.
- An automation's on/off on a control card is a primary pill among the actions that glows while on (like the chamber light), not a switch row or a card of its own.
- Leave out device settings the user doesn't change from the dashboard, even when the integration exposes them.
- A handful of multi-option settings: chips that show the current values, opening a Bubble sheet of segmented selectors that apply at once. The card itself stays short.
- Offer only what applies in the current mode: hide whole rows the device ignores and filter options within a row. The user knows the device's rules better than the entity's option list – ask.
- Answer from the device's history (what it actually did last time), not from assumptions; then offer the manual control. Machine jobs glow while they run. → "add a confirmation dialogue to empty and clean mop": then "no, add confirmation to stop and … to dry too": every dock job asks before it starts and before it stops. Don't guess which ones are harmless – ask per action.
- One card per job: the vacuum (state, floor, map, rooms, Clean), its cleaning mode, and maintenance with the dock's jobs next to the tanks they belong to. Rooms sit in an even grid, not a ragged chip row; "OK" statuses shrink to one quiet line. When a card mixes three rows of look-alike chips, split it.
- When the user has a reference app, copy its structure (tabs, label + current value, icon segments, which options appear in which mode) in the house style; leave out what they exclude.
- A command the device takes seconds to confirm still updates the card at once: show the new state with a quiet "Loading…" until the device agrees, preload what the switch will show, and explain the real cause (the robot loads its map; Home Assistant waits for it).
- A settings entry that sits next to look-alike pills must look different in kind: a taller tile (radius 10, not a pill) with a tappable coloured circle, a title + current-value line and a chevron. Shape and size separate it, not glow (glow stays for active / needs you).
- A confirmation says the one thing the user must do, with the real name in it ("Place the robot on the Ground floor, then confirm."), not an explanation of what the system will do.
- Controls live with the thing they operate from the user's point of view (the robot's card), not with the data they relate to (the dock's tanks). Context-only controls appear only in their context.
- Order a card by what the user acts on most: the tanks become tiles with a drawn tank glyph (water level showing the reported state) at the top; the numbers sit below, quieter. Ask what matters most rather than giving every reading equal weight.
- Never draw a quantity you don't have. A glyph identifies the thing (a drop, a speckled drop); state goes in colour and words. A gauge, fill or bar needs a real number behind it.
- Here every control that sets the machine going, sends it home, changes its map or turns its automation on/off asks first; only the one that stops it (Pause) is immediate. The confirmation says what will happen with the real values (rooms, mode, suction, mop). Selecting rooms and changing settings in a sheet are not actions and stay instant.
- Consumables read best as a compact row of numbers with "Next: … in 13 h"; details, history and Reset are one tap away. Reset is the one action that asks first.
- Units stay with their numbers: each part of a status line is an unbreakable span and the line breaks only at the separators.
- A pick with tweaks is a go: redraw the mock-up with the changes so they can redirect, and build in parallel instead of waiting for a second approval.
- Name the action by its real scope. When the scope changes with context (a floor switch), the label says which.
- Secondary info about a card goes under its title as the title's second line, ink-aligned with the title and free to wrap – never squeezed into the title row's right side. A single-line title sits 1px low to centre on its icon, like everywhere else.
- Every item on a card snaps to a line something else already uses. A loose status line under tiles becomes a tile of its own (full width), so its circle and text share the tiles' x positions. Measure: same circle x, same text x.
- Write the colour convention down (design-tokens → Colours: one meaning per colour) and audit every card against it. Orange had crept in as "be careful" on Reset and Dock dialogs – but orange means lights/heat; a warning is amber in a status, and words in a dialog.
- A confirmation takes the colour of the control that opened it, both ways (teal pill → teal dialog, on or off). A warning goes in the words.
- The palette is decided: teal = you can tap/pick this, blue = running, green = good and someone home, amber = early warning, orange = lights/heat/power and the step before red, red = a call for attention, grey = off/decorative (design-tokens → Colours). Audit all cards against a new rule before calling it done, and ask the user to settle the meanings rather than inventing them.
- Updates compared `node.innerHTML !== html`, which is never equal after the browser serialises it (and ink alignment adds icon margins), so the readings were rewritten on every update and taps landed on removed nodes. Compare with the string you last wrote (`node._h`); fixed in every card.
- A picture from Home Assistant (an image or camera entity's `entity_picture`) carries its version in the address – the image entity's state, a thumbnail's job file. The token in the address only changes every 5 minutes and Safari (the iOS app) reuses a picture it has loaded, so a live map stood still until a pull-to-refresh. Test on the phone, not only desktop Chrome, which reloads it.
- Don't change a placement the user asked for to satisfy a new rule. Keep presence beside the name (compact "12m", 6px phone spacing as before); a name that doesn't fit wraps instead of being cut.
- A tinted circle says "tap me", and a tap target is never grey: with no state colour of its own it's teal. Grey stays only where it is a device's state (lights off, docked).
- Don't trade a layout the user likes for a rule: keep their column count and let long names wrap instead. A tile that leads to a dedicated dashboard is one tap target; per-value dialogs only where there's nowhere better to go (also applied to Energy).
- A pop-up opened from a device's own card doesn't name the device again. Its text sits under the title on the title's line and never repeats the title ("Reset main brush?" → "Only after fitting a new one: the countdown starts again…"); a stop dialog says the consequence, not "The dock stops X-ing". Check every pop-up when fixing one.
- The card's main action is filled with its colour (blue, white text and icon) – the one solid button on the card. Not a tint: tints already mean "on" (Auto clean, a running job).
- Word a maintenance action by what the owner actually does to that part: replaced parts say "Reset after replacing / fitting a new one", cleaned parts "Reset after cleaning / cleaning it". Don't give every consumable the same verb because the integration does.
- Size follows rank: the card's main job gets a call-to-action tier (44px, 14px text) above the 36px primary pill; secondary actions become the card's footer – a full-bleed rule, then quiet grey text buttons split by short dividers. A row of floating grey text with nothing around it reads as unfinished.
- Never truncate a label, and never wrap a short label (a name) inside a pill either. Rows of buttons: `display:flex; flex-wrap:wrap`, each pill `flex:1 1 0; min-width:max-content` – equal while everything fits, a longer label takes what it needs. Even grids of names: measure the names and set the columns – even columns as wide as the longest pill while two fit; else two columns each as wide as its own longest; else one. Check at 320, 360, 375 and desktop widths – the user's phone and font differ from yours.
- Rank a card's controls by its purpose before styling them. Secondary actions are quieter, not just different: text buttons (grey 12px, 16px icon, no fill, 30px) in one row under the primary pills. A bigger or tinted container makes them compete. Same pill + same size = same rank, to the eye.
- A short label still names its object when the verb alone is ambiguous next to its neighbours ("Dry mop", like "Wash mop").
- Offer a control only while the device will accept it: the robot refuses a map switch while the dock empties the bin or washes the mop, so the floors hide then too. A change shown before the device confirms it goes back at once when the call fails – never left showing for the timeout.
- A toggle says its state in words, not only in colour: "Auto clean when away" glowing while on, "Auto clean off" while off. Not a negated command ("Don't auto clean…") in a row of action buttons – it reads as what a tap does.
- Trust the device's own job flag over its headline state: a Roborock washing its mop before or between rooms reports Docked, but its in-cleaning flag is on and its counters have restarted, so the card shows the clean, not "Last clean · 0 m² · 0 min".

## Appliances (Oct 2026)

- Costs read in pence under a pound ("9p") and in pounds from a pound up ("£1.23") – on every card, chart label and tooltip, not just one card.
- One card per appliance: circle + "Name · Running" + the rule line, the printer's split power pill ("On | 252 W" while on, "Off" while off), and a strip of today's numbers (reading, On for / Off since, Today, Today's cost) with straight dividers.
- An appliance's circle shows its state: orange while on (power, like a lit room and the pill), grey while off. Teal is for a tap target with no state colour of its own; blue for the robot vacuum's jobs (a clean).
- A printer printing is an appliance that is on: its icon is orange like the washing machine washing and the purifier running on the same dashboard ("Voron icon should be consistent … as the rest of the devices when printing"), and its job bar follows the icon. Compare a state colour with the neighbouring cards on the dashboard, not only with the palette table.
- Say what the automation does in its own words: "On at 17:30", "Off at 09:00", "On above 62%" – never a vague "Auto".
- Times and thresholds live in helpers (input_datetime time-only, input_number) used by the automation's triggers and conditions; the card reads the same helpers. No copied numbers in the card config. A window that crosses midnight needs from/until time helpers, not a schedule helper (its blocks stop at midnight and it can't be read by non-admins).

## Bin day (Oct 2026)

- An alert's title says what to do, in the user's words: "Take the bins out tonight", not "Bins out
  tonight". When there is nothing to do, it states the fact, also in the user's words: "Bins to be
  collected today" (not "Bins collected today", and not "Take the bins back in").
- Strength follows the action: red for "do it now" (take the bins out), amber for a lighter
  heads-up on the day. Green would read as "nothing to do".
- Time each alert to the real event, from a helper: the collection-day alert starts when the
  lorry starts (07:00). Until then the take-out alert stays up, as "Take the bins out now" after
  midnight. There is no gap at night and no overlap for one collection.
- Two alerts about the same event (the evening before and the day itself) are dismissed
  independently. Each has its own Done helper, and the card refuses one shared helper.
- Shared dismissal goes in a helper keyed to the event (the collection's date), so it holds on
  every phone and resets itself for the next one, without an automation.
- Data that changes from outside (the council's dates, bank holidays) comes from an integration
  into a standard entity (a calendar). Don't copy the schedule into the card config.
- A fit check (does the pill stay beside the text?) compares exact sub-pixel widths, with no
  slack and no rounded `clientWidth`. A line 0.1px too wide wraps in the browser, and a 0.5px
  tolerance left "Garden" alone on a second line at 360px.

## Process

- Show ideas and a mock-up first, with every reading the old view had. Implement after the go-ahead.
- Ship through the repo and HACS, not hand-copied `/local` files.
- Screenshots come from the live dashboard at phone width. Label any example values.
- Stop and wait. Don't retry a different way.
