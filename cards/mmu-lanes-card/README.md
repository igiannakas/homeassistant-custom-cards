# MMU lanes card

`custom:mmu-lanes-card` – every lane of a Happy Hare MMU (e.g. an EMU) at a glance.

<p>
  <img src="../../docs/screenshots/mmu-lanes-card.png" alt="mmu-lanes-card" width="384">
</p>

- **Lane**: loaded (filled, **green** – good, ready) or empty (outline, name greyed; a lane
  without an entry sensor shows a grey "?"), humidity coloured dry (green) / medium (amber) /
  wet (red), temperature, and a teal fan icon while the lane is drying (as every running fan).
- **Label row**: the title with how many lanes are loaded under it ("3 of 4 loaded"). The
  header icon is decoration, so it is grey.
- **Lane names are never cut off.** The grid is fitted to the measured names: as many columns
  as `columns` while every name fits on one line, otherwise fewer (preferring a count that
  fills every row – four lanes go 4 → 2 → 1), so a phone usually shows two columns. It re-fits
  when the card resizes or the fonts load. Only a name wider than the whole card wraps.
- Lanes are counted automatically.
- Tap the humidity or temperature for that sensor's more-info; the rest of the lane
  opens its humidity sensor.

## Configuration

```yaml
type: custom:mmu-lanes-card
prefix: voron
title: EMU lanes
```

| Option | What it is |
|---|---|
| `prefix` | **Required.** The Moonraker integration prefix. Per lane `n` the card reads `binary_sensor.<prefix>_mmu_entry_<n>`, `sensor.<prefix>_unit<u>_env<n>_humidity`, `_env<n>_temp` and `_fan<n>`. |
| `title` | Label row title. Default `MMU lanes`. |
| `unit` | MMU unit number, default 0. |
| `lanes` | Number of lanes; default is every lane found. |
| `names` | List of lane names, e.g. `[PLA black, PETG white]`. |
| `columns` | Most lanes per row, default 4. Fewer when the names don't fit (see above). |
| `humidity_thresholds` | `[dry, wet]`, default `[20, 40]`: below 20 % dry, 20–40 % medium, above 40 % wet. |
| `legend` | Show the legend line, default `true`. |
