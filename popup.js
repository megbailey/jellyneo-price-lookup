import { formatNp, isNeopetsUrl, isPriceLabel } from "./jn.js";
import { readPageItems } from "./page-items.js";

const PAGE_LOOKUP_CONCURRENCY = 2;

const form = document.getElementById("search-form");
const input = document.getElementById("item-name");
const btn = document.getElementById("search-btn");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const historyEl = document.getElementById("history");
const historyList = document.getElementById("history-list");
const pageEl = document.getElementById("page-items");
const pageList = document.getElementById("page-list");
const pageCount = document.getElementById("page-count");
const clearCacheBtn = document.getElementById("clear-cache");

init();

async function init() {
  clearCacheBtn.addEventListener("click", async () => {
    const res = await send({ type: "JN_CLEAR_CACHE" });
    renderHistory(res?.history || []);
    resultEl.hidden = true;
    resultEl.innerHTML = "";
    setStatus("Recent lookups cleared.");
  });

  bindLookupList(historyList);
  bindLookupList(pageList);

  form.addEventListener("submit", onSearch);

  const pagePromise = loadPageItems();

  const listed = await send({ type: "JN_LIST_HISTORY" });
  if (listed?.ok) renderHistory(listed.history);

  const fromQuery = new URLSearchParams(location.search).get("q");
  const pending = await send({ type: "JN_TAKE_PENDING" });
  const seed = (fromQuery || pending?.name || "").trim();

  if (seed) {
    input.value = seed;
    await lookup(seed);
  } else {
    input.focus();
  }

  await pagePromise;
}

function bindLookupList(listEl) {
  listEl.addEventListener("click", (event) => {
    const row = event.target.closest("button[data-query]");
    if (!row) return;
    input.value = row.dataset.query;
    lookup(row.dataset.query);
  });
}

async function loadPageItems() {
  let found;
  try {
    found = await readActiveTabItems();
  } catch {
    return;
  }

  const names = found?.names || [];
  if (!names.length) return;

  renderPageItems(names, found.total || names.length);
  setPageProgress(0, names.length);

  const peeked = await Promise.all(names.map(async (name) => {
    try {
      const res = await send({ type: "JN_PEEK", name });
      if (res?.result) {
        updatePageRow(name, res.result);
        return null;
      }
    } catch {
      // Look the name up below.
    }
    return name;
  }));
  const missing = peeked.filter(Boolean);

  const cached = names.length - missing.length;
  if (!missing.length) {
    setPageProgress(names.length, names.length);
    return;
  }

  setPageProgress(cached, names.length);
  let done = cached;
  await mapPool(missing, PAGE_LOOKUP_CONCURRENCY, async (name) => {
    try {
      const res = await send({ type: "JN_LOOKUP", name, remember: false });
      if (!res?.ok) throw new Error(res?.error || "Lookup failed");
      updatePageRow(name, res.result);
    } catch {
      updatePageRow(name, null);
    } finally {
      done += 1;
      setPageProgress(done, names.length);
    }
  });
}

async function readActiveTabItems() {
  if (!chrome.tabs?.query || !chrome.scripting?.executeScript) {
    return { names: [], total: 0 };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isNeopetsUrl(tab.url || "")) return { names: [], total: 0 };

  const frames = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: readPageItems,
  });

  const names = [];
  const seen = new Set();
  for (const frame of frames || []) {
    const found = frame?.result?.names;
    if (!Array.isArray(found)) continue;
    for (const name of found) {
      const key = String(name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return { names: names.slice(0, 50), total: names.length };
}

async function mapPool(items, limit, fn) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await fn(items[current], current);
    }
  });
  await Promise.all(workers);
}

async function onSearch(event) {
  event.preventDefault();
  await lookup(input.value.trim());
}

async function lookup(name) {
  if (!name) return;

  btn.disabled = true;
  resultEl.hidden = true;
  setStatus(`Looking up “${name}”…`);

  try {
    const res = await send({ type: "JN_LOOKUP", name });
    if (!res?.ok) throw new Error(res?.error || "Lookup failed");
    renderResult(name, res.result);
    if (res.history) renderHistory(res.history);
    setStatus("");
  } catch (err) {
    resultEl.hidden = true;
    setStatus(String(err?.message || err), true);
  } finally {
    btn.disabled = false;
    input.focus();
    input.select();
  }
}

function listingName(parsed, original) {
  if (parsed && !isPriceLabel(parsed)) return parsed;
  return original;
}

function renderResult(query, result) {
  const title = listingName(result?.name, query);
  const price = formatNp(result?.price);
  const img = result?.image
    ? `<img src="${escapeAttr(result.image)}" alt="" />`
    : `<div style="width:56px;height:56px;border-radius:10px;background:#e7dfd0"></div>`;

  const inflated = result?.inflated
    ? `<span class="badge">inflated</span>`
    : "";

  const link = result?.url
    ? `<a href="${escapeAttr(result.url)}" target="_blank" rel="noopener">Open on Jellyneo</a>`
    : `<a href="https://items.jellyneo.net/search/?name=${encodeURIComponent(query)}&name_type=3" target="_blank" rel="noopener">Search on Jellyneo</a>`;

  resultEl.innerHTML = `
    ${img}
    <div>
      <h2>${escapeHtml(title)}</h2>
      <div class="price">${escapeHtml(price)}${inflated}</div>
      <div class="meta">${link}</div>
    </div>
  `;
  resultEl.hidden = false;
}

function renderHistory(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    historyEl.hidden = true;
    historyList.innerHTML = "";
    return;
  }

  historyList.innerHTML = list.map((item) => {
    const title = listingName(item?.name, item?.query || "");
    return priceRow(item?.query || title, title, item, false);
  }).join("");
  historyEl.hidden = false;
}

function renderPageItems(names, total) {
  pageCount.textContent = total > names.length ? `${names.length} of ${total}` : String(names.length);
  pageList.innerHTML = names.map((name) => priceRow(name, name, null, true)).join("");
  pageEl.hidden = false;
}

function setPageProgress(done, total) {
  pageCount.textContent = done >= total ? String(total) : `looking up ${done}/${total}`;
}

function updatePageRow(name, result) {
  for (const button of pageList.querySelectorAll("button")) {
    if (button.dataset.query !== name) continue;
    const title = listingName(result?.name, name);
    button.title = title;
    button.querySelector(".history-name").textContent = title;
    const price = button.querySelector(".history-price");
    price.classList.remove("is-pending");
    price.textContent = formatNp(result?.price);
  }
}

function priceRow(query, title, item, pending) {
  const priceClass = pending ? "history-price is-pending" : "history-price";
  const priceText = pending ? "…" : formatNp(item?.price);
  return `<li><button type="button" data-query="${escapeAttr(query)}" title="${escapeAttr(title)}"><span class="row"><span class="history-name">${escapeHtml(title)}</span><span class="${priceClass}">${escapeHtml(priceText)}</span></span></button></li>`;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", !!isError);
}

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
