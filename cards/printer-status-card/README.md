# Printer status card

`custom:printer-status-card` – a Klipper / Moonraker printer at a glance.

```
┌──────────────────────────────────────────────────────┐
│ (nozzle) Voron · Printing               (plug) On | 142 W │
│          bracket_v3.gcode                                   │
│ ┌──────┐ 62%  1 h 23 min left · ends 15:42                  │
│ │ img  │ ███████████████░░░░░░░░░                           │
│ └──────┘ Layer 141 / 230 · 12.3 m filament                  │
│          250 mm/s                                           │
│ ┌──────────────────── camera card ─────────────────────┐   │
│ └───────────────────────────────────────────────────────┘   │
│ (  Light  )                                                 │
└──────────────────────────────────────────────────────┘
```

- **Header**: state in its colour (Off grey, Ready grey, Printing blue, Paused amber,
  Complete green, Cancelled grey, Error red) and the printer's message – or the file name
  during a job. While the plug is on but the printer isn't answering it says **Please wait**,
  with why: "Shutting down" (the `power_off_script` is running), "Klipper is starting", or
  "Waiting for the printer". While the printer is off there is no second line – "Voron · Off"
  says it. Nothing is cut off: the name, the file name and the message wrap, and "Name ·
  State" breaks only before the state word. Tap the state circle (or the text) for the
  printer's more-info.
- **Power pill** (orange while on): shown while the plug is on, with its live watts. Tap On
  to turn the plug off: it asks first ("Turn the plug off" – orange, or red while a print is
  running, because cutting the power then ends the print). Tap the watts for the power sensor. When the plug is off the toggle goes away and the Power on button
  below takes its place. If the power sensor measures an upstream plug that also feeds
  other things (`power_sensor_switch`, e.g. a strip with the printer, a filament dryer and
  a screen), the watts stay – on their own, without the glow – whenever that plug is on.
- **Job**: thumbnail, progress, time left and finish time ("1 h 23 min left · ends 15:42"),
  layer, filament used and speed. Each part of a line stays whole; on a narrow card the line
  breaks only between parts. Stays up after the print as "Complete" / "Cancelled".
- **Idle**: energy used Today, Prints, hours Printed and kilometres of Filament.
- **Camera**: any card you like (e.g. Frigate card), shown inside this one – only while there is
  a picture: the printer must be reachable (plug on and Moonraker's printer state not
  unavailable) and the camera must actually serve an image. The card asks Home Assistant for a
  small still of the camera (`/api/camera_proxy/…`) every 15 s while hidden and every 60 s while
  shown; an error hides the camera card, so it never sits there trying to connect.
- **Buttons** are power only: Power on when the plug is off, a safe Power off when the
  printer is idle, nothing while it prints. Both are orange (power, like the pill) and both
  ask first, in an orange dialog whose title and button use the same words. The buttons share
  the row equally and never cut a label; if they don't fit, one wraps. Printer operations –
  homing, pause, resume, cancel, emergency stop – are left out on purpose: do those on the
  printer.
- **Chamber light** (optional, `light`): an extra button that glows while the light is
  on and shows its level when dimmed ("Light 25%"). A tap toggles it at once. For a
  Klipper output pin (a 0–100 `number`), on returns to the last level it had, or to
  `light_on` (default full). Hold the button for the light's more-info.
- **Tap any value** (progress, time left, finish time, layer, filament, speed,
  today's energy, totals, the state) for its own more-info.
- **Errors**: if Home Assistant refuses an action, its message shows; otherwise "Couldn't
  power on Voron." (or whatever you tried), with the name, never an entity id.

## Compact layout (overview pages)

`layout: compact` turns the card into one row for an overview page – the same states and
wording as the full card, nothing to operate:

- The icon in its state colour, "Voron · Printing 62%" (or Ready, Off, Please wait, Error…).
- Underneath, what matters now: the file name (wraps, no `.gcode`) and "1 h 23 min left ·
  ends 15:42" on its own line while printing, with an 8px progress bar; "file · finished 15:41"
  when complete; "Chamber 24° · 4 of 8 loaded" when ready (chamber sensor and Happy Hare lane
  sensors, when they exist); "Today 0.25 kWh" when off; the printer's message otherwise. Lines
  wrap only between their parts (times in 24-hour en-GB form).
- Live watts in a pill while the plug is on – or, with `power_sensor_switch`, whenever that
  upstream plug is on (without the glow while the printer itself is off).
- The icon and the watts stay centred on the text, however many lines it wraps to; padding and
  insets match Mushroom cards (56px high on one line).
- A tap anywhere opens `navigation_path` (e.g. `/lovelace/voron`), or the printer's state
  more-info if that isn't set.

```yaml
type: custom:printer-status-card
layout: compact
name: Voron
prefix: voron
power_switch: switch.voron
power_sensor: sensor.tasmota_energy_power_2
energy_today: sensor.tasmota_energy_today_2
navigation_path: /lovelace/voron
```

## Configuration

```yaml
type: custom:printer-status-card
name: Voron
prefix: voron
power_switch: switch.voron
power_sensor: sensor.tasmota_energy_power_2
energy_today: sensor.tasmota_energy_today_2
power_off_script: script.power_off_3d_printer
light: number.voron_output_pin_chamber_leds
camera_card:
  type: custom:frigate-card
  cameras:
    - camera_entity: camera.voron_camera
```

| Option | What it is |
|---|---|
| `prefix` | **Required.** The Moonraker integration prefix. The card reads `sensor.<prefix>_current_print_state`, `_printer_state`, `_printer_message`, `_current_display_message`, `_filename`, `_progress`, `_print_time_left`, `_print_eta`, `_current_layer`, `_total_layer`, `_filament_used`, `_print_speed`, `_totals_jobs`, `_totals_print_time`, `_totals_filament_used`. |
| `name` | Shown in the header. Default `Printer`. |
| `layout` | `full` (default) or `compact` – one row for an overview page (see above). |
| `navigation_path` | Compact: where a tap goes, e.g. `/lovelace/voron`. |
| `chamber_sensor` | Compact: the chamber temperature shown when ready (default `sensor.<prefix>_heater_chamber_temperature`). |
| `power_switch` | The printer's smart plug (`switch` or `input_boolean`). Without it there is no pill and the printer counts as powered. |
| `power_sensor` | Live watts for the pill. |
| `power_sensor_switch` | The plug the power sensor actually measures, when it is upstream of `power_switch` and feeds other things too (e.g. a power strip). The watts then show whenever this plug is on, even while the printer is off. Default: `power_switch`. Never switched by the card. |
| `energy_today` | kWh today, shown when idle. |
| `power_off_script` | A `script` or `button` that shuts the printer down safely and then cuts the plug. Without it there is no Power off button. |
| `light` | Chamber light: a `light`, `switch`, `input_boolean`, or a 0–100 `number` / `input_number` (e.g. Moonraker's `number.<prefix>_output_pin_chamber_leds`). Hidden while unavailable. |
| `light_name` | Button label. Default `Light`. |
| `light_on` | For a number: the level "on" sets when the card hasn't seen an earlier level. Default the maximum (100). |
| `camera_card` | Any card config, rendered inside the card. |
| `camera_entity` | Camera to test for a picture. Default: taken from `camera_card` (`cameras[0].camera_entity`, `camera_entity` or `entity`). |
| `thumbnail` | Camera entity with the job thumbnail. Default `camera.<prefix>_thumbnail`. |
