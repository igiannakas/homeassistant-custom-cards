#!/usr/bin/env node
/*
 * Builds dist/homeassistant-custom-cards.js – every card in one file, for HACS.
 *
 * HACS installs one JavaScript file per repository, so the cards are bundled: each
 * card's source is wrapped in its own function scope (their helper names would
 * otherwise collide) and concatenated in a fixed order. No dependencies, no
 * transpiling – the cards already run as they are in the browser.
 *
 *   npm run build          write dist/
 *   npm run build -- --check   fail if dist/ is out of date (used by npm test)
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "dist", "homeassistant-custom-cards.js");
const cards = fs
  .readdirSync(path.join(root, "cards"))
  .filter((d) => fs.existsSync(path.join(root, "cards", d, `${d}.js`)))
  .sort();

const version = (src) => (src.match(/_VERSION = "([^"]+)"/) || [])[1] || "?";
const parts = cards.map((name) => {
  const src = fs.readFileSync(path.join(root, "cards", name, `${name}.js`), "utf8").trimEnd();
  return `/* ===== ${name} ${version(src)} ===== */\n(() => {\n${src}\n})();\n`;
});
const bundle =
  `/*\n * Home Assistant custom cards – https://github.com/igiannakas/homeassistant-custom-cards\n` +
  ` * Built from the cards folder by scripts/build.js – edit the cards, not this file.\n` +
  ` * ${cards.map((n) => `${n}`).join(", ")}\n */\n\n` +
  parts.join("\n");

if (process.argv.includes("--check")) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (current !== bundle) {
    console.error("dist/homeassistant-custom-cards.js is out of date – run: npm run build");
    process.exit(1);
  }
  console.log(`dist up to date (${cards.length} cards)`);
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bundle);
  console.log(`wrote ${path.relative(root, out)} (${cards.length} cards, ${bundle.length} bytes)`);
}
