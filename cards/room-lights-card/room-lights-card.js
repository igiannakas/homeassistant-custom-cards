/*
 * Room lights card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every room's lights in one card: an "All lights" switch in the header and a
 * tile per room underneath with its temperature, humidity and light level.
 * Tap a tile to switch the room, tap its icon to open the room's dashboard,
 * long-press for the room's individual lamps. Nothing asks first – lights are
 * cheap to switch back.
 * See cards/room-lights-card/README.md for every option.
 */

const RLC_VERSION = "1.0.1";
const RLC_TAG = "room-lights-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  orange: "var(--orange-color, #ff9800)",
  red: "var(--red-color, #f44336)",
  blue: "var(--blue-color, #2196f3)",
  amber: "var(--amber-color, #ffc107)",
  teal: "var(--teal-color, #009688)",
};
const HOLD_MS = 500;
const MOVE_PX = 10;

const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const list = (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v.filter(Boolean) : [v]);
const isOn = (s) => !!s && s.state === "on";

/* "21.1/21.8°", "49/49%", "30 lx" – the unit once, each sensor's value in order. */
function reading(hass, ids, digits, unit, space) {
  const vals = list(ids).map((id) => {
    const s = hass.states[id];
    const n = s ? Number(s.state) : NaN;
    return s && s.state !== "" && isFinite(n) ? n.toFixed(digits) : "–";
  });
  if (!vals.length) return null;
  return `${vals.join("/")}${space ? " " : ""}${unit}`;
}

/* Lamp label without the room's name: "Front living room lamp" in Living Room → "Front lamp". */
function lampName(friendly, room) {
  let n = String(friendly || "");
  if (room) {
    const re = new RegExp(room.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    const stripped = n.replace(re, " ").replace(/\s+/g, " ").trim();
    if (stripped) n = stripped;
  }
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function roomModel(hass, room) {
  const s = hass.states[room.entity];
  const on = isOn(s);
  const name = room.name || s?.attributes?.friendly_name || room.entity;
  return {
    name,
    on,
    missing: !s,
    icon: room.icon || s?.attributes?.icon || "mdi:lightbulb-group",
    window: list(room.window).some((id) => isOn(hass.states[id])),
    temp: reading(hass, room.temperature, 1, "°", false),
    hum: reading(hass, room.humidity, 0, "%", false),
    lux: reading(hass, room.illuminance, 0, "lx", true),
  };
}

/* The lamps behind a room switch (light groups and old-style groups both list them). */
function lamps(hass, room) {
  const s = hass.states[room.entity];
  const ids = list(room.lamps).length ? list(room.lamps) : list(s?.attributes?.entity_id);
  return ids.map((id) => {
    const ls = hass.states[id];
    const on = isOn(ls);
    return {
      id,
      on,
      missing: !ls,
      name: lampName(ls?.attributes?.friendly_name || id, room.name),
      icon: ls?.attributes?.icon || hass.entities?.[id]?.icon || (on ? "mdi:lightbulb" : "mdi:lightbulb-outline"),
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Lamps sheet – same look as the other cards' dialogs                       */
/* ------------------------------------------------------------------------ */

const SHEET_CSS = `
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); max-height: calc(100vh - 48px);
    overflow: auto; padding: 22px 18px 18px; border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .head { display: flex; align-items: center; gap: 10px; padding-left: 8px; margin-bottom: 10px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; flex: 1; min-width: 0; }
  .open { all: unset; cursor: pointer; display: flex; align-items: center; gap: 2px; padding: 6px 4px 6px 10px; border-radius: 16px;
    font-size: 14px; font-weight: 600; color: var(--primary-color); }
  .open ha-icon { --mdc-icon-size: 18px; }
  .lamp { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; min-height: 52px;
    padding: 6px 8px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); cursor: pointer;
    -webkit-tap-highlight-color: transparent; }
  .lamp .glyph { flex-basis: 34px; height: 34px; }
  .lamp .glyph ha-icon { --mdc-icon-size: 20px; }
  .lamp .nm { flex: 1; min-width: 0; font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sw { flex: 0 0 auto; width: 44px; height: 26px; border-radius: 13px; position: relative; background: var(--disabled-color, #bdbdbd);
    transition: background-color 160ms; }
  .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .lamp.on .sw { background: ${C.orange}; }
  .lamp.on .sw::after { transform: translateX(18px); }
  .lamp.missing { opacity: .5; }
  .close { all: unset; box-sizing: border-box; margin-top: 12px; width: 100%; height: 52px; border-radius: 26px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  .lamp:active, .close:active, .open:active { filter: brightness(.92); }
  .lamp:focus-visible, .close:focus-visible, .open:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .empty { padding: 14px 8px; color: var(--secondary-text-color); font-size: 14px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

// A plain controller around an undefined custom tag (attachShadow works on it), so nothing has to
// be registered in Home Assistant's scoped element registry.
class RoomLampsSheet {
  open(card, room) {
    this._card = card;
    this._room = room;
    this.host = document.createElement("rlc-lamps-sheet");
    const root = this.host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${SHEET_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="head"><div class="glyph"><ha-icon></ha-icon></div><div class="title"></div>
          ${room.navigation_path ? `<button class="open">Room<ha-icon icon="mdi:chevron-right"></ha-icon></button>` : ""}</div>
        <div class="list"></div>
        <button class="close">Close</button>
      </div>`;
    this._onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => this.close());
    root.querySelector(".close").addEventListener("click", () => this.close());
    root.querySelector(".open")?.addEventListener("click", () => {
      this.close();
      card._navigate(room.navigation_path);
    });
    document.addEventListener("keydown", this._onKey, true);
    document.body.appendChild(this.host);
    this.update(card._hass);
    root.querySelector(".close").focus();
  }

  update(hass) {
    const root = this.host?.shadowRoot;
    if (!root || !hass) return;
    const m = roomModel(hass, this._room);
    const color = m.on ? C.orange : C.grey;
    const g = root.querySelector(".head .glyph");
    g.style.background = tint(color, 20);
    g.querySelector("ha-icon").setAttribute("icon", m.icon);
    g.querySelector("ha-icon").style.color = color;
    const title = root.querySelector(".title");
    if (title.textContent !== m.name) title.textContent = m.name;
    root.querySelector(".dialog").setAttribute("aria-label", m.name);

    const items = lamps(hass, this._room);
    const box = root.querySelector(".list");
    const keys = items.map((l) => l.id).join();
    if (box.dataset.keys !== keys) {
      box.dataset.keys = keys;
      box.innerHTML = items.length
        ? items
            .map((l) => `<button class="lamp" role="switch" data-id="${esc(l.id)}"><span class="glyph"><ha-icon></ha-icon></span>
              <span class="nm"></span><span class="sw"></span></button>`)
            .join("")
        : `<div class="empty">No separate lamps in this room.</div>`;
      box.querySelectorAll(".lamp").forEach((b) => b.addEventListener("click", () => this._card._toggle(b.dataset.id)));
    }
    items.forEach((l, i) => {
      const b = box.children[i];
      const c = l.on ? C.orange : C.grey;
      b.classList.toggle("on", l.on);
      b.classList.toggle("missing", l.missing);
      b.setAttribute("aria-checked", String(l.on));
      const gl = b.querySelector(".glyph");
      gl.style.background = tint(c, 20);
      gl.querySelector("ha-icon").setAttribute("icon", l.icon);
      gl.querySelector("ha-icon").style.color = c;
      const nm = b.querySelector(".nm");
      if (nm.textContent !== l.name) nm.textContent = l.name;
    });
  }

  close() {
    document.removeEventListener("keydown", this._onKey, true);
    this.host?.remove();
    if (this._card?._sheet === this) this._card._sheet = null;
  }
}

/* ------------------------------------------------------------------------ */

const CSS = `
  :host { display: block; }
  ha-card { padding: 6px; }
  .all { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; padding: 4px 8px 10px 4px;
    cursor: pointer; -webkit-tap-highlight-color: transparent; border-radius: 10px; }
  .shape { position: relative; flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; transition: background-color 180ms; }
  .shape ha-icon { --mdc-icon-size: 20px; transition: color 180ms; }
  .all .nm { flex: 1; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sw { flex: 0 0 auto; width: 44px; height: 26px; border-radius: 13px; position: relative; background: var(--disabled-color, #bdbdbd);
    transition: background-color 160ms; }
  .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .all.on .sw { background: ${C.orange}; }
  .all.on .sw::after { transform: translateX(18px); }
  .rooms { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 6px; }
  .room { position: relative; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    container-type: inline-size; cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none;
    -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
  .tile { display: flex; align-items: center; gap: 10px; height: 100%; box-sizing: border-box; padding: 9px 10px; min-height: 58px; }
  .room .shape { cursor: pointer; }
  .badge { position: absolute; top: -3px; right: -3px; width: 16px; height: 16px; border-radius: 50%; display: none;
    align-items: center; justify-content: center; background: ${C.red}; }
  .badge ha-icon { --mdc-icon-size: 11px; color: #fff; }
  .badge.on { display: flex; }
  .txt { flex: 1; min-width: 0; }
  .room .nm { font-size: 14px; line-height: 20px; font-weight: 600; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m { display: flex; column-gap: 9px; font-size: 12px; line-height: 16px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; }
  .g { display: flex; column-gap: 9px; min-width: 0; }
  .g:empty { display: none; }
  .v { display: inline-flex; align-items: center; gap: 2px; }
  .v ha-icon { --mdc-icon-size: 14px; }
  .v.t ha-icon { color: ${C.orange}; }
  .v.h ha-icon { color: ${C.blue}; }
  .v.l ha-icon { color: ${C.amber}; }
  .room.missing .nm { color: var(--secondary-text-color); }
  /* Press feedback without moving anything: a scale-down shrinks the target under the
     finger and taps near the edge would be lost. */
  .all:active, .room:active { filter: brightness(.94); }
  .all:focus-visible, .room:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* When any room's readings do not fit on one line (the card measures this), every tile
     switches together: temperature on one line, humidity + light level on the next. All tiles
     keep the same height (grid-auto-rows: 1fr) even if one room has more sensors. */
  .stack .m { flex-direction: column; }
  .stack .g { flex-wrap: wrap; column-gap: 7px; }
  .stack .tile { padding: 9px 8px; gap: 8px; }
  .stack .room .shape { flex-basis: 32px; width: 32px; height: 32px; }
  .stack .room .shape ha-icon { --mdc-icon-size: 18px; }
  @container (max-width: 175px) {
    .tile { padding: 9px 6px; gap: 6px; }
    .stack .g { column-gap: 5px; }
    .v { gap: 1px; }
    .m { font-size: 11.5px; }
    .v ha-icon { --mdc-icon-size: 13px; }
  }
`;

class RoomLightsCard extends HTMLElement {
  static getStubConfig(hass) {
    const lights = Object.keys(hass?.states || {}).filter((id) => id.startsWith("light.")).slice(0, 2);
    return { entity: "", rooms: lights.map((id) => ({ entity: id })) };
  }

  // Visual editor. Rooms are a list: add, reorder and edit each one in the form.
  static getConfigForm() {
    const sensors = { entity: { domain: "sensor", multiple: true } };
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "name", selector: { text: {} } },
          { name: "entity", selector: { entity: { domain: ["group", "light", "switch"] } } },
        ] },
        { name: "rooms", selector: { object: {
          multiple: true,
          label_field: "name",
          description_field: "entity",
          fields: {
            name: { label: "Name", selector: { text: {} } },
            entity: { label: "Lights (light, switch or group)", required: true, selector: { entity: { domain: ["light", "switch", "group"] } } },
            icon: { label: "Icon", selector: { icon: {} } },
            navigation_path: { label: "Icon tap goes to", selector: { navigation: {} } },
            temperature: { label: "Temperature sensor(s)", selector: sensors },
            humidity: { label: "Humidity sensor(s)", selector: sensors },
            illuminance: { label: "Light level sensor(s)", selector: sensors },
            window: { label: "Window sensor (red badge when open)", selector: { entity: { domain: "binary_sensor" } } },
          },
        } } },
      ],
      computeLabel: (s) => ({ name: "Header label", entity: "All lights (group)", rooms: "Rooms" })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          entity: "The header switch turns this off if anything is on, otherwise on.",
          rooms: "Tap a room to switch it, tap its icon to open its dashboard, long-press for its lamps.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Missing configuration");
    if (config.rooms !== undefined && !Array.isArray(config.rooms)) throw new Error("rooms must be a list");
    this._config = { ...config, rooms: (config.rooms || []).filter((r) => r && r.entity) };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
    this._sheet?.update(hass);
  }

  getCardSize() {
    return 1 + Math.ceil((this._config?.rooms?.length || 0) / 2) * 1.5;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  disconnectedCallback() {
    this._sheet?.close();
    this._ro?.disconnect();
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const rooms = this._config.rooms;
    const header = this._config.entity
      ? `<button class="all" role="switch"><div class="shape"><ha-icon icon="mdi:home-lightbulb"></ha-icon></div>
          <div class="nm"></div><div class="sw"></div></button>`
      : "";
    root.innerHTML = `<style>${CSS}</style><ha-card>${header}
      <div class="rooms" style="--cols:${Math.max(1, Math.min(4, Number(this._config.columns) || 2))}">
        ${rooms
          .map(
            (r, i) => `<div class="room" role="button" tabindex="0" data-i="${i}"><div class="tile">
              <div class="shape"><ha-icon></ha-icon><span class="badge"><ha-icon icon="mdi:window-open-variant"></ha-icon></span></div>
              <div class="txt"><div class="nm"></div><div class="m"><span class="g"></span><span class="g"></span></div></div>
            </div></div>`,
          )
          .join("")}
      </div></ha-card>`;
    if (!rooms.length) root.querySelector(".rooms").style.display = "none";
    root.querySelector(".all")?.addEventListener("click", () => this._toggleAll());
    root.querySelectorAll(".room").forEach((el) => this._bindRoom(el, rooms[Number(el.dataset.i)]));
    this._el = {
      all: root.querySelector(".all"),
      rooms: [...root.querySelectorAll(".room")],
    };
    this._built = true;
    if (this.isConnected) this.connectedCallback();
  }

  /* Tap = switch the room; tap on the icon = open the room; hold = lamps sheet. */
  _bindRoom(el, room) {
    let timer = null;
    let start = null;
    let held = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      held = false;
      start = [e.clientX, e.clientY];
      cancel();
      timer = setTimeout(() => {
        timer = null;
        held = true;
        this._haptic("medium");
        this._openSheet(room);
      }, HOLD_MS);
    });
    el.addEventListener("pointermove", (e) => {
      if (timer && start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > MOVE_PX) cancel();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => el.addEventListener(t, cancel));
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("click", (e) => {
      if (held) {
        held = false;
        return;
      }
      if (e.composedPath().some((n) => n.classList?.contains("shape")) && room.navigation_path) {
        this._navigate(room.navigation_path);
        return;
      }
      this._toggle(room.entity);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._toggle(room.entity);
      }
    });
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    // Only touch the DOM when something changed: Home Assistant pushes state several times a
    // second, and replacing text under a finger can swallow the tap.
    const set = (node, text) => {
      if (node.textContent !== text) node.textContent = text;
    };

    if (this._el.all) {
      const s = hass.states[this._config.entity];
      const on = isOn(s);
      const color = on ? C.orange : C.grey;
      this._el.all.classList.toggle("on", on);
      this._el.all.setAttribute("aria-checked", String(on));
      const shape = this._el.all.querySelector(".shape");
      shape.style.backgroundColor = tint(color, 20);
      shape.querySelector("ha-icon").style.color = color;
      set(this._el.all.querySelector(".nm"), this._config.name || "All lights");
    }

    this._config.rooms.forEach((room, i) => {
      const el = this._el.rooms[i];
      const m = roomModel(hass, room);
      const color = m.on ? C.orange : C.grey;
      el.classList.toggle("missing", m.missing);
      const shape = el.querySelector(".shape");
      shape.style.backgroundColor = tint(color, 20);
      const icon = shape.querySelector(":scope > ha-icon");
      if (icon.getAttribute("icon") !== m.icon) icon.setAttribute("icon", m.icon);
      icon.style.color = color;
      el.querySelector(".badge").classList.toggle("on", m.window);
      set(el.querySelector(".nm"), m.name);
      el.setAttribute("aria-label", `${m.name}: ${m.missing ? "not found" : m.on ? "on" : "off"}`);
      const [g1, g2] = el.querySelectorAll(".g");
      const html1 = m.temp ? this._v("t", "mdi:thermometer", m.temp) : "";
      const html2 = (m.hum ? this._v("h", "mdi:water-percent", m.hum) : "") + (m.lux ? this._v("l", "mdi:white-balance-sunny", m.lux) : "");
      let changed = false;
      if (g1.dataset.h !== html1) {
        g1.innerHTML = html1;
        g1.dataset.h = html1;
        changed = true;
      }
      if (g2.dataset.h !== html2) {
        g2.innerHTML = html2;
        g2.dataset.h = html2;
        changed = true;
      }
      if (changed) this._fit();
    });
  }

  /* One line per tile if every room's readings fit, otherwise two lines for all of them. */
  _fit() {
    if (this._fitQueued) return;
    this._fitQueued = true;
    requestAnimationFrame(() => {
      this._fitQueued = false;
      const card = this.shadowRoot?.querySelector("ha-card");
      if (!card || !card.isConnected) return;
      card.classList.remove("stack");
      const overflow = [...card.querySelectorAll(".m, .g")].some((m) => m.scrollWidth > m.clientWidth + 1);
      card.classList.toggle("stack", overflow);
    });
  }

  connectedCallback() {
    if (typeof ResizeObserver === "undefined") return;
    // Only width matters; the height changes this causes must not trigger another pass.
    this._ro =
      this._ro ||
      new ResizeObserver((entries) => {
        const w = Math.round(entries[entries.length - 1].contentRect.width);
        if (w === this._fitWidth) return;
        this._fitWidth = w;
        this._fit();
      });
    const card = this.shadowRoot?.querySelector("ha-card");
    if (card) this._ro.observe(card);
  }

  _v(cls, icon, text) {
    return `<span class="v ${cls}"><ha-icon icon="${icon}"></ha-icon>${esc(text)}</span>`;
  }

  _openSheet(room) {
    const s = this._hass.states[room.entity];
    if (!list(room.lamps).length && !list(s?.attributes?.entity_id).length) {
      // A single light: Home Assistant's own dialog has everything for it.
      this._fire("hass-more-info", { entityId: room.entity });
      return;
    }
    this._sheet?.close();
    this._sheet = new RoomLampsSheet();
    this._sheet.open(this, room);
  }

  /* Header: anything on → everything off; all off → everything on. No confirmation. */
  _toggleAll() {
    const s = this._hass.states[this._config.entity];
    this._haptic("light");
    this._call(isOn(s) ? "turn_off" : "turn_on", this._config.entity);
  }

  _toggle(entity) {
    const s = this._hass.states[entity];
    this._haptic("light");
    this._call(isOn(s) ? "turn_off" : "turn_on", entity);
  }

  async _call(service, entity) {
    const [domain] = entity.split(".");
    const d = domain === "light" || domain === "switch" ? domain : "homeassistant";
    try {
      await this._hass.callService(d, service, { entity_id: entity });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || `Could not switch ${entity}` });
    }
  }

  _navigate(path) {
    history.pushState(null, "", path);
    this._fire("location-changed", { replace: false });
  }

  _haptic(kind) {
    this._fire("haptic", kind);
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

async function registerRoomLightsCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(RLC_TAG)) return;
  registry.define(RLC_TAG, RoomLightsCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: RLC_TAG,
    name: "Room lights",
    description: "All lights switch plus a tile per room with temperature, humidity and light level.",
  });
  console.info(`%c ROOM-LIGHTS-CARD %c ${RLC_VERSION} `, "background:#ff9800;color:#fff", "");
}

registerRoomLightsCard();
