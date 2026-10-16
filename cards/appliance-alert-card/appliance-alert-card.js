/*
 * Appliance alert card – an appliance that needs you (a water tank to empty), at the top of its page.
 *
 *   type: custom:appliance-alert-card
 *   entity: input_boolean.clothes_dryer_tank_alert
 *   since: input_datetime.clothes_dryer_tank_full_since
 *   message: Water tank full, please empty
 *
 * The card shows only while `entity` is on, and takes no room otherwise: it hides itself the way
 * Home Assistant's conditional cards do, so the section closes up around it (in the dashboard
 * editor it stays visible, as a preview). An automation turns the entity on when the appliance
 * stops with its plug on, and off again the next time the appliance runs.
 *
 * One row, on one centre line: the glyph (red, a call for attention; decorative, so no circle),
 * the message with "Stopped at 20:34" under it (from `since`, ink-aligned with the message), and
 * the Cleared pill, which turns the entity off at once (clearing an alert is benign, so no
 * dialog). The whole card glows red. The pill stays beside the message while both fit on one
 * line and moves to a full-width row of its own when they don't (measured, not a breakpoint).
 */

const AAC_VERSION = "1.0.1";
const AAC_TAG = "appliance-alert-card";

const C = {
  teal: "var(--teal-color, #009688)",
  red: "var(--red-color, #f44336)",
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const tx = (c, p = 70) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LIVE = (s) => s && s !== "unavailable" && s !== "unknown";
const DEFAULT_MESSAGE = "Water tank full, please empty";
const DEFAULT_ICON = "mdi:water-alert";
const DEFAULT_CLEAR = "Cleared";

/* Clock parts of a moment in a time zone (undefined = the browser's). */
function zoned(ms, tz) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)))
    parts[p.type] = p.value;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}` };
}

/* "at 20:34" today, "at Thu 20:34" within the week, "on 4 Oct" before that (as the appliance card). */
function when(ms, now, tz) {
  const a = zoned(ms, tz);
  if (a.day === zoned(now, tz).day) return `at ${a.hm}`;
  const days = (now - ms) / 864e5;
  if (days < 6.5) return `at ${new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: tz }).format(new Date(ms))} ${a.hm}`;
  return `on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz }).format(new Date(ms))}`;
}

/* The moment a `since` entity holds: an input_datetime's timestamp attribute (its state is local
   time without a zone), else a timestamp sensor's or datetime entity's ISO state. */
function momentOf(s) {
  if (!s || !LIVE(s.state)) return null;
  const ts = Number(s.attributes?.timestamp);
  if (s.attributes?.has_date && Number.isFinite(ts)) return ts * 1000;
  const t = Date.parse(s.state);
  return Number.isFinite(t) && /[zZ]|[+-]\d\d:?\d\d$/.test(s.state) ? t : null;
}

/* The card's whole view: everything the DOM shows, as plain values. */
function model(hass, cfg, now) {
  const s = hass.states[cfg.entity];
  const active = s?.state === "on";
  const tz = hass.locale?.time_zone === "server" ? hass.config?.time_zone : undefined;
  const at = cfg.since ? momentOf(hass.states[cfg.since]) : null;
  return {
    active,
    message: cfg.message || DEFAULT_MESSAGE,
    icon: cfg.icon || DEFAULT_ICON,
    clear: cfg.clear_label || DEFAULT_CLEAR,
    sub: at !== null && at <= now + 60000 ? `Stopped ${when(at, now, tz)}` : "",
    name: s?.attributes?.friendly_name || cfg.entity,
  };
}

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  :host { display: block; }
  :host([hidden]) { display: none; }
  /* A single-block card: content 10px from the sides like Mushroom, 12px top and bottom for air.
     Mushroom measures those 10px from the card's outer edge (its content overlaps the border), so
     the border width comes off the padding: glyph and message then line up with a Mushroom card on
     a bordered view and a borderless one alike (measured). The whole card glows red – it is only
     here because the appliance needs you. */
  ha-card { padding: 12px calc(10px - var(--ha-card-border-width, 1px)); container-type: inline-size;
    background: color-mix(in srgb, ${C.red} 10%, var(--ha-card-background, var(--card-background-color, #fff))); }
  /* One centre line: glyph, text block and pill. */
  .wrap { display: flex; align-items: center; gap: 10px; }
  .head { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
  /* Mushroom-sized slot: a 24px glyph in 36px, so it sits where a Mushroom shape's glyph does and the
     message starts at edge + 46. Decorative (the pill is the only action), so no circle. */
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; color: ${C.red}; }
  .txt { flex: 1; min-width: 0; }
  .txt > span { display: block; }
  /* Never cut off: the message wraps. */
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .txt.one .nm { position: relative; top: 1px; } /* alone, a 20px line reads ~1px high next to the glyph */
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: ${tx(C.red, 85)}; }
  .sc:empty { display: none; }
  /* Primary pill (36px = the icon slot), neutral, its icon teal: you can tap it. */
  .pill { all: unset; box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; padding: 0 14px 0 10px; border-radius: 18px; cursor: pointer; white-space: nowrap;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; color: var(--primary-text-color);
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.teal}; }
  .pill[aria-disabled="true"] { opacity: .45; cursor: default; }
  /* When message and pill don't fit on one line (measured in _fit()), the pill takes a full-width
     row under the message, which then has the whole width. */
  .wrap.stacked { flex-wrap: wrap; row-gap: 8px; }
  .wrap.stacked .head { flex: 1 1 100%; }
  .wrap.stacked .pill { flex: 1 1 100%; }
  .pill:active { filter: brightness(.92); }
  .pill:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

/* Ink alignment (design rule): every line of a text block starts on the title's vertical line,
   measured on ink rather than boxes – a leading "S" or "1" has its own side bearing. */
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
      if (n.textContent.trim()) return n;
    } else if (n.nodeType === 1 && inkVisible(n)) {
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
function inkAlign(root) {
  for (const b of root.querySelectorAll(".txt")) {
    const lines = [...b.children].filter(inkVisible);
    const t = lines.length > 1 ? inkLead(lines[0]) : null;
    if (!t) continue;
    const ref = inkText(t);
    if (ref === null) return;
    for (const line of lines.slice(1)) {
      const lead = inkLead(line);
      if (!lead) continue;
      const px = ref - inkText(lead);
      const v = Math.abs(px) > 0.2 ? `${px.toFixed(2)}px` : "";
      if (line.style.marginLeft !== v) line.style.marginLeft = v;
    }
  }
}

class ApplianceAlertCard extends HTMLElement {
  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    const alert = ids.find((e) => e.startsWith("input_boolean.") && /alert|full/.test(e)) || ids.find((e) => e.startsWith("input_boolean."));
    return { entity: alert || "input_boolean.example_tank_alert" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: ["input_boolean", "switch"] } } },
        { name: "since", selector: { entity: { domain: ["input_datetime", "sensor", "datetime"] } } },
        { name: "message", selector: { text: {} } },
        { type: "grid", name: "", schema: [
          { name: "icon", selector: { icon: {} } },
          { name: "clear_label", selector: { text: {} } },
        ] },
      ],
      computeLabel: (s) =>
        ({
          entity: "Alert (shown while on)",
          since: "Stopped at",
          message: "Message",
          icon: "Icon",
          clear_label: "Button label",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          entity: "Cleared turns it off. Usually an input_boolean that an automation turns on.",
          since: "An input_datetime (or timestamp sensor) with when the appliance stopped.",
          message: `Default: "${DEFAULT_MESSAGE}".`,
          clear_label: `Default: "${DEFAULT_CLEAR}".`,
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("Set entity: the alert to show while on (e.g. input_boolean.clothes_dryer_tank_alert)");
    this._config = { ...config };
    this._built = false;
    this._pending = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  /* Home Assistant sets this in the dashboard editor: the card shows there even while the alert is off. */
  set preview(v) {
    this._preview = !!v;
    this._render();
  }

  get preview() {
    return !!this._preview;
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    // "Stopped at 20:34" becomes "Stopped at Thu 20:34" after midnight.
    clearInterval(this._timer);
    this._timer = setInterval(() => this._render(), 60000);
    this._observe();
    if (this._hass) this._render();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
    this._ro?.disconnect();
  }

  _now() {
    return Date.now();
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="wrap" role="alert">
        <div class="head"><span class="slot"><ha-icon></ha-icon></span><span class="txt"><span class="nm"></span><span class="sc"></span></span></div>
        <button class="pill"><ha-icon icon="mdi:check"></ha-icon><span></span></button>
      </div></ha-card>`;
    root.querySelector(".pill").addEventListener("click", () => this._clear());
    this._built = true;
    this._observe();
    this.ownerDocument.fonts?.ready?.then(() => this._fit());
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const m = model(this._hass, this._config, this._now());
    this._m = m;

    // Shown while the alert is on (and always in the editor). Hidden the way conditional cards
    // are: Home Assistant's card wrapper reads `hidden` and drops the card from the section.
    const show = m.active || this.preview;
    if (this.hidden !== !show) {
      this.hidden = !show;
      this.dispatchEvent(new CustomEvent("card-visibility-changed", { detail: { value: show } }));
    }
    if (!m.active) this._pending = false;

    // Only touch what changed, so a tap is never lost mid-update. Compare with the string last
    // written – innerHTML never serialises back to exactly the same text.
    const set = (sel, v) => {
      const n = root.querySelector(sel);
      if (n && n._h !== v) {
        n.innerHTML = v;
        n._h = v;
      }
    };
    const ic = root.querySelector(".slot ha-icon");
    if (ic.getAttribute("icon") !== m.icon) ic.setAttribute("icon", m.icon);
    set(".nm", esc(m.message));
    // In the editor while the alert is off, the line under the message says when the card shows.
    const sub = m.active ? m.sub : `Shows while ${m.name} is on`;
    set(".sc", esc(sub));
    root.querySelector(".txt").classList.toggle("one", !sub);
    set(".pill span", esc(m.clear));
    const pill = root.querySelector(".pill");
    const off = !m.active || this._pending;
    if (pill.getAttribute("aria-disabled") !== String(off)) pill.setAttribute("aria-disabled", String(off));

    if (!this._inkQueued) {
      this._inkQueued = true;
      requestAnimationFrame(() => {
        this._inkQueued = false;
        if (!this.shadowRoot) return;
        inkAlign(this.shadowRoot);
        this._fit();
      });
    }
  }

  /* Re-check the layout whenever the card's width changes (rotation, sidebar, column count). */
  _observe() {
    const wrap = this.shadowRoot?.querySelector(".wrap");
    if (!wrap || typeof ResizeObserver === "undefined") return;
    this._ro = this._ro || new ResizeObserver(() => this._fit());
    this._ro.disconnect();
    this._ro.observe(wrap);
  }

  /* Does the pill need its own row? Not while the glyph, the message on one line (and the line
     under it) and the pill at its natural width all fit in the row. Natural widths, so the answer
     is the same whichever layout is showing (no flip-flop). */
  static stacks(available, head, gap, pill) {
    return head + gap + pill > available + 0.5;
  }

  _fit() {
    const root = this.shadowRoot;
    const wrap = root?.querySelector(".wrap");
    if (!wrap || !wrap.clientWidth) return; // not laid out (hidden)
    const range = this.ownerDocument.createRange();
    const contentW = (node) => (range.selectNodeContents(node), range.getBoundingClientRect().width);
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
    const nm = root.querySelector(".nm");
    nm.style.whiteSpace = "nowrap";
    const text = Math.max(contentW(nm), contentW(root.querySelector(".sc")));
    nm.style.whiteSpace = "";
    const headEl = root.querySelector(".head");
    const head = root.querySelector(".slot").offsetWidth + px(headEl, "columnGap") + text;
    const p = root.querySelector(".pill");
    const pill = contentW(p) + px(p, "paddingLeft") + px(p, "paddingRight");
    wrap.classList.toggle("stacked", ApplianceAlertCard.stacks(wrap.clientWidth, head, px(wrap, "columnGap"), pill));
  }

  /* Cleared turns the alert off at once. The pill rests until the state changes or the call fails. */
  async _clear() {
    const m = this._m;
    if (!m?.active || this._pending) return;
    const id = this._config.entity;
    const domain = id.split(".")[0];
    this._pending = true;
    this._render();
    try {
      await this._hass.callService(["input_boolean", "switch"].includes(domain) ? domain : "homeassistant", "turn_off", { entity_id: id });
    } catch (err) {
      this._pending = false;
      this._render();
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || `Couldn't clear ${m.name}.` }, bubbles: true, composed: true }));
    }
  }
}

async function registerApplianceAlertCard() {
  await window.customElements.whenDefined("home-assistant");
  if (window.customElements.get(AAC_TAG)) return;
  window.customElements.define(AAC_TAG, ApplianceAlertCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: AAC_TAG,
    name: "Appliance alert",
    description: "An appliance that needs you (a water tank to empty): shown only while its alert is on, with a Cleared button.",
  });
  console.info(`%c APPLIANCE-ALERT-CARD %c ${AAC_VERSION} `, "background:#f44336;color:#fff", "");
}

registerApplianceAlertCard();
