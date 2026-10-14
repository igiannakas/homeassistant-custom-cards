# Robot vacuum card

`custom:robot-vacuum-card` – a robot vacuum (built for Roborock): state, floors, map, rooms,
a Cleaning mode tile that opens the mode laid out like the Roborock app, and the buttons.

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
│ (    ▶ Clean all     ) (     Auto clean     )         │
└──────────────────────────────────────────────────────┘
```

## The card

- **Header**: the state in its colour (Docked, Cleaning, Returning, Paused, Idle, Error,
  Needs you, Offline) and a line that says something useful: "Last clean Sat 10:00 ·
  22.6 m² · 28 min" when docked, "Drying the mop · 2 h 10 min left" while the dock dries
  it, "Cleaning Study" / "Washing the mop" / "Emptying the bin" during a clean. The line
  wraps only between its parts. The battery pill shows the level with a charging icon, and
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
  its map and rooms – with "Loading map…" until the robot has loaded it. Every floor's map
  is loaded ahead. Hidden during a job.
- **Map**: the floor's image entity, cropped to what is drawn and fitted to the card, live
  while cleaning. Tap it for the full image.
- **Rooms**: the loaded map's rooms in an even grid (from `roborock.get_maps`), with your
  Home Assistant area icons – an area of the same name, or one whose name is inside the
  room's ("Corridor" in "Upstairs Corridor"), else a guess from the name; set your own
  under `rooms:`. Tap rooms to build a clean: the button becomes **Clean 2 rooms** and
  sends `app_segment_clean` for those segments. During a job the room the robot is in is
  ringed and rooms can't be picked.
- **Cleaning mode tile**: what the next clean will use ("Vac & mop · Turbo · Intense mop",
  "· ×2" for two passes) under a blue tune icon, with a chevron – a taller tile, so it never
  reads as one more room. A tap opens the Cleaning mode sheet (below).
- **Buttons** for the state: Clean all (or Clean N rooms) when idle, Pause and Dock while
  cleaning, Resume and Dock when paused, Pause while returning. Dock only shows when the
  robot is away from the dock. Every button asks first except Pause; the clean's
  confirmation names the rooms, the cleaning count and the settings it will use ("Study
  and Upstairs Corridor, twice, Vac & mop · Turbo · Standard mop"). Dock warns when it
  ends a clean.
- **Auto clean** (optional, `auto_clean`): a pill that glows teal while your automation
  (or switch) is on; a tap asks, then turns it off or on; a hold opens its more-info.

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

## Configuration

```yaml
# The vacuum
type: custom:robot-vacuum-card
entity: vacuum.vacuum_cleaner
auto_clean: automation.vacuum_when_everyone_has_left
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
| `auto_clean_name` | Auto clean | The pill's label. |
| `rooms` | – | Per room (by the robot's room name): `icon`, `name`, `hide: true`. |
| `hide_map`, `hide_rooms`, `hide_mode` | false | Leave a part out (`hide_mode`: the Cleaning mode tile). |
| `maps` | from `roborock.get_maps` | Your own rooms per map: `- name: First floor`, `rooms: {16: Bedroom, 17: Study}`. |
| `entities` | found | Override any entity the card finds: `battery`, `charging`, `status`, `error`, `dock_error`, `dirty_box`, `clean_box`, `water_shortage`, `mop_attached`, `area`, `time`, `progress`, `room`, `last_start`, `map_select`, `mode`, `mop_water`, `mop_route`, `drying`. |

Rooms need `roborock.get_maps` to answer over the websocket (it does for any user). A room
clean runs on the map loaded on the robot, which is why the floor switch is the robot's
selected map rather than a view filter. The dock's own jobs (Empty, Wash mop, Dry) are on
the [Vacuum maintenance](../vacuum-maintenance-card/README.md) card, next to its tanks.
