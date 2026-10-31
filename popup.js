import { formatNp } from "./jn.js";

const form = document.getElementById("search-form");
const input = document.getElementById("item-name");
const btn = document.getElementById("search-btn");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const clearCacheBtn = document.getElementById("clear-cache");

init();

async function init() {
  clearCacheBtn.addEventListener("click", async () => {
    await send({ type: "JN_CLEAR_CACHE" });
    setStatus("Cache cleared.");
  });

  form.addEventListener("submit", onSearch);

  const fromQuery = new URLSearchParams(location.search).get("q");
  const pending = await send({ type: "JN_TAKE_PENDING" });
  const seed = (fromQuery || pending?.name || "").trim();

  if (seed) {
    input.value = seed;
    await lookup(seed);
  } else {
    input.focus();
  }
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

function renderResult(query, result) {
  const title = result?.name || query;
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
