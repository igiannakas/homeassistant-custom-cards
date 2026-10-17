# Heating schedule card

`custom:heating-schedule-card` – every room's heating day on one card: a 24-hour bar per room, a
line at now, what comes next, and a tap on a room to change its times, which rooms get them and on
which days.

<p>
  <img src="../../docs/screenshots/heating-schedule-card.png" alt="heating-schedule-card: four rooms, each with its day as a bar" width="384">
</p>

- **The day as a bar.** One tile per room, with each block of the day in its mode's colour: Day
  amber, Night purple, Away blue, Off grey – the same colours as the Heating controls (climate
  modes) card. Each block shows what fits: its icon, name and the room's temperature for that mode
  ("Day 20°"), icon and temperature, or just the temperature. Hours run along the top, and a line
  marks now.
- **What's happening, in words.** Under the room's name: the temperature now and its target, then
  what comes next ("Night at 21:30"). When the room isn't following its schedule, the line says why
  instead: a mode set by hand ("Off by hand", "Boost by hand until 20:52"), "Window open", "Away ·
  nobody home", "Summer · heating locked". A **Resume** button puts a room set by hand back on its
  schedule. A switched-off schedule shows "Schedule off" with a **Turn on** button.
- **The tile glows orange while the room heats.** The circle shows the room's icon in the colour of
  the mode it's in now and opens the thermostat; so does the temperature.
- **The summary** under the title says the next change across the house: "Every room to Night at
  21:30", "Master Bedroom to Day at 09:30".
- **Rooms that share a schedule** show a small link next to their name. Changing one changes them
  all, unless you leave the others out in the editor.
- **A day strip** (Mon … Sun) appears once any room's days differ, to look at any day of the week.
  Today is in teal. While every day is the same, there's no strip.

## Editing

Tap a room. The sheet shows its day for the day on show:

- **Drag the dividers** on the big bar, or use the arrows by each start time. Times snap to quarter
  hours and stop a quarter hour short of the next change. With a keyboard, the dividers are sliders
  (arrow keys).
- **Pick each block's mode** (Day, Night, Away, Off – the options of the room's schedule helper).
- **Add a change** splits the longest block in the middle. The bin icon removes a change; the time
  it covered goes to the block before it (for the first block, to the one after).
- **Rooms:** the room you tapped, plus the rooms that share its schedule, are picked. Leave one out
  and it keeps its current times on its own schedule. Pick another room to copy these times to it.
- **Days:** every day, the weekdays or the weekend, or just the day on show. Pick fewer days than
  the schedule has and the other days keep their current times. Pick more and the card says which
  days it replaces.
- **Save** works out what to change in Scheduler and does it with Scheduler's own services:
  - a schedule whose rooms and days are all changing gets the new times;
  - a schedule losing some of its days keeps the rest;
  - a room leaving a shared schedule takes its old times, for the days that don't change, to a
    schedule of its own;
  - two schedules left with the same rooms and the same times (a weekend split undone) are merged
    into one;
  - new schedules are named after their rooms and days ("Master Bedroom heating (Weekend)"), and a
    schedule whose rooms or days change is renamed to match. Its switch's entity id changes with the
    name, as Scheduler does.
- **Cancel** or Escape closes without saving. A tap beside the sheet closes it only while nothing
  has changed, so edits aren't lost to a stray tap. If a call fails, the sheet stays open with Home
  Assistant's message, and the card reads the schedules again.

The sheet warns before saving over something it doesn't show: a schedule with conditions,
sunrise/sunset times or a date range (saving replaces them with the times shown), or a schedule
that is switched off (saving switches it on).

## Configuration

```yaml
type: custom:heating-schedule-card
rooms:
  - climate: climate.living_room_thermostat
    schedule: input_select.living_room_heating_schedule
    name: Living Room
    icon: mdi:sofa
  - climate: climate.master_bedroom_thermostat
    schedule: input_select.master_bedroom_heating_schedule
    name: Master Bedroom
    icon: mdi:bed-king
```

| Option | What it is |
|---|---|
| `rooms` | Required. Each room's `climate` (its thermostat) and `schedule`: the `input_select` (or `select`) that Scheduler sets for it. `name` and `icon` default to the room's area. |
| `title` | Default "Heating schedule". |
| `icon` | The label icon. Default `mdi:calendar-clock`. |
| `modes` | How each helper option shows, if not the defaults: a map from the option to `name`, `icon`, `color` (a Home Assistant colour name or hex) and `preset` (the thermostat preset whose temperature to show). |

Default modes:

| Helper option | Shown as | Colour | Temperature from |
|---|---|---|---|
| `comfort` | Day, `mdi:weather-sunny` | amber | the thermostat's comfort preset |
| `night` (or `eco`) | Night, `mdi:weather-night` | purple | its eco preset |
| `away` | Away, `mdi:home-export-outline` | blue | its away preset |
| `frost_protection` | Off, `mdi:radiator-off` | grey | its frost protection preset |

Any other option shows under its own name, in grey.

## The data behind it

- **Schedules:** the [Scheduler integration](https://github.com/nielsfaber/scheduler-component)
  (HACS). The card reads every schedule over Scheduler's websocket API (`scheduler`) and picks the
  ones with actions that set a room's helper (`input_select.select_option` / `select.select_option`).
  It re-reads them whenever Scheduler reports a change (`scheduler_updated`), so changes made
  elsewhere – the Scheduler card, another phone – show at once. Saving uses `scheduler.edit`,
  `scheduler.add`, `scheduler.remove` and `switch.turn_on`. A schedule's other actions (a lamp in
  the same schedule, say) stay where they are.
- **Days:** `daily`, `workday`, `weekend` and single days are all read. Workday and weekend are drawn
  as Monday–Friday and Saturday–Sunday (Scheduler itself asks the workday sensor, which also knows
  the bank holidays). New schedules are written with plain days.
- **Times:** fixed times are drawn as they are. Sunrise and sunset times are placed with today's
  sunrise and sunset from `sun.sun`. A slot without a stop time holds until the next one.
  Scheduler runs in Home Assistant's time zone, and so does the card's clock.
- **The thermostat:** `current_temperature`, `temperature`, `preset_mode` and `hvac_action` from the
  climate entity. With [Roomstat](https://github.com/igiannakas/ha-roomstat) it also reads
  `schedule_override_active` / `schedule_override_until`, `window_open_active`,
  `presence_away_active` and `summer_mode_active`, and Resume calls
  `climate.set_preset_mode` with `schedule`.
- **Mode temperatures:** the thermostat's own preset numbers. For Roomstat these are the number
  entities on the same device with the translation key `<preset>_target`. Without them, the card
  looks for `number.<thermostat>_<option>_temperature`.
