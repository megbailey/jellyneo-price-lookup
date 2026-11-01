import {
  CACHE_TTL_MS,
  MAX_CONCURRENCY,
  REQUEST_GAP_MS,
  isNeopetsUrl,
  parseHistoryHtml,
  parseSearchHtml,
  searchUrl,
} from "./jn.js";

const CACHE_KEY = "jnPriceCache";
const HISTORY_KEY = "jnLookupHistory";
const PENDING_KEY = "pendingLookup";
const MAX_HISTORY = 20;

/** @type {{ lastAt: number, inflight: number, queue: Array<() => void> }} */
const gate = { lastAt: 0, inflight: 0, queue: [] };

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "jn-lookup-selection",
      title: "Look up “%s” in Jellyneo Prices",
      contexts: ["selection"],
      documentUrlPatterns: [
        "https://neopets.com/*",
        "https://*.neopets.com/*",
        "http://neopets.com/*",
        "http://*.neopets.com/*",
      ],
    });
  });
});

// Selection → stash name for the popup. Never touches the page DOM.
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "jn-lookup-selection") return;
  if (!isNeopetsUrl(info.pageUrl || "")) return;
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
    case "JN_LOOKUP": {
      const result = await lookupItem(message.name, { remember: message.remember !== false });
      return { ok: true, result, history: await listHistory() };
    }
    case "JN_PEEK": {
      const clean = String(message.name || "").trim();
      if (!clean) return { ok: true, result: null };
      const cached = await cacheGet(clean);
      return { ok: true, result: cached === undefined ? null : cached };
    }
    case "JN_LIST_HISTORY":
      return { ok: true, history: await listHistory() };
    case "JN_TAKE_PENDING": {
      const data = await chrome.storage.session.get(PENDING_KEY);
      const name = data[PENDING_KEY] || null;
      if (name) await chrome.storage.session.remove(PENDING_KEY);
      return { ok: true, name };
    }
    case "JN_CLEAR_CACHE":
      await chrome.storage.local.set({ [CACHE_KEY]: {}, [HISTORY_KEY]: [] });
      return { ok: true, history: [] };
    default:
      return { ok: false, error: "Unknown message type" };
  }
}

/**
 * @param {string} name
 */
async function lookupItem(name, options = {}) {
  const remember = options.remember !== false;
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Empty item name");

  const cached = await cacheGet(clean);
  if (cached !== undefined) {
    if (remember) await recordHistory(clean, cached);
    return cached;
  }

  const result = await withRateLimit(() => fetchJnItem(clean));
  await cachePut(clean, result);
  if (remember) await recordHistory(clean, result);
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

async function listHistory() {
  const data = await chrome.storage.local.get([HISTORY_KEY, CACHE_KEY]);
  if (Array.isArray(data[HISTORY_KEY])) return data[HISTORY_KEY];

  const cache = data[CACHE_KEY] || {};
  const seeded = Object.entries(cache)
    .map(([query, hit]) => historyItem(query, hit?.entry, hit?.ts))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: seeded });
  return seeded;
}

async function recordHistory(query, entry) {
  const history = await listHistory();
  const key = query.toLowerCase();
  const next = [
    historyItem(query, entry, Date.now()),
    ...history.filter((item) => String(item?.query || "").trim().toLowerCase() !== key),
  ].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
}

function historyItem(query, entry, ts) {
  return {
    query,
    name: entry?.name || query,
    price: entry?.price ?? null,
    inflated: Boolean(entry?.inflated),
    url: entry?.url || null,
    ts: ts || Date.now(),
  };
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
