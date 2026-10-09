# Lessons – what the user said, and the rule it became

This is a log from building the `homeassistant-custom-cards` set: home status, room
lights, energy summary, weather & presence, climate modes, air quality, printer status,
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
| "it breaks the card height uniformity" | Tiles in a grid are equal height (`grid-auto-rows: 1fr`). Add content by wrapping inside the tile, not by growing one tile. |

## Interaction

| Feedback | Rule |
|---|---|
| "the tapping of the buttons doesn't always seem to register" | Don't re-render under the finger (update only changed nodes) and don't `transform` on `:active`. |
| "the pop up card disappears immediately after it appears unless I move my finger" | After a long-press opens a sheet, ignore clicks until 350 ms after the finger lifts. |
| "All off/on should trigger immediately, no confirmation" | Benign bulk actions are immediate. |
| "home and power off should trigger a pop up to confirm action" / "remove the estop button" | Anything that moves hardware or cuts power asks first. Leave out what the user doesn't want on the card at all. |
| "Tapping on any value should show the more info for that value" | Every number is its own tap target. The watts on a power pill open the power sensor, while On/Off still toggles. |
| "The tap targets for home/climate are too small for mobile" | Pills are 44px on phones and fill the row. |
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

## Process

| Feedback | Rule |
|---|---|
| "Provide some ideas. I need all the info there." → mock-up → "go and implement them" | Show ideas and a mock-up first, with every reading the old view had. Implement after the go-ahead. |
| "implement it and also push to the repo" / "via hacs" | Ship through the repo and HACS, not hand-copied `/local` files. |
| "update my github repo with screenshots" | Screenshots come from the live dashboard at phone width. Label any example values. |
| User rejects a tool call | Stop and wait. Don't retry a different way. |
