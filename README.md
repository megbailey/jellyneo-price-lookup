# Jellyneo Price Lookup (Chrome extension)

Local-only Chrome extension that looks up Neopets item prices on [Jellyneo’s Item Database](https://items.jellyneo.net/) from the **extension popup only**.

It does **not** inject scripts, CSS, overlays, or badges into Neopets pages, and it does not request access to `neopets.com`.

## Install (unpacked)

1. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Choose the `dist` folder

`npm run watch` rebuilds `dist/` when source files change. Reload the extension on `chrome://extensions` after a rebuild.

`npm run build` also packs `dist/jellyneo-price-lookup.crx`. The packed extension ID stays stable when `jellyneo-price-lookup-key.pem` is present in the repo root (it is gitignored). A build without that key uses a throwaway key, so the packed ID changes. The public key in `manifest.json` keeps unpacked loads of `dist/` on the same ID as a CRX signed with that pem.

## Usage

1. Click the extension icon
2. Type/paste an **exact** item name
3. Hit **Look up**

Optional: highlight an item name → right-click → **Look up “…” in Jellyneo Prices**.

## Permissions

- `items.jellyneo.net` — price lookups only
- `storage` — local price cache
- `contextMenus` — selection → popup handoff

No `neopets.com` host permission. No content scripts.
