# Jellyneo Price Lookup (Chrome extension)

Chrome extension that looks up Neopets item prices on [Jellyneo’s Item Database](https://items.jellyneo.net/) from the extension popup.

Opening the popup reads item names only when the open tab is `neopets.com`. On any other site it does not run in the page. That read does not change the page and does not send a request to Neopets. There is no `neopets.com` host permission and no content script. Prices are requested from Jellyneo only.

The function runs in Chrome's isolated world, which the page's JavaScript cannot see. It does not add a script tag, load a file, or change the page. Reading the item names does not send a request to Neopets, so nothing shows up in their logs either.

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

1. On a Neopets inventory, shop, or other item page, click the extension icon
2. The popup lists item names already on that tab and fills in Jellyneo prices
3. Or type/paste an **exact** item name and hit **Look up**

Recent lookups stay in the popup. On a Neopets page, highlight an item name → right-click → **Look up “…” in Jellyneo Prices**. That menu does not appear on other sites.

Only the items on the current page are read. The extension does not page through a shop or safety deposit box, because that would contact Neopets.

## Permissions

- `items.jellyneo.net` — price lookups only
- `storage` — local price cache and recent lookups
- `contextMenus` — selection → popup handoff
- `activeTab` and `scripting` — when you open the popup on `neopets.com`, read item names from that tab

No `neopets.com` host permission. No content scripts.
