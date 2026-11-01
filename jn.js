/** Shared Jellyneo search + HTML parsing helpers (works in MV3 service workers). */

export const JN_ORIGIN = "https://items.jellyneo.net";
export const CACHE_TTL_MS = 30 * 60 * 1000;
export const REQUEST_GAP_MS = 300;
export const MAX_CONCURRENCY = 2;

/**
 * @param {string} name
 * @returns {string}
 */
export function searchUrl(name) {
  const params = new URLSearchParams({
    name,
    name_type: "3", // exact match
  });
  return `${JN_ORIGIN}/search/?${params.toString()}`;
}

/**
 * @param {string} text
 * @returns {number|null}
 */
export function parseNp(text) {
  const match = String(text || "").match(/([\d,]+)\s*NP/i);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ""), 10);
}

/**
 * @param {string} s
 */
function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * @param {string|null|undefined} href
 */
function absUrl(href) {
  if (!href) return null;
  try {
    return new URL(href, JN_ORIGIN).href;
  } catch {
    return null;
  }
}

/**
 * Parse Jellyneo search-results HTML without DOMParser.
 * @param {string} html
 * @param {string} queryName
 */
export function isNeopetsUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "neopets.com" || hostname.endsWith(".neopets.com");
  } catch {
    return false;
  }
}

export function isPriceLabel(text) {
  return /^[\d,]+\s*NP$/i.test(String(text || "").replace(/\s+/g, " ").trim());
}

export function parseSearchHtml(html, queryName) {
  const linkRe = /href="(\/item\/(?![^"]*price-history)[^"]+)"[^>]*>([^<]{1,120})</gi;
  let itemUrl = null;
  let linkedName = null;
  let match;
  while ((match = linkRe.exec(html))) {
    const text = decodeEntities(match[2]).replace(/\s+/g, " ").trim();
    if (!itemUrl) itemUrl = absUrl(match[1]);
    if (text && !isPriceLabel(text)) {
      linkedName = text;
      itemUrl = absUrl(match[1]);
      break;
    }
  }

  let name = linkedName || queryName;
  const exactRe = new RegExp(
    `href="(\\/item\\/(?![^"]*price-history)[^"]+)"[^>]*>\\s*${escapeRegExp(queryName)}\\s*<`,
    "i"
  );
  const exact = html.match(exactRe);
  if (exact) {
    name = queryName;
  }
  if (isPriceLabel(name) && !isPriceLabel(queryName)) name = queryName;

  const imgMatch =
    html.match(/src="(https?:\/\/images\.neopets\.com\/[^"]+)"/i) ||
    html.match(/src="(\/\/images\.neopets\.com\/[^"]+)"/i);
  const image = imgMatch
    ? absUrl(imgMatch[1].startsWith("//") ? `https:${imgMatch[1]}` : imgMatch[1])
    : null;

  const priceBlock = html.match(
    /href="(\/item\/[^"]*price-history[^"]*|\/price-history\/[^"]*)"[^>]*>([\s\S]{0,80}?)<\/a>/i
  );

  if (!priceBlock) {
    const loose = html.match(/>([\d,]+)\s*NP</i);
    return {
      name,
      price: loose ? parseInt(loose[1].replace(/,/g, ""), 10) : null,
      inflated: false,
      url: itemUrl || (exact ? absUrl(exact[1]) : null),
      image,
      historyUrl: null,
    };
  }

  const historyUrl = absUrl(priceBlock[1]);
  const priceText = decodeEntities(priceBlock[2]).replace(/\s+/g, " ").trim();

  if (/inflation/i.test(priceText)) {
    return {
      name,
      price: null,
      inflated: true,
      url: itemUrl || (exact ? absUrl(exact[1]) : null),
      image,
      historyUrl,
    };
  }

  return {
    name,
    price: parseNp(priceText),
    inflated: false,
    url: itemUrl || (exact ? absUrl(exact[1]) : null),
    image,
    historyUrl,
  };
}

/**
 * @param {string} html
 * @returns {number|null}
 */
export function parseHistoryHtml(html) {
  const match = html.match(
    /([\d,]+)\s*NP\s*\(\s*(?:[+\-−][\d,]+\s*NP|no change)\s*\)\s*on/i
  );
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ""), 10);
}

/**
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function formatNp(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("en-US")} NP`;
}

/**
 * @param {string} s
 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
