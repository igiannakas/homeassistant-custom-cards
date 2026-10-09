# MMU lanes card

`custom:mmu-lanes-card` – every lane of a Happy Hare MMU (e.g. an EMU) at a glance.

```
┌──────────────────────────────────────────────────────┐
│ (tray) EMU lanes          3 of 4 loaded · Buffer: neutral │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│ │ Lane 0 ● │ │ Lane 1 ✻● │ │ Lane 2 ○ │ │ Lane 3 ● │      │
│ │ 32%      │ │ 44%      │ │ 51%      │ │ 38%      │      │
│ │ 24.0°    │ │ 24.1°    │ │ 24.2°    │ │ 24.3°    │      │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│ ● loaded ○ empty  ● <40% dry ● 40–50% ● >50% humid        │
└──────────────────────────────────────────────────────┘
```

- **Lane**: loaded (filled) or empty (outline, name greyed), humidity coloured
  green / amber / orange, temperature, and a fan icon while the lane is drying.
- **Label row**: how many lanes are loaded and the filament buffer
  (tension / compression / neutral).
- Lanes are counted automatically. Two columns on a narrow card.
- Tap a lane for its humidity sensor.

## Configuration

```yaml
type: custom:mmu-lanes-card
prefix: voron
title: EMU lanes
```

| Option | What it is |
|---|---|
| `prefix` | **Required.** The Moonraker integration prefix. Per lane `n` the card reads `binary_sensor.<prefix>_mmu_entry_<n>`, `sensor.<prefix>_unit<u>_env<n>_humidity`, `_env<n>_temp` and `_fan<n>`; the buffer from `binary_sensor.<prefix>_unit<u>_filament_tension` / `_filament_compression`. |
| `title` | Label row title. Default `MMU lanes`. |
| `unit` | MMU unit number, default 0. |
| `lanes` | Number of lanes; default is every lane found. |
| `names` | List of lane names, e.g. `[PLA black, PETG white]`. |
| `columns` | Lanes per row, default 4 (2 on a narrow card). |
| `humidity_thresholds` | `[dry, humid]`, default `[40, 50]`. |
| `legend` | Show the legend line, default `true`. |
