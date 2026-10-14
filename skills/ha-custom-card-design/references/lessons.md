# Lessons – what the user said, and the rule it became

This is a log from building the `homeassistant-custom-cards` set: home status, room
lights, energy summary, weather & presence, climate modes, air quality, printer status, robot vacuum,
printer temperatures, MMU lanes and enclosure filter. Read it before proposing a design.
Most of these generalise to any dashboard.

## Content: show what matters, drop what doesn't

| Feedback | Rule |
|---|---|
| "8 of 15 lights on is nice but meaningless… which room they are in is already visible underneath" | A header must *do* something (here: a one-tap all on/off) or say something new. Don't repeat the tiles below. |
| "I don't care about seeing the % of brightness per room… controlled automatically (adaptive lighting)" | Don't show values an automation owns. Ask what is automated. |
| "The heating areas below are not all the rooms. Some are not controllable." | Don't assume entity lists line up across domains. Ask, or derive from what exists. |
| "Keep it compact… now, today, yesterday, month so far and costs… no sparkline and breakdowns. These are visible in the next dashboard" | A summary card stays a summary. Detail lives one tap away. |
| "Remove: Buffer: tension" | Leave out internals the user doesn't act on, even when they're available. |
| "Stealthmax should remove manual calibration… fold it in the intake/exhaust list as VOC (manual)" | Group a reading with the thing it describes (each side), not in a leftover "extras" line. |
| "dry is <20%, medium 20–40%, wet beyond that" | Thresholds come from the user's world. Make them options with their defaults. |
| "Corridor has 2 temp and humidity sensors… show both" | Support several sensors per slot (`21.1/21.7°`) without breaking the layout. |

## Look: match the neighbours exactly

| Feedback | Rule |
|---|---|
| "are the room icons the same size as the rest… they feel smaller?" | Icons are 24px in a 36px shape, like Mushroom. Measure against a neighbour card. |
| "the font color looks off? more 'black' than the other titles" | Names are 14px / 500, not 600. Use the theme's text colours, never hard-coded black. |
| "check out the font colors/sizes in the pop up!" | Pop-ups copy the existing Bubble pop-ups (20px title, 56px rows, 16px / 600). |
| "font sizes are off between the label and the value" / "the elevated and CO2 and voc font size is different to PM" | One type style for every reading on a card. Status words match the readings. |
| "The font on off/away/night etc is larger than the fonts on the other elements… especially in mobile" | Mode labels are 12px. Check on a phone, where differences are most visible. |
| "temp, humidity and lux icons are too bright… drown out the purpose" → tried dark grey → "no revert. The room name gets lost as its too grey" → chose "lit rooms glow + softer colours and quiet grey on the secondary information" | Hierarchy: primary state gets colour and glow, names stay strong, secondary information is quiet. When a fix overshoots, revert and offer options. |
| "lx suffix is missing" | Every reading carries its unit. |
| "All lights toggle and heating summer mode toggle are different sizes. Same for the all lights, heating, air quality header text" | One header style for every card (label row: 18px icon, 14px title, 40×24 switch). Compare cards side by side on the dashboard, not one at a time. |
| "All lights icon is tappable. Breaking design convention by removing the circle around it" | A filled circle signals a tap target. Keep it on tappable icons even inside a compact header; decorative header icons get none. |
| "The headers need a bit more padding top/bottom as the switch is too large for the space" / "the words are not aligned to the icons (slightly higher)" | Size the row for its tallest control (40px for a 24px switch) and check vertical alignment by measuring rects, then nudge text 1px for optical centring. |
| "the non circled icons are not aligned at the same X offset" / "Review again all alignments" / "the dashboard feels a bit cramped" → "keep it consistent with Mushroom cards" | Icons share a left edge, not a centre line. Measure every card's insets; adopt the insets of the stock cards on the same dashboard (Mushroom: 10px) and add air vertically instead. |
| "the icon needs to be the same size as the mushroom card icon and nudged a bit to the right" | Header icons use Mushroom's 24px glyph in a 36px slot, so glyph and title positions match Mushroom cards exactly. Compare glyph rects (svg), not element boxes. |
| "it breaks the card height uniformity" | Tiles in a grid are equal height (`grid-auto-rows: 1fr`). Add content by wrapping inside the tile, not by growing one tile. |

## Interaction

| Feedback | Rule |
|---|---|
| "the tapping of the buttons doesn't always seem to register" | Don't re-render under the finger (update only changed nodes) and don't `transform` on `:active`. |
| "the pop up card disappears immediately after it appears unless I move my finger" | After a long-press opens a sheet, ignore clicks until 350 ms after the finger lifts. |
| "All off/on should trigger immediately, no confirmation" | Benign bulk actions are immediate. |
| "home and power off should trigger a pop up to confirm action" / "remove the estop button" | Anything that moves hardware or cuts power asks first. Leave out what the user doesn't want on the card at all. |
| "the off button shouldn't show when the printer is off… only the bottom power on button" / "clicking power on should require confirmation" | Show one control per job: the plug pill only while on, the Power on button only while off. Powering hardware up confirms too. |
| "I need the power consumption … visible always when that upstream plug is on" / "I do not need to control that plug separately anywhere" (energy metered on a strip feeding the printer, its dryer and screen; the printer has its own plug) | A reading follows the circuit it measures, not the switch on the card (`power_sensor_switch`). While the machine is off and the strip is on, show the watts on their own: no toggle (the one-control rule still holds) and no glow. Never add a control for an upstream plug the user didn't ask to switch. |
| "remove the home button… Any dangerous printer operations should be done on the printer, not on Home Assistant" → also removed Pause/Resume and Cancel | A dashboard monitors a machine; it does not operate it. Offer power and convenience (light) only, and ask which other actions go when removing one. |
| "These are bubble card pop ups right? … are they needed?" → "Do it" (built-in confirmation) | Confirmation belongs in the card (`confirmation` on the action, templated text), not in a pop-up card on every view. Fewer dependencies, one dialog look. |
| "make the icon navigate to …/climate" → "as it's clickable it has to be in a circular background like the mushroom cards" | The moment an icon gets an action it gets the Mushroom circle (36px, colour at 20%). |
| "cross check alignment as always" (toggle not centred on icon + two text lines; titles 2px short of Mushroom) | Alignment is checked by measurement on every change: glyph x, title x (edge + 46), and one shared vertical centre for icon, text block and trailing control. |
| "Tapping on any value should show the more info for that value" | Every number is its own tap target. The watts on a power pill open the power sensor, while On/Off still toggles. |
| "The tap targets for home/climate are too small for mobile" → later "those buttons are a bit too large" (at 44px) | Went 44 → 40px on phones; then superseded by the size tiers below (primary pills 36px = icon circle on every screen; tap comfort comes from width, not height). |
| "And this is needlessly placed underneath" (a lone Home pill on its own row) → "we can still keep these on the right hand side for iphone 17 pro max size screens" (two pills) | Pills move to their own row only when they don't fit beside the content – decided by measuring natural widths (ResizeObserver), not by counting pills or by a breakpoint. Let secondary text wrap first. Pill height stays the same either way. |
| "Primary pills should be the same height as the icons with round circles behind them" / "Secondary pills & tap targets can be smaller" | Two pill tiers only: primary 36px (= icon circle) on every screen, secondary 30px (Armed chip, TV / A/C toggles, message row). Supersedes the 40/44px phone pills and the 44px printer action buttons. |
| "Again alignment is off here. Design rule is that subtext has to be aligned on the same Y line as the preceeding text above" (thermometer under "Partly cloudy" / "Living Room") | Subtext lines start on the title's vertical line, measured on ink: icon glyph bearings (thermometer 3px, water drop 2.5px off) and a leading "1" are corrected by the shared `inkAlign` helper in every card with text blocks. Check with glyph bboxes and canvas text metrics, then pixels. |
| "dont violate the alignment rule… icons (temp and metoffice) are not v aligned to their corresponding text. Same for the weather tap target, total text block, and the pills" | Every row: circle, text block and controls on one centre line, measured. `ha-icon` is always `inline-flex` (as a block its glyph sat 0.4–3px low on a text line). The home-status header was rebuilt as `[circle] [title + detail] [Armed]` instead of a chip on the title line only. |
| "second bedroom and kitchen show me the more info dialogue instead of the pop up" | Behaviour is consistent across items, even when one room has a single lamp. |
| "Open room needs a different placement & color. Like the call to action button" + "add a separator" | Sheet actions go below a divider. The main action is filled in the card's colour. |
| "the lights inside the room need to mirror their images as in the room detail tab" | Reuse the icons the user already chose in their room views. Read them from the view config. |
| "use the mdi:motion-sensor icon", "align the minutes with the room title" | The user picks icons. Align secondary bits with the line they belong to. |
| "the 'lights are on but no presence' doesn't work for … living room" | Check the real timing: automations turned lights off within 3–5 min, so a 10 min threshold never fired. The default became 2 min. |

## Layout and flow

| Feedback | Rule |
|---|---|
| "a single unified card for the lights would be nice" / "make these into one card too, similar styling concept" | Prefer one coherent card per section over a stack of small cards. Reuse the same concept across sections. |
| "I am not sure about the climate placement. It will visually break up the design and flow" → "maybe the climate needs to be another pill" | Think about the scroll order (context → shortcuts → per-room controls → later sections). Link deeper dashboards from a pill rather than embedding them. |
| "I would like summer mode as a toggle on the header of the heating tab" | Global switches go in the section header, not in the tile grid. |
| "Don't include it yet but consider the flow" (cooling) | Design for what's coming next, but build only what was asked. |

## Robot vacuum (Oct 2026)

| Feedback | Rule |
|---|---|
| "Needs you doesn't stop us from cleaning? Only if the vacuum is offline?" | An attention state informs; it never disables an action. Only an unreachable device greys the controls out. If the machine refuses a job, its own error shows in the message row. |
| "Auto clean should be a 'button pill' instead of an on/off button" | An automation's on/off on a control card is a primary pill among the actions that glows while on (like the chamber light), not a switch row or a card of its own. |
| "Do not disturb remove it" | Leave out device settings the user doesn't change from the dashboard, even when the integration exposes them. |
| "I need a selection for the cleaning modes" → "keep the settings sheet, it's good" | A handful of multi-option settings: chips that show the current values, opening a Bubble sheet of segmented selectors that apply at once. The card itself stays short. |
| "Mop mode deep and deep plus applies only when mopping… Suction power applies only to vac + mop and vac" | Offer only what applies in the current mode: hide whole rows the device ignores and filter options within a row. The user knows the device's rules better than the entity's option list – ask. |
| "Dock → does it also empty the vacuum and clean the mop?" → "yes, add Empty / Wash mop / Dry" | Answer from the device's history (what it actually did last time), not from assumptions; then offer the manual control. Machine jobs glow while they run. → "add a confirmation dialogue to empty and clean mop": then "no, add confirmation to stop and … to dry too": every dock job asks before it starts and before it stops. Don't guess which ones are harmless – ask per action. |
| "It's too cluttered like so" (rooms, settings and dock-job chips, plus pills, stacked on one card) → picked "Mode card, like the app" | One card per job: the vacuum (state, floor, map, rooms, Clean), its cleaning mode, and maintenance with the dock's jobs next to the tanks they belong to. Rooms sit in an even grid, not a ragged chip row; "OK" statuses shrink to one quiet line. When a card mixes three rows of look-alike chips, split it. |
| "The vac and mop, turbo and intense mop options need to be select buttons. Mirror what the Roborock app does. Without the customise button" | When the user has a reference app, copy its structure (tabs, label + current value, icon segments, which options appear in which mode) in the house style; leave out what they exclude. |
| "It's really slow to switch floors. Why?" | A command the device takes seconds to confirm still updates the card at once: show the new state with a quiet "Loading…" until the device agrees, preload what the switch will show, and explain the real cause (the robot loads its map; Home Assistant waits for it). |
| "let's merge the cleaning mode as you had option b before. But make the cleaning mode visually 'obvious' so it doesn't merge in visually with the rooms" | A settings entry that sits next to look-alike pills must look different in kind: a taller tile (radius 10, not a pill) with a tappable coloured circle, a title + current-value line and a chevron. Shape and size separate it, not glow (glow stays for active / needs you). |
| "the pop up for changing floors should just say place robot to the 'corresponding' floor then confirm" | A confirmation says the one thing the user must do, with the real name in it ("Place the robot on the Ground floor, then confirm."), not an explanation of what the system will do. |
| "Empty wash mop and dry belong in the main card. They should show only when the robot is docked." | Controls live with the thing they operate from the user's point of view (the robot's card), not with the data they relate to (the dock's tanks). Context-only controls appear only in their context. |
| "I care more about the water status vs the maintenance %s. Make the water statuses more prominent. Maybe with some fancy icons too" | Order a card by what the user acts on most: the tanks become tiles with a drawn tank glyph (water level showing the reported state) at the top; the numbers sit below, quieter. Ask what matters most rather than giving every reading equal weight. |
| "The water level fullness doesnt represent anything..." (tank glyphs drawn full / low for a sensor that only says OK / empty / full) | Never draw a quantity you don't have. A glyph identifies the thing (a drop, a speckled drop); state goes in colour and words. A gauge, fill or bar needs a real number behind it. |
| "pause only is immediate" (robot vacuum) | Here every control that sets the machine going, sends it home, changes its map or turns its automation on/off asks first; only the one that stops it (Pause) is immediate. The confirmation says what will happen with the real values (rooms, mode, suction, mop). Selecting rooms and changing settings in a sheet are not actions and stay instant. |
| "The maintenance bit should be the one from option C" (a row of numbers, over tiles with bars) | Consumables read best as a compact row of numbers with "Next: … in 13 h"; details, history and Reset are one tap away. Reset is the one action that asks first. |
| Status line rendered "… 22.6 m² · 28 / min" at 375px | Units stay with their numbers: each part of a status line is an unbreakable span and the line breaks only at the separators. |
| Picked option B "but" with five changes | A pick with tweaks is a go: redraw the mock-up with the changes so they can redirect, and build in parallel instead of waiting for a second approval. |
| "clean all should be renamed to Clean entire floor" | Name the action by its real scope. When the scope changes with context (a floor switch), the label says which. |
| "vertical alignment on the Next:... is wrong. Also it doesnt wrap." (a right-aligned "Next:" squeezed beside the title) | Secondary info about a card goes under its title as the title's second line, ink-aligned with the title and free to wrap – never squeezed into the title row's right side. A single-line title sits 1px low to centre on its icon, like everywhere else. |
| "auto empty max → its not aligned to anything! It should be aligned to the icons and tap buttons for clean water" | Every item on a card snaps to a line something else already uses. A loose status line under tiles becomes a tile of its own (full width), so its circle and text share the tiles' x positions. Measure: same circle x, same text x. |
| "The clean entire floor and auto clean pills are primary pills -> should be bigger, no? For the empty, wash mop and dry mop maybe consider a 'separator'… They don't look good either still" | Size follows rank: the card's main job gets a call-to-action tier (44px, 14px text) above the 36px primary pill; secondary actions become the card's footer – a full-bleed rule, then quiet grey text buttons split by short dividers. A row of floating grey text with nothing around it reads as unfinished. |
| "text is clipped" ("Downstairs Bathro…" in a room pill) → "same text clipping" ("Wash m…") → wrapping the name inside its pill: "This is even worse" | Never truncate a label, and never wrap a short label (a name) inside a pill either. Rows of buttons: `display:flex; flex-wrap:wrap`, each pill `flex:1 1 0; min-width:max-content` – equal while everything fits, a longer label takes what it needs. Even grids of names: measure the names and set the columns – even columns as wide as the longest pill while two fit; else two columns each as wide as its own longest; else one. Check at 320, 360, 375 and desktop widths – the user's phone and font differ from yours. |
| "This is not visually distinct to the clean and auto clean actions" (Empty / Wash mop / Dry mop as a second row of the same pills) → a tile of icon-over-label buttons: "again doesn't work visually. The primary objective of the card is to select the rooms, view/change cleaning mode and get going… Empty/wash/dry should be … secondary actions" | Rank a card's controls by its purpose before styling them. Secondary actions are quieter, not just different: text buttons (grey 12px, 16px icon, no fill, 30px) in one row under the primary pills. A bigger or tinted container makes them compete. Same pill + same size = same rank, to the eye. |
| "dry is dry mop" | A short label still names its object when the verb alone is ambiguous next to its neighbours ("Dry mop", like "Wash mop"). |

## Process

| Feedback | Rule |
|---|---|
| "Provide some ideas. I need all the info there." → mock-up → "go and implement them" | Show ideas and a mock-up first, with every reading the old view had. Implement after the go-ahead. |
| "implement it and also push to the repo" / "via hacs" | Ship through the repo and HACS, not hand-copied `/local` files. |
| "update my github repo with screenshots" | Screenshots come from the live dashboard at phone width. Label any example values. |
| User rejects a tool call | Stop and wait. Don't retry a different way. |
