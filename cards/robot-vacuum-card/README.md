# Robot vacuum card

`custom:robot-vacuum-card` – a robot vacuum (built for Roborock, and it also drives a Matter
vacuum such as the DJI ROMO – see [Matter and other area vacuums](#matter-and-other-area-vacuums)):
state, floors, map, rooms, a Cleaning mode tile that opens the mode laid out like the Roborock app,
and the buttons.

```
┌──────────────────────────────────────────────────────┐      Cleaning mode sheet
│ (robot) Vacuum cleaner · Docked             (⚡) 100%  │      ┌────────────────────────────────────┐
│         Last clean Sat 10:00 · 22.6 m² · 28 min        │      │ (tune) Cleaning mode               │
│ [ First floor          |  Ground floor          ]      │      │ [ Vac & mop* |  Mop  |  Vacuum ]   │
│ ┌──────────────────────────────────────────────────┐ │      │ Suction power  Turbo               │
│ │                  floor map                        │ │      │ [ ☾ | ✇ | ✇* | ✇ ]                 │
│ └──────────────────────────────────────────────────┘ │      │ Scrub intensity & water flow  …    │
│ (Second Bedroom   ) (Master Bedroom    )              │      │ Cleaning count  1 time             │
│ (En-suite Bathroom) (Bathroom          )              │      │ Route  Standard                    │
│ (Upstairs Corridor) (Study             )              │      │ ( ✓ Done )                         │
│ ┌──────────────────────────────────────────────────┐ │      └────────────────────────────────────┘
│ │ (tune) Cleaning mode                            › │ │
│ │        Vac & mop · Turbo · Intense mop            │ │
│ └──────────────────────────────────────────────────┘ │
│ (   ▶ Clean entire floor    ) (     Auto clean      )  │
├──────────────────────────────────────────────────────┤
│    🗑 Empty     │    💧 Wash mop    │    ✇ Dry mop      │
└──────────────────────────────────────────────────────┘
```

## The card

- **Header**: the state in its colour (Docked and Idle grey, Cleaning and Returning orange like any
  appliance at work, Paused, Error and Needs you red, Offline grey) and a line that says something useful: "Last clean Sat 10:00 ·
  22.6 m² · 28 min" when docked, "Drying the mop · 2 h 10 min left" while the dock dries
  it, "Cleaning Study" / "Washing the mop" / "Going to wash the mop" during a clean, and
  "Emptying the bin" while the dock works. A clean washing its mop at the dock – before it
  starts or between rooms – shows as Cleaning (the robot's own cleaning flag), even though the
  vacuum entity says Docked, so the last clean's line never mixes with the new clean's zeros.
  The line wraps only between its parts. The battery pill shows the level with a charging icon, and
  glows red at 15% or less when it isn't charging. Tap the circle for the vacuum's
  more-info, and any value for its own.
- **Needs you**: red rows for robot errors, dock errors and the dock's tanks (empty the
  dirty water tank, refill the clean water tank), an amber row when the mop isn't
  attached in a mopping mode. A message never blocks a clean – the robot decides; if it
  refuses, its error shows here. Only an offline vacuum greys the buttons out.
- **Job**: progress, time and area while cleaning or paused, with a bar.
- **Floors**: one segment per map (`select.*_selected_map`), the pressed one being the map
  loaded on the robot. Tapping another asks ("Place the robot on the Ground floor, then
  confirm."), then switches the card to that floor at once –
  its map and rooms – with "Loading map…" until the robot has loaded it. If the robot refuses,
  the card goes straight back to its floor and shows Home Assistant's message. Every floor's map
  is loaded ahead. Hidden during a job, and while the robot is busy at the dock (emptying the
  bin, washing the mop) – it won't change maps then.
- **Map**: the floor's image entity, cropped to what is drawn and fitted to the card, live
  while cleaning: each new picture replaces the last as soon as it has loaded, on every device
  (the iOS app included) without reloading the page. Roborock publishes a new picture about
  every 30 s while cleaning – the integration's own pace. Tap it for the full image.
- **Rooms**: the loaded map's rooms in an even grid (from `roborock.get_maps`), with your
  Home Assistant area icons – an area of the same name, or one whose name is inside the
  room's ("Corridor" in "Upstairs Corridor"), else a guess from the name; set your own
  under `rooms:`. Every name stays whole on one line: the columns are as wide as the longest
  name needs (fewer columns rather than a cut or wrapped name). Tap rooms to build a clean (picked rooms turn teal): the button becomes **Clean 2 rooms** and
  sends `app_segment_clean` for those segments. During a job the room the robot is in is
  ringed and rooms can't be picked.
- **Cleaning mode tile**: what the next clean will use ("Vac & mop · Turbo · Intense mop",
  "· ×2" for two passes) under a teal tune icon (teal = tap me), with a chevron – a taller tile, so it never
  reads as one more room. A tap opens the Cleaning mode sheet (below).
- **Buttons** for the state – the card's main controls, so 44px pills, the one that sets the robot
  going (Clean, Resume) filled orange: Clean entire floor (or Clean N rooms) when idle, Pause and Dock while
  cleaning, Resume and Dock when paused, Pause while returning. Dock only shows when the
  robot is away from the dock. The buttons share the row evenly, but a longer label always
  gets the width it needs. Every button asks first except Pause; the clean's
  confirmation names the rooms, the cleaning count and the settings it will use ("Study
  and Upstairs Corridor, twice, Vac & mop · Turbo · Standard mop"). Dock warns when it
  ends a clean.
- **Auto clean** (optional, `auto_clean`): a pill that says its state – "Auto clean", glowing
  teal, while your automation (or switch) is on, "Auto clean off" in grey with a crossed-out
  icon while it is off; a tap asks, then turns it off or on; a hold opens its more-info.
- **Dock jobs** (only while the robot is docked): **Empty**, **Wash mop** and **Dry mop** as the
  card's footer – under a full-width rule, quiet grey text buttons split by short dividers –
  the dock's own switches, handy after stopping a clean early with Dock, without competing
  with Clean.
  The one that runs is tinted orange ("Drying"); each asks before it starts, and before it stops.

## Cleaning mode (the sheet, or `layout: mode`)

Like the Roborock app's mode panel, without Customize – in the tile's sheet, or as a card of
its own with `layout: mode`:

- **Tabs**: Vac & mop, Mop, Vacuum (`select.*_cleaning_mode`). A custom mode presses none.
- **Suction power** (Vacuum and Vac & mop; Max+ only in Vacuum), **Scrub intensity &
  water flow** (Mop and Vac & mop), **Route** (Fast and Standard; Deep and Deep+ only in
  Mop) – each a row of icon buttons with the current value written next to its name.
  `off` and `custom` only show when they are the current setting.
- **Cleaning count** ×1 / ×2 has no entity: the card keeps it per vacuum (remembered in
  this browser) and the vacuum card sends it with the clean – as the room clean's repeat,
  or, with no rooms picked, as a clean of every room on the floor, twice.
- A tap applies at once and shows at once; the robot's answer confirms it (a choice it
  doesn't take falls back after 45 s).

## Matter and other area vacuums

Any vacuum that is not a Roborock but supports Home Assistant's `CLEAN_AREA` feature – a Matter
robot such as the DJI ROMO P2 – gets the same card. The backend comes from the entity registry
and is checked on every update: the Roborock behaviour above when the vacuum's platform is
`roborock`; the area backend for a `matter` vacuum (even while it is unavailable) and for any other
vacuum that supports `CLEAN_AREA`; anything else keeps the Roborock behaviour, as before. The card
shows what such a vacuum exposes and leaves out the rest, with no gaps:

```yaml
type: custom:robot-vacuum-card
entity: vacuum.romo
auto_clean: automation.65_romo_clean_when_everyone_has_left_the_house
auto_clean_name: Auto clean when away
```

- **Header**: the state in the same colours. The line under the name only says something the state
  doesn't: "Charging" or "Returning to the dock" (from the `operational_state` sensor), and, while
  cleaning, "Cleaning Kitchen · Living Room" – only for a room clean started from this card (the
  vacuum doesn't report its room); a clean started elsewhere shows just the state. No battery pill
  and no "Last clean" line: a Matter vacuum has neither.
- **Needs you**: a red row when the `operational_error` sensor says anything but `no_error`
  ("Robot: dust bin full"). It never blocks a clean.
- **Rooms**: the Home Assistant areas mapped to the vacuum's segments (the vacuum's *Configure
  areas* mapping), sorted by area name, in the same grid. Each uses your `rooms:` icon, else the
  area's own icon, else the usual guess from its name. Tap rooms to build a clean: **Clean N rooms**
  calls `vacuum.clean_area` with `cleaning_area_id: [area ids]`. Without a mapping there is no rooms
  grid and nothing else changes.
- **Cleaning mode**: the `clean_mode` select ("Auto Vac And Mop"), as the tile ("Vac & mop · Auto") and
  the same sheet or `layout: mode` panel: tabs **Vac & mop / Mop / Vacuum** from each option's
  suffix, then one row of intensity buttons (Quick / Auto / Deep Clean / Quiet) with only the
  combinations that exist for the tab (Mop has no Quiet). A tab keeps the current intensity when it
  has it, else takes its first. A tap calls `select.select_option`. If any option doesn't parse, the
  sheet is a plain list of the options. Matter gives no suction, water, count or route.
- **Buttons**: Clean entire floor (`vacuum.start`, which clears any area selection), Clean N rooms,
  Pause (`vacuum.pause`), Resume (`vacuum.start`), Dock (`vacuum.return_to_base`) and the Auto clean
  pill. Every button asks first except Pause.
- **Not shown** because a Matter vacuum has no data for them: battery, map, floors, the job's
  progress, the dock's jobs, cleaning count, route, suction and water.

The rooms are read with `config/entity_registry/get` (the registry entry's
`options.vacuum.area_mapping`), which every user may call – the card never uses `vacuum/get_segments`,
which is admin only, so it works on a dashboard shared with non-admin users. It is read on the first
render and again when the entity's registry entry changes (a failed read is retried after a minute).
Entities are found by translation key on the vacuum's device: `clean_mode`, `operational_state`,
`operational_error`; `entities:` overrides them (`clean_mode`, `op_state`, `op_error`).

## Configuration

```yaml
# The vacuum
type: custom:robot-vacuum-card
entity: vacuum.vacuum_cleaner
auto_clean: automation.vacuum_when_everyone_has_left
auto_clean_name: Auto clean when away
rooms:
  En-suite Bathroom: { icon: mdi:shower }
  Downstairs Bathroom: { icon: mdi:toilet }

```

| Option | Default | |
|---|---|---|
| `entity` | – | The vacuum. Everything else is found from its device and its dock device. |
| `layout` | full | `mode` for the cleaning mode panel as a card of its own. |
| `name` | friendly name | Name in the header. |
| `title` | Cleaning mode | Title of the mode panel. |
| `auto_clean` | – | An automation, `input_boolean` or switch for the Auto clean pill. |
| `auto_clean_name` | Auto clean | The pill's label while it is on. |
| `auto_clean_off_name` | Auto clean off | The pill's label while it is off. |
| `rooms` | – | Per room (by the robot's room name, or the area's name for an area vacuum): `icon`, `name`, `hide: true`. |
| `hide_map`, `hide_rooms`, `hide_mode`, `hide_dock_actions` | false | Leave a part out (`hide_mode`: the Cleaning mode tile; `hide_dock_actions`: Empty / Wash mop / Dry mop). |
| `maps` | from `roborock.get_maps` | Your own rooms per map: `- name: First floor`, `rooms: {16: Bedroom, 17: Study}`. |
| `entities` | found | Override any entity the card finds (area vacuums: `clean_mode`, `op_state`, `op_error`): `battery`, `charging`, `status`, `error`, `dock_error`, `dirty_box`, `clean_box`, `water_shortage`, `mop_attached`, `area`, `time`, `progress`, `room`, `last_start`, `map_select`, `mode`, `mop_water`, `mop_route`, `drying`, `empty_sw`, `wash_sw`, `dry_sw`. |

Rooms need `roborock.get_maps` to answer over the websocket (it does for any user). A room
clean runs on the map loaded on the robot, which is why the floor switch is the robot's
selected map rather than a view filter. The dock's water tanks are on the
[Vacuum maintenance](../vacuum-maintenance-card/README.md) card.

## Version notes

- **2.10.0** – a Matter / `CLEAN_AREA` vacuum (DJI ROMO P2) is supported next to Roborock: rooms from
  the mapped areas, `vacuum.clean_area`, the `clean_mode` select as the Cleaning mode, the
  operational error. Roborock is unchanged.
