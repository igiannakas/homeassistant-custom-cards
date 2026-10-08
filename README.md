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

Related: the Tado X room card (`custom:tadox-room-card`) ships with the
[Tado X Proxy integration](https://github.com/igiannakas/ha-tadox-proxy), because it reads
that integration's thermostat attributes.

## Installing a card

1. Copy the card's `.js` file to your Home Assistant `config/www/` folder, for
   example `config/www/home-status-card.js`.
2. Add it as a dashboard resource: **Settings → Dashboards → ⋮ → Resources →
   Add resource**, URL `/local/home-status-card.js?v=1`, type **JavaScript module**.
3. Reload the browser tab (or pull down to refresh in the app).

When you update a card, change the `?v=` part of the resource URL (any new
value) so browsers and the app fetch the new file instead of a cached one.

## Repository layout

```
cards/<card-name>/<card-name>.js   the card – the only file Home Assistant needs
cards/<card-name>/README.md        options and behaviour
tests/<card-name>.test.js          behaviour tests (real card code in jsdom)
```

## Development

```bash
npm install   # jsdom, for the tests
npm test      # syntax check of every card, then every test
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
