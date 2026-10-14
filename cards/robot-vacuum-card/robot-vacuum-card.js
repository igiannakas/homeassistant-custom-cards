/*
 * Robot vacuum card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A Roborock (or similar) robot vacuum. The default layout: state and battery, what needs you
 * (dock tanks, errors), the job while it runs, a floor switch and the floor map (cropped to
 * the rooms, live while cleaning; a switch shows at once), the rooms in an even grid to build
 * a clean, and the buttons for the state – Clean all / Clean N rooms, Pause, Resume, Dock –
 * plus an optional Auto clean pill. Every button asks first except Pause.
 *
 * `layout: mode` is the cleaning mode, laid out like the Roborock app: Vac & mop / Mop /
 * Vacuum tabs, then suction power, scrub intensity & water flow, cleaning count and route as
 * select buttons, offering only what applies in that mode. The count is sent with the clean.
 *
 * Everything is found from the vacuum entity's device (and its dock device), so the config
 * is one entity id. Rooms and their segment ids come from roborock.get_maps; a room clean is
 * vacuum.send_command app_segment_clean on the map that is loaded. Nothing blocks a clean
 * except the vacuum being offline. Tap any value for its own more-info.
 * See cards/robot-vacuum-card/README.md for every option.
 */

const RVC_VERSION = "2.0.0";
const RVC_TAG = "robot-vacuum-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  blue: "var(--blue-color, #2196f3)",
  teal: "var(--teal-color, #009688)",
  amber: "var(--amber-color, #ffc107)",
  green: "var(--green-color, #4caf50)",
  red: "var(--red-color, #f44336)",
  orange: "var(--orange-color, #ff9800)",
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const tx = (c, p = 70) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
const DEAD = ["unavailable", "unknown"];
// "main_brush_jammed" → "Main brush jammed"
const human = (s) => {
  const t = String(s || "").replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
};
// 1650 s → "28 min", 4300 s → "1 h 12 min"
function mins(sec) {
  if (sec === null) return "–";
  const m = Math.max(0, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}
// A past moment as "today 10:00", "yesterday 10:00", "Sat 10:00" or "10 Oct".
function when(iso, now = new Date()) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return "";
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days <= 0) return `today ${t}`;
  if (days === 1) return `yesterday ${t}`;
  if (days < 7) return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${t}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
// A duration sensor's value in seconds, whatever its unit.
function seconds(s) {
  const v = num(s?.state);
  if (v === null) return null;
  const u = String(s.attributes?.unit_of_measurement || "s");
  return v * ({ s: 1, min: 60, h: 3600, d: 86400 }[u] || 1);
}

/* ------------------------------------------------------------------------ */
/* Finding the entities: the vacuum's device, plus its dock device          */
/* ------------------------------------------------------------------------ */

// Per key: domain, translation keys (stable), device class, entity id suffixes (fallback).
const KEYS = {
  battery: { domain: "sensor", dc: "battery", main: true },
  charging: { domain: "binary_sensor", dc: "battery_charging", main: true },
  status: { domain: "sensor", tk: ["status"], sfx: ["_status"] },
  error: { domain: "sensor", tk: ["vacuum_error"], sfx: ["_vacuum_error"] },
  dock_error: { domain: "sensor", tk: ["dock_error"], sfx: ["_dock_error"] },
  dirty_box: { domain: "binary_sensor", tk: ["dirty_box_full", "dock_dirty_water_box"], sfx: ["_dirty_water_box"] },
  clean_box: { domain: "binary_sensor", tk: ["clean_box_empty", "dock_clean_water_box"], sfx: ["_clean_water_box"] },
  water_shortage: { domain: "binary_sensor", tk: ["water_shortage"], sfx: ["_water_shortage"] },
  mop_attached: { domain: "binary_sensor", tk: ["mop_attached"], sfx: ["_mop_attached"] },
  area: { domain: "sensor", tk: ["cleaning_area"], sfx: ["_cleaning_area"] },
  time: { domain: "sensor", tk: ["cleaning_time"], sfx: ["_cleaning_time"] },
  progress: { domain: "sensor", tk: ["clean_percent", "cleaning_progress"], sfx: ["_cleaning_progress"] },
  room: { domain: "sensor", tk: ["current_room"], sfx: ["_current_room"] },
  last_start: { domain: "sensor", tk: ["last_clean_start"], sfx: ["_last_clean_begin", "_last_clean_start"] },
  map_select: { domain: "select", tk: ["selected_map"], sfx: ["_selected_map"] },
  mode: { domain: "select", tk: ["cleaning_mode"], sfx: ["_cleaning_mode"] },
  mop_water: { domain: "select", tk: ["mop_intensity"], sfx: ["_mop_intensity"] },
  mop_route: { domain: "select", tk: ["mop_mode"], sfx: ["_mop_mode"] },
  drying: { domain: "sensor", tk: ["mop_drying_remaining_time"], sfx: ["_mop_drying_remaining_time"] },
};

function deviceEntityIds(hass, vacuumId) {
  const reg = hass.entities || {};
  const devId = reg[vacuumId]?.device_id;
  if (!devId) {
    // No registry (old frontend): everything whose object id contains the vacuum's.
    const base = String(vacuumId).split(".")[1] || "";
    return { devId: null, ids: Object.keys(hass.states).filter((id) => base && id.split(".")[1].includes(base)) };
  }
  const devs = hass.devices || {};
  const dev = devs[devId] || {};
  const own = (dev.identifiers || []).map(([d, i]) => `${d}|${i}_dock`);
  const dockIds = Object.values(devs)
    .filter((d) => d.id !== devId && ((d.identifiers || []).some(([x, i]) => own.includes(`${x}|${i}`)) || (dev.name && d.name === `${dev.name} Dock`)))
    .map((d) => d.id);
  const ids = Object.values(reg)
    .filter((e) => e.device_id === devId || dockIds.includes(e.device_id))
    .map((e) => e.entity_id);
  return { devId, ids };
}

function discover(hass, cfg) {
  const reg = hass.entities || {};
  const { devId, ids } = deviceEntityIds(hass, cfg.entity);
  const found = {};
  for (const [k, spec] of Object.entries(KEYS)) {
    const own = cfg.entities?.[k];
    if (own) {
      found[k] = own;
      continue;
    }
    const cands = ids.filter((id) => id.startsWith(`${spec.domain}.`) && hass.states[id]);
    let hit = spec.tk ? cands.filter((id) => spec.tk.includes(reg[id]?.translation_key)) : [];
    if (!hit.length && spec.dc)
      hit = cands.filter((id) => hass.states[id].attributes?.device_class === spec.dc && (!spec.main || !devId || reg[id]?.device_id === devId));
    if (!hit.length && spec.sfx) hit = cands.filter((id) => spec.sfx.some((s) => id.endsWith(s)));
    // Shortest wins: _cleaning_time over _total_cleaning_time.
    if (hit.length) found[k] = hit.sort((a, b) => a.length - b.length)[0];
  }
  found.images = ids.filter((id) => id.startsWith("image.") && hass.states[id]);
  return found;
}

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
function imageFor(hass, images, mapName) {
  if (!mapName) return images.length === 1 ? images[0] : null;
  const n = String(mapName).toLowerCase();
  return (
    images.find((id) => String(hass.states[id]?.attributes?.friendly_name || "").toLowerCase().endsWith(n)) ||
    images.find((id) => id.endsWith(`_${slug(mapName)}`)) ||
    null
  );
}

/* Room icons: your own (rooms: in the config), else the Home Assistant area with that name
   (or whose name is inside the room's, e.g. "Corridor" in "Upstairs Corridor"), else a guess. */
const ROOM_GUESS = [
  [/en.?suite|shower/i, "mdi:shower"],
  [/toilet|\bwc\b|cloak/i, "mdi:toilet"],
  [/bath/i, "mdi:bathtub"],
  [/kitchen/i, "mdi:countertop"],
  [/living|lounge|sitting/i, "mdi:sofa"],
  [/dining/i, "mdi:silverware-fork-knife"],
  [/study|office/i, "mdi:chair-rolling"],
  [/corridor|hall|landing|stair/i, "mdi:stairs"],
  [/bed/i, "mdi:bed"],
  [/utility|laundry/i, "mdi:washing-machine"],
];
function roomIcon(hass, cfg, name) {
  const own = cfg.rooms?.[name]?.icon;
  if (own) return own;
  const n = String(name).toLowerCase();
  const areas = Object.values(hass.areas || {}).filter((a) => a?.name && a.icon);
  const exact = areas.find((a) => a.name.toLowerCase() === n);
  if (exact) return exact.icon;
  const inside = areas.filter((a) => n.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(n)).sort((a, b) => b.name.length - a.name.length)[0];
  if (inside) return inside.icon;
  return (ROOM_GUESS.find(([re]) => re.test(name)) || [, "mdi:floor-plan"])[1];
}

/* ------------------------------------------------------------------------ */
/* State                                                                    */
/* ------------------------------------------------------------------------ */

const STATES = {
  docked: { word: "Docked", color: C.grey, icon: "mdi:robot-vacuum" },
  cleaning: { word: "Cleaning", color: C.blue, icon: "mdi:robot-vacuum" },
  returning: { word: "Returning", color: C.blue, icon: "mdi:robot-vacuum" },
  paused: { word: "Paused", color: C.amber, icon: "mdi:robot-vacuum" },
  idle: { word: "Idle", color: C.grey, icon: "mdi:robot-vacuum" },
  error: { word: "Error", color: C.red, icon: "mdi:robot-vacuum-alert" },
  needs: { word: "Needs you", color: C.red, icon: "mdi:robot-vacuum-alert" },
  offline: { word: "Offline", color: C.grey, icon: "mdi:robot-vacuum-off" },
};
const BUSY = ["cleaning", "returning", "paused"];
const STATUS_LINE = {
  washing_the_mop: "Washing the mop",
  going_to_wash_the_mop: "Going to wash the mop",
  emptying_the_bin: "Emptying the bin",
  returning_home: "Returning to the dock",
  docking: "Returning to the dock",
  back_to_dock_washing_duster: "Returning to wash the mop",
  mapping: "Mapping",
  attaching_the_mop: "Attaching the mop",
  detaching_the_mop: "Detaching the mop",
  going_to_target: "Going to the spot",
  air_drying_stopping: "Drying the mop",
};
const DOCK_TEXT = {
  water_empty: "Dock: refill the clean water tank",
  waste_water_tank_full: "Dock: empty the dirty water tank",
  cleaning_tank_full_or_blocked: "Dock: the cleaning tray is full or blocked",
  dirty_tank_latch_open: "Dock: close the dirty water tank latch",
  no_dustbin: "Dock: the dust bag is missing",
  no_dustbin_or_filter: "Dock: the dust bag or filter is missing",
  duct_blockage: "Dock: the dust duct is blocked",
  maintenance_brush_jammed: "Dock: the maintenance brush is jammed",
};

function model(hass, cfg, found, maps, shownMap) {
  const v = hass.states[cfg.entity];
  const st = (k) => (found[k] ? hass.states[found[k]] : undefined);
  const s = (k) => st(k)?.state;
  const raw = v ? v.state : "unavailable";
  let key = DEAD.includes(raw) ? "offline" : STATES[raw] ? raw : "idle";

  // What needs you: errors and the dock's tanks. None of it blocks a clean.
  const msgs = [];
  if (key !== "offline") {
    const err = s("error");
    if (err && !["none", "ok", ...DEAD].includes(err)) msgs.push({ text: `Robot: ${human(err).toLowerCase()}`, e: found.error, c: C.red });
    const dock = s("dock_error");
    if (dock && !["ok", "none", ...DEAD].includes(dock)) msgs.push({ text: DOCK_TEXT[dock] || `Dock: ${human(dock).toLowerCase()}`, e: found.dock_error, c: C.red });
    if (s("dirty_box") === "on" && dock !== "waste_water_tank_full") msgs.push({ text: DOCK_TEXT.waste_water_tank_full, e: found.dirty_box, c: C.red });
    if (s("clean_box") === "on" && dock !== "water_empty") msgs.push({ text: DOCK_TEXT.water_empty, e: found.clean_box, c: C.red });
    if (s("water_shortage") === "on") msgs.push({ text: "Robot: the water tank is low", e: found.water_shortage, c: C.red });
    const mode = s("mode");
    if (s("mop_attached") === "off" && mode && mode !== "vacuum" && !DEAD.includes(mode))
      msgs.push({ text: "The mop isn't attached, so it will only vacuum", e: found.mop_attached, c: C.amber });
  }
  if (msgs.some((m) => m.c === C.red) && ["docked", "idle"].includes(key)) key = "needs";

  const battery = num(s("battery") ?? v?.attributes?.battery_level);
  const charging = s("charging") === "on" || String(s("status")) === "charging";
  const status = String(s("status") || "");
  const room = DEAD.includes(s("room")) ? "" : s("room") || "";

  // The line under the name.
  let line = [];
  if (key === "offline") line = [{ t: "Can't reach the vacuum" }];
  else if (key === "cleaning")
    line = [{ t: STATUS_LINE[status] || (room ? `Cleaning ${room}` : "Cleaning"), e: STATUS_LINE[status] ? found.status : found.room }];
  else if (key === "returning") line = [{ t: "Returning to the dock", e: found.status }];
  else if (key === "paused") line = [{ t: room ? `Paused in ${room}` : "Paused", e: found.room }];
  else if (key === "error") line = msgs.length ? [] : [{ t: human(status) || "Error", e: found.status }];
  else {
    const dry = seconds(st("drying"));
    if (dry) line = [{ t: `Drying the mop · ${mins(dry)} left`, e: found.drying }];
    else {
      const last = when(s("last_start"));
      if (last) {
        line.push({ t: `Last clean ${last}`, e: found.last_start });
        const a = num(s("area"));
        if (a !== null) line.push({ t: `${fmt(a, 1)} m²`, e: found.area });
        const tm = seconds(st("time"));
        if (tm !== null) line.push({ t: mins(tm), e: found.time });
      } else if (key === "idle") line = [{ t: "Away from the dock", e: found.status }];
    }
  }

  const mapNames = st("map_select")?.attributes?.options || (maps || []).map((m) => m.name);
  // The floor shown: the robot's loaded map, or the one just picked until the robot confirms it.
  const selMap = shownMap ?? s("map_select");
  const mapName = selMap && !DEAD.includes(selMap) ? selMap : maps?.length === 1 ? maps[0].name : "";
  const map = (maps || []).find((m) => m.name === mapName) || (maps?.length === 1 ? maps[0] : null);
  const img = imageFor(hass, found.images || [], mapName);
  const imgState = img ? hass.states[img] : null;

  return {
    key,
    state: STATES[key],
    name: cfg.name || v?.attributes?.friendly_name || "Vacuum",
    msgs,
    line,
    battery,
    charging,
    progress: num(s("progress")),
    area: num(s("area")),
    time: seconds(st("time")),
    room,
    floors: mapNames.length > 1 ? mapNames : [],
    mapName,
    rooms: map ? map.rooms.filter((r) => !cfg.rooms?.[r.name]?.hide) : [],
    image: imgState?.attributes?.entity_picture ? { id: img, url: `${imgState.attributes.entity_picture}${imgState.attributes.entity_picture.includes("?") ? "&" : "?"}s=${encodeURIComponent(imgState.state)}` } : null,
    mode: s("mode"),
    fan: v?.attributes?.fan_speed,
    water: s("mop_water"),
    route: s("mop_route"),
    auto: cfg.auto_clean ? hass.states[cfg.auto_clean] : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Cleaning mode: laid out like the Roborock app (without Customize)        */
/* ------------------------------------------------------------------------ */

const OPT_LABEL = { vac_and_mop: "Vac & mop", max_plus: "Max+", deep_plus: "Deep+", smart_mode: "Smart" };
const optLabel = (o) => OPT_LABEL[o] || human(o);
// Tabs in the app's order.
const MODES = ["vac_and_mop", "mop", "vacuum"];
const ORDER = {
  fan: ["off", "quiet", "gentle", "balanced", "standard", "turbo", "strong", "max", "max_plus", "custom"],
  water: ["off", "low", "mild", "moderate", "medium", "standard", "high", "intense", "custom"],
  route: ["fast", "standard", "deep", "deep_plus", "custom"],
};
const FAN_ICON = { quiet: "mdi:weather-night", balanced: "mdi:fan-speed-1", turbo: "mdi:fan-speed-2", max: "mdi:fan-speed-3", max_plus: "mdi:weather-tornado" };
const WATER_ICON = { mild: "mdi:water-outline", standard: "mdi:water", intense: "mdi:water-plus" };
function offer(options, current, order) {
  const hide = ["custom", "off", "smart_mode"];
  const list = (options || []).filter((o) => !hide.includes(o) || o === current);
  return list.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}
/* Route glyphs like the app's: a rounded square with the path the robot takes – an S for
   Fast, then three, four and five passes for Standard, Deep and Deep+. */
function routeSvg(k) {
  const passes = { standard: 3, deep: 4, deep_plus: 5 }[k];
  if (k !== "fast" && !passes) return "";
  let d;
  if (k === "fast") d = "M8 8.2h2.4c1.4 0 1.9.9 2.2 2.3l.8 3c.3 1.4.8 2.3 2.2 2.3H16";
  else {
    const x0 = 8, s = 8 / (passes - 1), r = s / 2, top = 8, bot = 16;
    d = `M${x0} ${bot}`;
    for (let i = 0; i < passes - 1; i++) {
      const nx = +(x0 + (i + 1) * s).toFixed(2);
      d += i % 2 === 0 ? ` V${+(top + r).toFixed(2)} A${+r.toFixed(2)} ${+r.toFixed(2)} 0 0 1 ${nx} ${+(top + r).toFixed(2)}` : ` V${+(bot - r).toFixed(2)} A${+r.toFixed(2)} ${+r.toFixed(2)} 0 0 0 ${nx} ${+(bot - r).toFixed(2)}`;
    }
    d += (passes - 1) % 2 === 0 ? ` V${bot}` : ` V${top}`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="${d}"/></svg>`;
}

/* Cleaning count (×1 / ×2) has no entity: the card keeps it per vacuum, shared by the mode
   panel and the Clean button (and remembered in this browser), and sends it with the clean. */
const COUNT = new Map();
const COUNT_CARDS = new Set();
function getCount(id) {
  if (!COUNT.has(id)) {
    let v = 1;
    try {
      v = Number(window.localStorage?.getItem(`robot-vacuum-card:count:${id}`)) || 1;
    } catch (e) {
      /* storage blocked: start at ×1 */
    }
    COUNT.set(id, v === 2 ? 2 : 1);
  }
  return COUNT.get(id);
}
function setCount(id, v) {
  COUNT.set(id, v);
  try {
    window.localStorage?.setItem(`robot-vacuum-card:count:${id}`, String(v));
  } catch (e) {
    /* fine: it still applies for this page */
  }
  for (const c of COUNT_CARDS) if (c._config?.entity === id) c._render();
}

/* ------------------------------------------------------------------------ */
/* Confirmation dialog – same look as the other cards' dialogs              */
/* ------------------------------------------------------------------------ */

const DIALOG_CSS = `
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); padding: 25px 18px 18px;
    border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; }
  .body { margin-top: 20px; }
  .primary { font-size: 17px; line-height: 24px; font-weight: 600; }
  .secondary { font-size: 15px; line-height: 21px; margin-top: 2px; color: var(--secondary-text-color); }
  .buttons { margin-top: 20px; display: grid; gap: 8px; }
  button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  button.confirm { color: #fff; }
  button.confirm .glyph { background: rgba(255,255,255,.2); }
  button.confirm .glyph ha-icon { color: #fff; }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button:active { filter: brightness(.92); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

function confirmDialog({ title, icon, color, primary, secondary, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("rvc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="row body"><div class="glyph"><ha-icon icon="mdi:robot-vacuum" style="color:${color}"></ha-icon></div>
          <div><div class="primary">${esc(primary)}</div><div class="secondary">${esc(secondary)}</div></div></div>
        <div class="buttons">
          <button class="confirm" style="background:${color}"><span class="glyph"><ha-icon icon="${esc(icon)}"></ha-icon></span>${esc(confirmLabel)}</button>
          <button class="cancel"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Cancel</button>
        </div></div>`;
    const done = (ok) => {
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      resolve(ok);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(false);
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => done(false));
    root.querySelector(".cancel").addEventListener("click", () => done(false));
    root.querySelector(".confirm").addEventListener("click", () => done(true));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    root.querySelector(".confirm").focus();
  });
}

/* ------------------------------------------------------------------------ */

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  ha-card { padding: 10px; container-type: inline-size; }
  .body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .body > * { min-width: 0; }
  [hidden] { display: none !important; }
  .head { display: flex; align-items: center; gap: 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  .txt { flex: 1; min-width: 0; cursor: pointer; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nm .st { font-weight: 400; color: var(--secondary-text-color); }
  /* The line under the name may wrap, but only between its parts ("28 min" stays whole). */
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .sc:empty { display: none; }
  .sc .p { white-space: nowrap; }
  [data-e] { cursor: pointer; border-radius: 4px; -webkit-tap-highlight-color: transparent; }
  .sc [data-e]:active, .jt [data-e]:active { filter: brightness(.85); }
  /* Primary pills: 36px, the icon circle's height. */
  .pill { all: unset; box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; border-radius: 18px; padding: 0 14px 0 10px; font-size: 13px; font-weight: 600; letter-spacing: .2px; white-space: nowrap;
    cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  .pill.batt { color: var(--secondary-text-color); }
  .pill.low { background: ${tint(C.red, 18)}; color: ${tx(C.red, 85)}; }
  .pill.on { background: ${tint(C.teal, 18)}; color: ${tx(C.teal)}; }
  .pill.on ha-icon { color: ${C.teal}; }
  .pill[disabled] { opacity: .45; cursor: default; }
  .msg { display: flex; align-items: center; gap: 8px; min-height: 30px; box-sizing: border-box; padding: 6px 10px; border-radius: 10px;
    font-size: 12px; line-height: 16px; letter-spacing: .3px; cursor: pointer; }
  .msg ha-icon { --mdc-icon-size: 16px; flex: none; }
  .msgs { display: grid; gap: 6px; }
  .msgs:empty { display: none; }
  .jt { min-width: 0; }
  .pct { font-size: 20px; line-height: 26px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap; }
  .pct .when { font-size: 12px; font-weight: 400; letter-spacing: .4px; color: var(--secondary-text-color); margin-left: 8px; }
  .pbar { height: 8px; border-radius: 4px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); margin-top: 4px; overflow: hidden; }
  .pbar i { display: block; height: 100%; border-radius: 4px; transition: width 400ms; }
  /* Segmented selector: 32px segments in a 38px track. */
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); }
  .seg button { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: 0; height: 32px; border-radius: 9px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; -webkit-tap-highlight-color: transparent; }
  .seg button[aria-pressed="true"] { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  .seg button[disabled] { opacity: .45; cursor: default; }
  .seg button ha-icon { --mdc-icon-size: 20px; }
  .seg button svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .map { position: relative; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); height: clamp(200px, 64cqw, 340px);
    display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer; }
  .map canvas { display: block; }
  .map .loading { position: absolute; right: 8px; bottom: 8px; padding: 3px 8px; border-radius: 10px; font-size: 11px; line-height: 14px;
    letter-spacing: .4px; color: var(--secondary-text-color); background: var(--card-background-color, #fff); }
  /* Rooms: an even grid of secondary pills (30px), two across on a phone. */
  .rooms { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .rooms:empty { display: none; }
  .chip { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 6px; height: 30px; border-radius: 15px; padding: 0 12px 0 8px;
    font-size: 12px; font-weight: 500; letter-spacing: .2px; white-space: nowrap; cursor: pointer; min-width: 0;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color); -webkit-tap-highlight-color: transparent; }
  .chip span { overflow: hidden; text-overflow: ellipsis; }
  .chip ha-icon { --mdc-icon-size: 16px; color: ${C.grey}; flex: none; }
  .chip.sel { background: ${tint(C.blue, 18)}; color: ${tx(C.blue)}; }
  .chip.sel ha-icon { color: ${C.blue}; }
  .chip.now { box-shadow: inset 0 0 0 1.5px ${tint(C.blue, 60)}; }
  .chip[aria-disabled="true"] { cursor: default; }
  .chip[disabled] { opacity: .45; cursor: default; }
  .acts { display: grid; grid-template-columns: repeat(var(--n, 2), minmax(0, 1fr)); gap: 8px; }
  .acts .pill { padding: 0 10px; min-width: 0; }
  .acts .pill span { overflow: hidden; text-overflow: ellipsis; }
  /* Mode panel: label row, tabs, then a label + value line over each selector (as in the app). */
  .label { display: flex; align-items: center; gap: 10px; min-height: 40px; }
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; color: ${C.grey}; }
  .t { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); position: relative; top: 1px; }
  .set { display: grid; gap: 6px; }
  .k { font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color); }
  .k b { font-weight: 500; margin-left: 6px; color: ${tx(C.blue, 75)}; }
  .pill:active, .chip:active, .seg button:active, .shape:active { filter: brightness(.92); }
  .pill:focus-visible, .chip:focus-visible, .seg button:focus-visible, .shape:focus-visible, [data-e]:focus-visible, .msg:focus-visible, .map:focus-visible {
    outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

/* Ink alignment (design rule): every line of a text block starts on the title's vertical line,
   measured on ink rather than boxes (a leading "1" or an icon has its own side bearing). */
const INK = { ctx: undefined };
const inkCtx = () => {
  if (INK.ctx === undefined)
    INK.ctx = /jsdom/i.test(navigator.userAgent) ? null : document.createElement("canvas").getContext("2d");
  return INK.ctx;
};
const inkVisible = (el) => !el.hidden && getComputedStyle(el).display !== "none";
function inkLead(el) {
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      if (n.textContent.trim()) return { text: n };
    } else if (n.nodeType === 1 && inkVisible(n)) {
      if (n.localName === "ha-icon") return { icon: n };
      const r = inkLead(n);
      if (r) return r;
    }
  }
  return null;
}
function inkText(node) {
  const ctx = inkCtx();
  if (!ctx) return null;
  const cs = getComputedStyle(node.parentElement);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return -ctx.measureText(node.textContent.trim()[0]).actualBoundingBoxLeft;
}
const inkSet = (el, px) => {
  const v = Math.abs(px) > 0.2 ? `${px.toFixed(2)}px` : "";
  if (el.style.marginLeft !== v) el.style.marginLeft = v;
};
function inkAlign(blocks) {
  for (const b of blocks) {
    const lines = [...b.children].filter(inkVisible);
    const t = lines.length > 1 ? inkLead(lines[0]) : null;
    if (!t || !t.text) continue;
    const ref = inkText(t.text);
    if (ref === null) return;
    for (const line of lines.slice(1)) {
      const lead = inkLead(line);
      if (lead && lead.text) inkSet(line, ref - inkText(lead.text));
    }
  }
}
function inkSchedule(host, selector) {
  if (host._inkQueued) return;
  host._inkQueued = true;
  requestAnimationFrame(() => {
    host._inkQueued = false;
    if (host.shadowRoot) inkAlign(host.shadowRoot.querySelectorAll(selector));
  });
}

/* The floor map: the image entity's picture, cropped to what is drawn (Roborock maps come
   with wide transparent margins) and fitted into the box. Every floor's picture is loaded
   ahead, so switching floors repaints at once; a new picture replaces the old one only once
   it has loaded, so a live map never flickers. */
function cropBox(img) {
  const full = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  try {
    const s = Math.min(1, 320 / Math.max(full.w, full.h));
    const w = Math.max(1, Math.round(full.w * s));
    const h = Math.max(1, Math.round(full.h * s));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return full;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (d[(y * w + x) * 4 + 3] > 16) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) return full;
    const m = 3; // a little air around the rooms
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
    return { x: x0 / s, y: y0 / s, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s };
  } catch (e) {
    return full; // a picture from another origin can't be read: show it whole
  }
}

const PENDING_MS = 45000; // how long a floor or setting change shows before the robot confirms it

class RobotVacuumCard extends HTMLElement {
  static getStubConfig(hass) {
    const v = Object.keys(hass?.states || {}).find((id) => id.startsWith("vacuum."));
    return { entity: v || "vacuum.robot" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "vacuum" } } },
        { type: "grid", name: "", schema: [
          { name: "layout", selector: { select: { mode: "dropdown", options: [
            { value: "full", label: "Vacuum (state, map, rooms, buttons)" }, { value: "mode", label: "Cleaning mode (like the Roborock app)" }] } } },
          { name: "name", selector: { text: {} } },
        ] },
        { name: "auto_clean", selector: { entity: { domain: ["automation", "input_boolean", "switch"] } } },
        { type: "grid", name: "", schema: [
          { name: "hide_map", selector: { boolean: {} } },
          { name: "hide_rooms", selector: { boolean: {} } },
        ] },
        { name: "rooms", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({
          entity: "Vacuum",
          layout: "Layout",
          name: "Name",
          auto_clean: "Auto clean (automation or switch)",
          hide_map: "Hide the map",
          hide_rooms: "Hide the rooms",
          rooms: "Rooms (YAML)",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          layout: "Put a second card with layout Cleaning mode next to the vacuum card for the mode, suction, scrub, count and route buttons.",
          auto_clean: "Shows an Auto clean pill that turns this on and off, glowing while it is on.",
          rooms: "Per room, by the robot's room name: icon, name and hide. E.g. En-suite Bathroom: { icon: mdi:shower }",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.entity || !String(config.entity).startsWith("vacuum.")) throw new Error("Set entity to your vacuum (vacuum.…)");
    this._config = { ...config };
    this._built = false;
    this._found = null;
    this._sel = new Set();
    this._pending = {};
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return this._config?.layout === "mode" ? 5 : 9;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    COUNT_CARDS.add(this);
    if (this._built && this._ro && this._mapEl) this._ro.observe(this._mapEl);
  }

  disconnectedCallback() {
    COUNT_CARDS.delete(this);
    this._ro?.disconnect();
  }

  _more(id) {
    if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }

  /* A change shown before the robot confirms it: the floor, or a setting. */
  _pend(k, v) {
    this._pending[k] = { v, t: Date.now() };
  }
  _shown(k, actual) {
    const p = this._pending[k];
    if (!p) return actual;
    if (p.v === actual || Date.now() - p.t > PENDING_MS) {
      delete this._pending[k];
      return actual;
    }
    return p.v;
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    if (this._config.layout === "mode") {
      root.innerHTML = `<style>${CSS}</style><ha-card><div class="body">
        <div class="label"><div class="slot"><ha-icon icon="mdi:tune-variant"></ha-icon></div><span class="t">${esc(this._config.title || "Cleaning mode")}</span></div>
        <div class="seg tabs"></div><div class="sets body"></div></div></ha-card>`;
      root.querySelector("ha-card").addEventListener("click", (e) => this._clickMode(e));
      this._built = true;
      this._keys = {};
      return;
    }
    root.innerHTML = `<style>${CSS}</style><ha-card><div class="body">
      <div class="head"><div class="shape" role="button" tabindex="0" aria-label="Vacuum details"><ha-icon></ha-icon></div>
        <div class="txt" data-e="${esc(this._config.entity)}" role="button" tabindex="0"><div class="nm"></div><div class="sc line"></div></div>
        <button class="pill batt"><ha-icon></ha-icon><span></span></button></div>
      <div class="msgs"></div>
      <div class="jt" hidden><div class="pct"></div><div class="pbar"><i></i></div></div>
      <div class="seg floors" hidden></div>
      <div class="map" role="button" tabindex="0" aria-label="Map" hidden><canvas></canvas><span class="loading" hidden>Loading map…</span></div>
      <div class="rooms"></div>
      <div class="acts"></div></div></ha-card>`;
    const card = root.querySelector("ha-card");
    card.addEventListener("click", (e) => this._click(e));
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".txt, .shape, .map, .msg")) {
        e.preventDefault();
        this._click(e);
      }
    });
    this._mapEl = root.querySelector(".map");
    this._mapKey = null;
    this._imgs = {};
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this._paintMap());
      this._ro.observe(this._mapEl);
    }
    this._bindHold(root.querySelector(".acts"));
    this._built = true;
    this._keys = {};
  }

  _click(e) {
    const t = e.target;
    if (t.closest(".shape")) return this._more(this._config.entity);
    const room = t.closest("[data-room]");
    if (room) {
      if (room.getAttribute("aria-disabled") === "true" || room.disabled) return;
      const id = Number(room.dataset.room);
      this._sel.has(id) ? this._sel.delete(id) : this._sel.add(id);
      return this._render();
    }
    const floor = t.closest("[data-floor]");
    if (floor) {
      if (floor.disabled || floor.getAttribute("aria-pressed") === "true") return;
      return this._switchFloor(floor.dataset.floor);
    }
    const act = t.closest(".acts .pill");
    if (act) {
      if (act.disabled || this._held) {
        this._held = false;
        return;
      }
      return this._action(act.dataset.k);
    }
    if (t.closest(".map")) return this._more(this._m?.image?.id);
    if (t.closest(".batt")) return this._more(this._found.battery);
    const v = t.closest("[data-e]");
    if (v) this._more(v.dataset.e);
  }

  /* Hold the Auto clean pill for its more-info (a tap asks, then toggles it). */
  _bindHold(box) {
    let timer = null;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    box.addEventListener("pointerdown", (e) => {
      const b = e.target.closest(".pill[data-k='auto']");
      if (!b || (e.button !== undefined && e.button !== 0)) return;
      this._held = false;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        this._held = true;
        this._more(this._config.auto_clean);
      }, 500);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => box.addEventListener(t, cancel));
    box.addEventListener("contextmenu", (e) => e.target.closest(".pill[data-k='auto']") && e.preventDefault());
    box.addEventListener("touchend", (e) => this._held && e.preventDefault());
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    if (!this._found || this._regRef !== hass.entities || !this._found.battery) {
      this._found = discover(hass, this._config);
      this._regRef = hass.entities;
    }
    if (this._config.layout === "mode") return this._renderMode();
    inkSchedule(this, ".txt");
    this._loadMaps();
    const selected = this._found.map_select ? hass.states[this._found.map_select]?.state : null;
    const shownMap = this._shown("floor", selected);
    const m = model(hass, this._config, this._found, this._maps, shownMap);
    this._m = m;
    const root = this.shadowRoot;
    const set = (sel, v, html = false) => {
      const n = root.querySelector(sel);
      if (n && (html ? n.innerHTML !== v : n.textContent !== v)) html ? (n.innerHTML = v) : (n.textContent = v);
    };
    const offline = m.key === "offline";
    const busy = BUSY.includes(m.key);

    // Head: state circle, name · state, the line, battery.
    const shape = root.querySelector(".shape");
    shape.style.background = tint(m.state.color, 20);
    const ic = shape.querySelector("ha-icon");
    if (ic.getAttribute("icon") !== m.state.icon) ic.setAttribute("icon", m.state.icon);
    ic.style.color = m.state.color;
    set(".nm", `${esc(m.name)} <span class="st">· ${esc(m.state.word)}</span>`, true);
    // Each part stays whole ("28 min" never splits); the line breaks only between parts.
    set(".line", m.line.map((p) => `<span class="p"${p.e ? ` data-e="${esc(p.e)}"` : ""}>${esc(p.t)}</span>`).join(" · "), true);
    const batt = root.querySelector(".batt");
    batt.hidden = m.battery === null;
    if (m.battery !== null) {
      const b = m.battery;
      const lvl = Math.max(10, Math.min(100, Math.round(b / 10) * 10));
      const icon = m.charging ? `mdi:battery-charging-${lvl === 100 ? 100 : lvl}` : lvl === 100 ? "mdi:battery" : `mdi:battery-${lvl}`;
      const bi = batt.querySelector("ha-icon");
      if (bi.getAttribute("icon") !== icon) bi.setAttribute("icon", icon);
      bi.style.color = b <= 15 ? C.red : b <= 30 ? C.amber : C.green;
      batt.classList.toggle("low", b <= 15 && !m.charging);
      set(".batt span", `${fmt(b)}%`);
    }

    // What needs you.
    const msgKey = m.msgs.map((x) => x.text + x.c).join("|");
    if (msgKey !== this._keys.msgs) {
      set(".msgs", m.msgs
        .map((x) => `<div class="msg" role="button" tabindex="0" data-e="${esc(x.e || "")}" style="background:${tint(x.c, 10)};color:${tx(x.c, 85)}">
          <ha-icon icon="mdi:alert-circle-outline" style="color:${x.c}"></ha-icon><span>${esc(x.text)}</span></div>`).join(""), true);
      this._keys.msgs = msgKey;
    }

    // The job: progress, time and area while cleaning or paused.
    const jt = root.querySelector(".jt");
    const showJob = (m.key === "cleaning" || m.key === "paused") && m.progress !== null;
    jt.hidden = !showJob;
    if (showJob) {
      const p = Math.max(0, Math.min(100, m.progress));
      const f = this._found;
      const e = (id, t) => (id ? `<span data-e="${esc(id)}">${esc(t)}</span>` : esc(t));
      const bits = [m.time !== null ? e(f.time, mins(m.time)) : "", m.area !== null ? e(f.area, `${fmt(m.area, 1)} m²`) : ""].filter(Boolean).join(" · ");
      set(".pct", `${e(f.progress, `${fmt(p)}%`)}<span class="when">${bits}</span>`, true);
      const bar = root.querySelector(".pbar i");
      bar.style.width = `${p}%`;
      bar.style.background = m.state.color;
    }

    // Floors (the robot's loaded map): only while it isn't on a job. A switch shows at once.
    const floors = root.querySelector(".floors");
    floors.hidden = !m.floors.length || busy || !this._found.map_select;
    if (!floors.hidden) {
      const fk = m.floors.join("|");
      if (fk !== this._keys.floors) {
        floors.innerHTML = m.floors.map((f) => `<button data-floor="${esc(f)}">${esc(f)}</button>`).join("");
        this._keys.floors = fk;
      }
      floors.querySelectorAll("button").forEach((b) => {
        const on = String(b.dataset.floor === m.mapName);
        if (b.getAttribute("aria-pressed") !== on) b.setAttribute("aria-pressed", on);
        b.disabled = offline;
      });
    }
    if (m.mapName !== this._lastMap) {
      this._sel.clear();
      this._lastMap = m.mapName;
    }

    // Map, with every floor's picture loaded ahead.
    this._preload();
    const map = root.querySelector(".map");
    map.hidden = !!this._config.hide_map || !m.image;
    if (!map.hidden) this._syncMap(m.image);
    map.querySelector(".loading").hidden = !this._pending.floor;

    // Rooms: tap to add to a clean. While a job runs they show where the robot is.
    const rooms = root.querySelector(".rooms");
    rooms.hidden = !!this._config.hide_rooms;
    if (!rooms.hidden) {
      const rk = m.rooms.map((r) => `${r.id}:${r.name}`).join("|");
      if (rk !== this._keys.rooms) {
        rooms.innerHTML = m.rooms
          .map((r) => `<button class="chip" data-room="${r.id}"><ha-icon></ha-icon><span>${esc(this._config.rooms?.[r.name]?.name || r.name)}</span></button>`)
          .join("");
        this._keys.rooms = rk;
      }
      for (const id of [...this._sel]) if (!m.rooms.some((r) => r.id === id)) this._sel.delete(id);
      rooms.querySelectorAll(".chip").forEach((b) => {
        const r = m.rooms.find((x) => String(x.id) === b.dataset.room);
        const on = this._sel.has(r.id) && !busy;
        b.classList.toggle("sel", on);
        b.classList.toggle("now", busy && !!m.room && r.name === m.room);
        b.setAttribute("aria-pressed", String(on));
        b.setAttribute("aria-disabled", String(busy));
        b.disabled = offline;
        const icon = on ? "mdi:check" : roomIcon(this._hass, this._config, r.name);
        const ri = b.querySelector("ha-icon");
        if (ri.getAttribute("icon") !== icon) ri.setAttribute("icon", icon);
      });
    }

    // Buttons for the state, rebuilt only when the set changes (taps are never lost).
    const n = this._sel.size;
    const acts = [];
    if (m.key === "cleaning") acts.push(["pause", "Pause", "mdi:pause", C.amber], ["dock", "Dock", "mdi:home-import-outline", C.grey]);
    else if (m.key === "paused") acts.push(["resume", "Resume", "mdi:play", C.blue], ["dock", "Dock", "mdi:home-import-outline", C.grey]);
    else if (m.key === "returning") acts.push(["pause", "Pause", "mdi:pause", C.amber]);
    else {
      acts.push(["clean", n ? `Clean ${n} room${n > 1 ? "s" : ""}` : "Clean all", "mdi:play", C.blue]);
      // One control per job: Dock only while the robot is away from the dock.
      if (hass.states[this._config.entity]?.state !== "docked") acts.push(["dock", "Dock", "mdi:home-import-outline", C.grey]);
    }
    if (this._config.auto_clean) acts.push(["auto", this._config.auto_clean_name || "Auto clean", "mdi:account-arrow-right", null]);
    const ak = acts.map((a) => a[0]).join();
    const box = root.querySelector(".acts");
    if (ak !== this._keys.acts) {
      box.style.setProperty("--n", String(acts.length));
      box.innerHTML = acts
        .map(([k, , icon, color]) => `<button class="pill" data-k="${k}"><ha-icon icon="${icon}"${color ? ` style="color:${color}"` : ""}></ha-icon><span></span></button>`)
        .join("");
      this._keys.acts = ak;
    }
    for (const [k, label] of acts) {
      const b = box.querySelector(`[data-k="${k}"]`);
      const sp = b.querySelector("span");
      if (sp.textContent !== label) sp.textContent = label;
      if (b.disabled !== offline) b.disabled = offline;
      if (k === "auto") {
        const on = m.auto?.state === "on";
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
        b.disabled = !m.auto || DEAD.includes(m.auto.state);
      }
    }
  }

  /* ---- Cleaning mode panel (layout: mode) ---- */

  _modeRows() {
    const hass = this._hass;
    const f = this._found;
    const st = (id) => (id ? hass.states[id] : undefined);
    const v = st(this._config.entity);
    const live = (k, x) => this._shown(k, DEAD.includes(x) ? null : x ?? null);
    const mode = live("mode", st(f.mode)?.state);
    const fan = live("fan", v?.attributes?.fan_speed);
    const water = live("water", st(f.mop_water)?.state);
    const route = live("route", st(f.mop_route)?.state);
    const rows = [];
    // Suction for Vacuum and Vac & mop (Max+ only in Vacuum); scrub & water for Mop and Vac & mop;
    // Fast and Standard routes always, Deep and Deep+ only in Mop – as in the Roborock app.
    if (v?.attributes?.fan_speed_list && mode !== "mop")
      rows.push({ k: "fan", label: "Suction power", cur: fan, icons: FAN_ICON,
        opts: offer(v.attributes.fan_speed_list, fan, ORDER.fan).filter((o) => o !== "max_plus" || mode === "vacuum" || o === fan) });
    if (st(f.mop_water) && mode !== "vacuum")
      rows.push({ k: "water", label: "Scrub intensity & water flow", cur: water, icons: WATER_ICON, opts: offer(st(f.mop_water).attributes?.options, water, ORDER.water) });
    rows.push({ k: "count", label: "Cleaning count", cur: String(getCount(this._config.entity)), opts: ["1", "2"], text: (o) => `×${o}`,
      value: (o) => `${o} time${o === "1" ? "" : "s"}` });
    if (st(f.mop_route))
      rows.push({ k: "route", label: "Route", cur: route, svg: true,
        opts: offer(st(f.mop_route).attributes?.options, route, ORDER.route).filter((o) => !["deep", "deep_plus"].includes(o) || mode === "mop" || o === route) });
    return { mode, rows };
  }

  _renderMode() {
    const root = this.shadowRoot;
    const hass = this._hass;
    const f = this._found;
    const v = hass.states[this._config.entity];
    const offline = !v || DEAD.includes(v.state);
    const modeEnt = f.mode ? hass.states[f.mode] : null;
    const { mode, rows } = this._modeRows();

    const tabs = root.querySelector(".tabs");
    const modes = MODES.filter((x) => (modeEnt?.attributes?.options || []).includes(x));
    tabs.hidden = !modes.length;
    const tk = modes.join();
    if (tk !== this._keys.tabs) {
      tabs.innerHTML = modes.map((x) => `<button data-set="mode" data-v="${x}">${esc(optLabel(x))}</button>`).join("");
      this._keys.tabs = tk;
    }
    tabs.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.v === mode));
      b.disabled = offline;
    });

    const box = root.querySelector(".sets");
    const rk = rows.map((r) => `${r.k}:${r.opts.join(",")}`).join("|");
    if (rk !== this._keys.rows) {
      box.innerHTML = rows
        .map((r) => `<div class="set" data-k="${r.k}"><div class="k">${esc(r.label)}<b></b></div><div class="seg">${r.opts
          .map((o) => {
            const label = r.text ? r.text(o) : optLabel(o);
            const inner = r.icons?.[o] ? `<ha-icon icon="${r.icons[o]}"></ha-icon>` : r.svg && routeSvg(o) ? routeSvg(o) : esc(label);
            return `<button data-set="${r.k}" data-v="${esc(o)}" title="${esc(label)}" aria-label="${esc(label)}">${inner}</button>`;
          }).join("")}</div></div>`)
        .join("");
      this._keys.rows = rk;
    }
    for (const r of rows) {
      const sect = box.querySelector(`[data-k="${r.k}"]`);
      const val = r.cur === null || r.cur === undefined ? "" : r.value ? r.value(r.cur) : optLabel(r.cur);
      const b = sect.querySelector(".k b");
      if (b.textContent !== val) b.textContent = val;
      sect.querySelectorAll("button").forEach((x) => {
        x.setAttribute("aria-pressed", String(x.dataset.v === r.cur));
        x.disabled = offline && r.k !== "count";
      });
    }
  }

  _clickMode(e) {
    const b = e.target.closest("button[data-set]");
    if (!b || b.disabled || b.getAttribute("aria-pressed") === "true") return;
    const k = b.dataset.set;
    const v = b.dataset.v;
    const f = this._found;
    const id = this._config.entity;
    if (k === "count") return setCount(id, Number(v));
    // Show the choice at once; the robot's answer confirms it (or it falls back after a while).
    this._pend(k, v);
    this._render();
    if (k === "fan") return this._call("vacuum", "set_fan_speed", { entity_id: id, fan_speed: v });
    const ent = { mode: f.mode, water: f.mop_water, route: f.mop_route }[k];
    if (ent) return this._call("select", "select_option", { entity_id: ent, option: v });
  }

  /* Rooms and segment ids per map, from roborock.get_maps (or the maps: option). */
  _loadMaps() {
    if (this._config.maps) {
      if (!this._maps)
        this._maps = this._config.maps.map((x) => ({ name: x.name, rooms: Object.entries(x.rooms || {}).map(([id, name]) => ({ id: Number(id), name })) }));
      return;
    }
    const opts = (this._hass.states[this._found?.map_select]?.attributes?.options || []).join("|");
    const stale = this._maps && this._mapsFor !== opts;
    const retry = !this._maps && this._mapsTried && Date.now() - this._mapsTried > 60000;
    if (this._mapsLoading || (this._maps && !stale) || (this._mapsTried && !retry && !stale)) return;
    if (typeof this._hass.callWS !== "function") return;
    this._mapsLoading = true;
    this._mapsTried = Date.now();
    const id = this._config.entity;
    this._hass
      .callWS({ type: "call_service", domain: "roborock", service: "get_maps", target: { entity_id: id }, return_response: true })
      .then((r) => {
        const maps = r?.response?.[id]?.maps;
        if (Array.isArray(maps)) {
          this._maps = maps.map((x) => ({ name: x.name, rooms: Object.entries(x.rooms || {}).map(([sid, name]) => ({ id: Number(sid), name })) }));
          this._mapsFor = opts;
        }
      })
      .catch(() => {})
      .finally(() => {
        this._mapsLoading = false;
        this._render();
      });
  }

  /* Every floor's picture, loaded once per version of the map (the URL's token rotates, the
     picture doesn't), so a floor switch paints from memory. */
  _preload() {
    if (typeof Image === "undefined" || this._config.hide_map) return;
    for (const id of this._found.images || []) {
      const s = this._hass.states[id];
      const pic = s?.attributes?.entity_picture;
      if (!pic) continue;
      const key = `${id}|${s.state}`;
      if (this._imgs[key]) continue;
      const img = new Image();
      img.decoding = "async";
      const entry = { img, crop: null, ready: false };
      this._imgs[key] = entry;
      img.onload = () => {
        entry.crop = cropBox(img);
        entry.ready = true;
        // Older versions of this floor's picture are no longer needed.
        for (const k of Object.keys(this._imgs)) if (k.startsWith(`${id}|`) && k !== key && this._imgs[k].ready) delete this._imgs[k];
        if (this._mapKey === key) this._paintMap();
      };
      img.src = pic;
    }
  }

  _syncMap(image) {
    const s = this._hass.states[image.id];
    const key = `${image.id}|${s?.state}`;
    if (key === this._mapKey) return;
    // Keep showing the current picture until the next one is ready, unless the floor changed.
    const entry = this._imgs[key];
    if (entry?.ready || !this._mapKey || !this._mapKey.startsWith(`${image.id}|`)) {
      this._mapKey = key;
      this._paintMap();
    } else this._nextKey = key;
  }

  _paintMap() {
    if (this._nextKey && this._imgs[this._nextKey]?.ready) {
      this._mapKey = this._nextKey;
      this._nextKey = null;
    }
    const entry = this._imgs?.[this._mapKey];
    const box = this._mapEl;
    const cv = box?.querySelector("canvas");
    if (!cv || box.hidden) return;
    if (!entry?.ready) {
      cv.width = 0;
      return;
    }
    const pad = 8;
    const W = box.clientWidth - pad * 2;
    const H = box.clientHeight - pad * 2;
    const c = entry.crop;
    if (W <= 0 || H <= 0 || !c?.w || !c?.h) return;
    const sc = Math.min(W / c.w, H / c.h);
    const w = Math.round(c.w * sc);
    const h = Math.round(c.h * sc);
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(entry.img, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  }

  /* What a clean will use, for the confirmation: "Vac & mop · Turbo · Standard mop". */
  _settingsText() {
    const hass = this._hass;
    const f = this._found;
    const mode = hass.states[f.mode]?.state;
    const fan = hass.states[this._config.entity]?.attributes?.fan_speed;
    const water = hass.states[f.mop_water]?.state;
    return [
      mode && !DEAD.includes(mode) ? optLabel(mode) : "",
      fan && mode !== "mop" ? optLabel(fan) : "",
      water && !DEAD.includes(water) && water !== "off" && mode !== "vacuum" ? `${optLabel(water)} mop` : "",
    ].filter(Boolean).join(" · ");
  }

  _ask(title, icon, color, secondary, confirmLabel) {
    return confirmDialog({ title, icon, color, primary: this._m?.name || "Vacuum", secondary, confirmLabel });
  }

  async _switchFloor(name) {
    const ok = await this._ask(`Switch to ${name}`, "mdi:layers-outline", C.blue,
      `Only once the robot is on that floor: it loads the ${name} map and its rooms.`, "Switch");
    if (!ok) return;
    this._sel.clear();
    this._pend("floor", name);
    this._render();
    return this._call("select", "select_option", { entity_id: this._found.map_select, option: name });
  }

  /* Every button asks first except Pause (the user's choice). */
  async _action(k) {
    const id = this._config.entity;
    const m = this._m;
    const how = this._settingsText();
    if (k === "clean") {
      const segs = [...this._sel];
      const twice = getCount(id) === 2;
      // ×2 with no rooms picked: every room on the floor, twice.
      const all = !segs.length && twice ? m.rooms.map((r) => r.id) : [];
      const names = segs.map((s) => m.rooms.find((r) => r.id === s)?.name).filter(Boolean);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
      const times = twice ? ", twice" : "";
      const ok = await this._ask(
        segs.length ? `Clean ${segs.length} room${segs.length > 1 ? "s" : ""}` : "Clean all",
        "mdi:play", C.blue,
        segs.length ? `${list}${times}${how ? `, ${how}` : ""}.` : `Every room${m.mapName ? ` on the ${m.mapName}` : ""}${times}${how ? `, ${how}` : ""}.`,
        "Clean",
      );
      if (!ok) return;
      this._sel.clear();
      this._render();
      const target = segs.length ? segs : all;
      if (target.length) return this._call("vacuum", "send_command", { entity_id: id, command: "app_segment_clean", params: [{ segments: target, repeat: twice ? 2 : 1 }] });
      return this._call("vacuum", "start", { entity_id: id });
    }
    if (k === "pause") return this._call("vacuum", "pause", { entity_id: id });
    if (k === "resume") {
      if (await this._ask("Resume", "mdi:play", C.blue, "The robot carries on with the paused clean.", "Resume")) this._call("vacuum", "start", { entity_id: id });
      return;
    }
    if (k === "dock") {
      const ends = ["cleaning", "paused"].includes(m.key);
      const ok = await this._ask("Return to the dock", "mdi:home-import-outline", ends ? C.orange : C.blue,
        ends ? "This ends the current clean. The robot goes back to the dock." : "The robot goes back to the dock.", "Dock");
      if (ok) this._call("vacuum", "return_to_base", { entity_id: id });
      return;
    }
    if (k === "auto") {
      const a = this._config.auto_clean;
      const on = this._hass.states[a]?.state === "on";
      const label = this._config.auto_clean_name || "Auto clean";
      const ok = await this._ask(on ? `Turn off ${label}` : `Turn on ${label}`, "mdi:account-arrow-right", on ? C.orange : C.teal,
        on ? `${label} stops until you turn it back on.` : `${label} runs again.`, on ? "Turn off" : "Turn on");
      if (!ok) return;
      const [domain] = a.split(".");
      const svc = ["automation", "input_boolean", "switch"].includes(domain) ? domain : "homeassistant";
      return this._call(svc, on ? "turn_off" : "turn_on", { entity_id: a });
    }
  }

  async _call(domain, service, data) {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || "That did not work" }, bubbles: true, composed: true }));
    }
  }
}

async function registerRobotVacuumCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(RVC_TAG)) return;
  registry.define(RVC_TAG, RobotVacuumCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: RVC_TAG,
    name: "Robot vacuum",
    description: "Robot vacuum: state, battery, map with floors, room cleaning and buttons – or (layout: mode) the cleaning mode, like the Roborock app.",
  });
  console.info(`%c ROBOT-VACUUM-CARD %c ${RVC_VERSION} `, "background:#2196f3;color:#fff", "");
}

registerRobotVacuumCard();
