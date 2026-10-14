# Robot vacuum card

`custom:robot-vacuum-card` – a robot vacuum (built for Roborock) in one card.

```
┌──────────────────────────────────────────────────────┐
│ (robot) Vacuum cleaner · Docked             (⚡) 100%  │
│         Last clean Sat 10:00 · 22.6 m² · 28 min        │
│ [ First floor          |  Ground floor          ]      │
│ ┌──────────────────────────────────────────────────┐ │
│ │                  floor map                        │ │
│ └──────────────────────────────────────────────────┘ │
│ (Second Bedroom) (Master Bedroom) (Bathroom) (Study)  │
│ (Vac & mop) (Turbo) (Standard mop)                    │
│ (  ▶ Clean all  )  (  Auto clean  )                   │
│ (Empty) (Wash mop) (Dry)                              │
└──────────────────────────────────────────────────────┘
```

- **Header**: the state in its colour (Docked, Cleaning, Returning, Paused, Idle, Error,
  Needs you, Offline) and a line that says something useful: "Last clean Sat 10:00 ·
  22.6 m² · 28 min" when docked, "Drying the mop · 2 h 10 min left" while the dock dries
  it, "Cleaning Study" / "Washing the mop" / "Emptying the bin" during a clean. The
  battery pill shows the level with a charging icon, and glows red at 15% or less when
  it isn't charging. Tap the circle for the vacuum's more-info, and any value for its own.
- **Needs you**: red rows for robot errors, dock errors and the dock's tanks (empty the
  dirty water tank, refill the clean water tank), an amber row when the mop isn't
  attached in a mopping mode. A message never blocks a clean – the robot decides; if it
  refuses, its error shows here. Only an offline vacuum greys the buttons out.
- **Job**: progress, time and area while cleaning or paused, with a bar.
- **Floors**: one segment per map (`select.*_selected_map`). The pressed one is the map
  loaded on the robot; tapping another loads it (immediately – carry the robot first).
  Hidden during a job.
- **Map**: the floor's image entity, cropped to what is drawn and fitted to the card, live
  while cleaning. Tap it for the full image.
- **Rooms**: the loaded map's rooms as chips (from `roborock.get_maps`), with your Home
  Assistant area icons – an area of the same name, or one whose name is inside the room's
  ("Corridor" in "Upstairs Corridor"), else a guess from the name; set your own under
  `rooms:`. Tap rooms to build a clean: the button becomes **Clean 2 rooms** and sends
  `app_segment_clean` for those segments. During a job the room the robot is in is
  ringed and rooms can't be picked.
- **Cleaning settings**: chips for the mode, suction and mop water. Tapping one opens a
  sheet with Mode (Vacuum / Vac & mop / Mop), Suction, Mop water and Mop route as
  segmented selectors; a choice applies at once. Suction shows for Vacuum and Vac & mop,
  mop water and route for Vac & mop and Mop, and the Deep / Deep+ routes only for Mop;
  `off` and `custom` only show when they are the current setting.
- **Buttons** for the state: Clean all (or Clean N rooms) when idle, Pause and Dock while
  cleaning, Resume and Dock when paused, Pause while returning. Dock only shows when the
  robot is away from the dock. None of these ask first.
- **Auto clean** (optional, `auto_clean`): a pill that glows teal while your automation
  (or switch) is on; a tap turns it off or on, a hold opens its more-info.
- **Dock jobs** (while the robot is on the dock): **Empty**, **Wash mop** and **Dry** chips
  for the dock's own switches – handy after stopping a clean early with Dock. Each glows
  blue while it runs ("Drying · 2 h 10 min"). Each asks before it starts, and a tap on a
  running job asks before it stops it.

## Configuration

```yaml
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
| `name` | friendly name | Name in the header. |
| `auto_clean` | – | An automation, `input_boolean` or switch for the Auto clean pill. |
| `auto_clean_name` | Auto clean | The pill's label. |
| `rooms` | – | Per room (by the robot's room name): `icon`, `name`, `hide: true`. |
| `hide_map`, `hide_rooms`, `hide_settings`, `hide_dock_actions` | false | Leave a part out. |
| `maps` | from `roborock.get_maps` | Your own rooms per map: `- name: First floor`, `rooms: {16: Bedroom, 17: Study}`. |
| `entities` | found | Override any entity the card finds: `battery`, `charging`, `status`, `error`, `dock_error`, `dirty_box`, `clean_box`, `water_shortage`, `mop_attached`, `area`, `time`, `progress`, `room`, `last_start`, `map_select`, `mode`, `mop_water`, `mop_route`, `drying`, `empty_sw`, `wash_sw`, `dry_sw`. |

Rooms need `roborock.get_maps` to answer over the websocket (it does for any user). A room
clean runs on the map loaded on the robot, which is why the floor switch is the robot's
selected map rather than a view filter.
