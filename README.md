# Jellyneo Price Lookup (Chrome extension)

Local-only Chrome extension that looks up Neopets item prices on [Jellyneo’s Item Database](https://items.jellyneo.net/) from the **extension popup only**.

It does **not** inject scripts, CSS, overlays, or badges into Neopets pages, and it does not request access to `neopets.com`.

## Install (unpacked)

1. Download / unzip `jellyneo-price-lookup.zip` if needed
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Choose the `jellyneo-price-lookup` folder (the one that contains `manifest.json`)

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
# jellyneo-price-lookup
