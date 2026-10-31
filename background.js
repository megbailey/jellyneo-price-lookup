import {
  CACHE_TTL_MS,
  MAX_CONCURRENCY,
  REQUEST_GAP_MS,
  parseHistoryHtml,
  parseSearchHtml,
  searchUrl,
} from "./jn.js";

const CACHE_KEY = "jnPriceCache";
const PENDING_KEY = "pendingLookup";

/** @type {{ lastAt: number, inflight: number, queue: Array<() => void> }} */
const gate = { lastAt: 0, inflight: 0, queue: [] };

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "jn-lookup-selection",
      title: "Look up “%s” in Jellyneo Prices",
      contexts: ["selection"],
    });
  });
});

// Selection → stash name for the popup. Never touches the page DOM.
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "jn-lookup-selection") return;
  const name = (info.selectionText || "").trim();
  if (!name) return;

  await chrome.storage.session.set({ [PENDING_KEY]: name });

  try {
    await chrome.action.openPopup();
  } catch {
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`popup.html?q=${encodeURIComponent(name)}`),
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((err) => {
    sendResponse({ ok: false, error: String(err?.message || err) });
  });
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "JN_LOOKUP":
      return { ok: true, result: await lookupItem(message.name) };
    case "JN_TAKE_PENDING": {
      const data = await chrome.storage.session.get(PENDING_KEY);
      const name = data[PENDING_KEY] || null;
      if (name) await chrome.storage.session.remove(PENDING_KEY);
      return { ok: true, name };
    }
    case "JN_CLEAR_CACHE":
      await chrome.storage.local.set({ [CACHE_KEY]: {} });
      return { ok: true };
    default:
      return { ok: false, error: "Unknown message type" };
  }
}

/**
 * @param {string} name
 */
async function lookupItem(name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Empty item name");

  const cached = await cacheGet(clean);
  if (cached !== undefined) return cached;

  const result = await withRateLimit(() => fetchJnItem(clean));
  await cachePut(clean, result);
  return result;
}

async function fetchJnItem(name) {
  const res = await fetch(searchUrl(name), {
    credentials: "omit",
    headers: { Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`Jellyneo HTTP ${res.status}`);
  const html = await res.text();

  if (/cf-mitigated|Just a moment|challenge-platform/i.test(html)) {
    throw new Error(
      "Jellyneo blocked the request (Cloudflare). Open items.jellyneo.net in a tab once, then try again."
    );
  }

  let result = parseSearchHtml(html, name);

  if (result.inflated && result.historyUrl && result.price == null) {
    try {
      const histRes = await fetch(result.historyUrl, {
        credentials: "omit",
        headers: { Accept: "text/html" },
      });
      if (histRes.ok) {
        const histHtml = await histRes.text();
        const price = parseHistoryHtml(histHtml);
        if (price != null) result = { ...result, price };
      }
    } catch {
      // keep inflated flag with null price
    }
  }

  const { historyUrl: _h, ...publicResult } = result;
  return publicResult;
}

function withRateLimit(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      gate.inflight += 1;
      try {
        const wait = Math.max(0, REQUEST_GAP_MS - (Date.now() - gate.lastAt));
        if (wait) await sleep(wait);
        gate.lastAt = Date.now();
        resolve(await fn());
      } catch (err) {
        reject(err);
      } finally {
        gate.inflight -= 1;
        pump();
      }
    };

    gate.queue.push(run);
    pump();
  });
}

function pump() {
  while (gate.inflight < MAX_CONCURRENCY && gate.queue.length) {
    const next = gate.queue.shift();
    next();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cacheGet(name) {
  const data = await chrome.storage.local.get(CACHE_KEY);
  const cache = data[CACHE_KEY] || {};
  const hit = cache[name];
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.entry;
  return undefined;
}

async function cachePut(name, entry) {
  const data = await chrome.storage.local.get(CACHE_KEY);
  const cache = data[CACHE_KEY] || {};
  const now = Date.now();
  cache[name] = { ts: now, entry };
  for (const key of Object.keys(cache)) {
    if (now - cache[key].ts >= CACHE_TTL_MS) delete cache[key];
  }
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}
