# Home Assistant custom cards

Small, self-contained Lovelace cards. Each card is a single JavaScript file with
no build step and no dependencies: the logic and styling live in the card, so
your dashboard config is just a list of entities.

They follow the look of Mushroom and the built-in tile cards (same greys,
colours and icon shapes), and anything that changes something important asks
first in a confirmation dialog.

| Card | What it does |
|---|---|
| [Home status](cards/home-status-card/README.md) | Presence, alarm switch, door, TV, climate and an ePaper message for a home, in one compact card. |
| [Room lights](cards/room-lights-card/README.md) | An "All lights" switch and a tile per room with temperature, humidity and light level; long-press a room for its lamps. |
| [Energy summary](cards/energy-summary-card/README.md) | Power now, today, yesterday and this month, each with its cost, in one compact row. |
| [Weather & presence](cards/weather-presence-card/README.md) | Weather with your own outdoor temperature, a presence pill and a link pill – the top of a climate section. |
| [Climate modes](cards/climate-modes-card/README.md) | Whole-house mode tiles (heating presets, aircon speeds…) with the active one highlighted. |
| [Air quality](cards/air-quality-card/README.md) | Every room's air in one card: status, CO₂ / PM2.5 / VOC, and a red glow when a room needs ventilating. |

Related: the Tado X room card (`custom:tadox-room-card`) ships with the
[Tado X Proxy integration](https://github.com/igiannakas/ha-tadox-proxy), because it reads
that integration's thermostat attributes.

## Installing (HACS)

All cards come as one file, `dist/homeassistant-custom-cards.js`.

1. **HACS → ⋮ → Custom repositories**: add
   `https://github.com/igiannakas/homeassistant-custom-cards`, type **Dashboard**.
2. Open **Home Assistant custom cards** in HACS and **Download**. HACS adds the
   dashboard resource (`/hacsfiles/homeassistant-custom-cards/homeassistant-custom-cards.js`)
   for you.
3. Reload the browser tab (or pull down to refresh in the app).

Updates show up in HACS like any other card once new commits are pushed.

Without HACS: copy `dist/homeassistant-custom-cards.js` to `config/www/` and add
it as a **JavaScript module** resource (`/local/homeassistant-custom-cards.js?v=1`,
changing `?v=` on every update).

## Repository layout

```
cards/<card-name>/<card-name>.js   the card's source
cards/<card-name>/README.md        options and behaviour
tests/<card-name>.test.js          behaviour tests (real card code in jsdom)
dist/homeassistant-custom-cards.js all cards in one file, for HACS (npm run build)
hacs.json                          tells HACS which file to install
```

## Development

```bash
npm install     # jsdom, for the tests
npm run build   # rebuild dist/ after changing a card (commit it too)
npm test        # syntax check, every card's tests, and a check that dist/ is up to date
```

Conventions for new cards:

- One file, plain `HTMLElement` + shadow DOM, no external imports.
- Register only after Home Assistant's own `home-assistant` element is defined
  (`customElements.whenDefined("home-assistant")`), then define through
  `window.customElements` – Home Assistant swaps in a scoped registry while it
  starts, and a card defined earlier is reported as "custom element doesn't exist".
- Use theme variables (`--grey-color`, `--red-color`, …) rather than fixed colours,
  so light and dark themes both work.
- Confirm anything with consequences (alarms, boosts, locks) in a dialog.

## License

GPL-3.0 – see [LICENSE](LICENSE).
