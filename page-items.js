/**
 * Read item names from the open tab.
 * Passed to chrome.scripting.executeScript, so this function is serialized
 * as-is: it must not close over imports, change the DOM, or make requests.
 * @returns {{ names: string[], total: number }}
 */
export function readPageItems() {
  var host = location.hostname;
  if (host !== "neopets.com" && !host.endsWith(".neopets.com")) {
    return { names: [], total: 0 };
  }

  var MAX_NAMES = 50;
  var names = [];
  var seen = Object.create(null);

  function add(raw) {
    var name = clean(raw);
    if (!isItemName(name)) return;
    var key = name.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    names.push(name);
  }

  function isPriceLabel(name) {
    return /^[\d,]+\s*NP$/i.test(name);
  }

  function isItemName(name) {
    if (name.length < 2 || name.length > 80) return false;
    if (isPriceLabel(name)) return false;
    if (!/[a-z]/i.test(name)) return false;
    if (/^https?:/i.test(name)) return false;
    var skip = {
      "check all": true,
      next: true,
      previous: true,
      prev: true,
      submit: true,
      search: true,
      close: true,
      back: true,
      remove: true,
      stock: true,
      deposit: true,
      withdraw: true,
      cancel: true,
      buy: true,
      sell: true,
      item: true,
      image: true,
      neopets: true,
      loading: true,
      click: true,
      select: true,
      all: true,
    };
    return !skip[name.toLowerCase()];
  }

  function addImageName(img) {
    add(img.getAttribute("data-name"));
    add(img.getAttribute("data-itemname"));
    add(img.getAttribute("alt"));
    add(img.getAttribute("title"));

    var cell = img.closest("td") || img.closest("li");
    if (cell) {
      var named = cell.querySelector("p.item-name, .market-your-item__name, .bsp-item__name");
      if (named) {
        add(nameText(named));
        return;
      }
      var bolds = cell.querySelectorAll("b");
      var added = false;
      for (var i = 0; i < bolds.length; i++) {
        var before = names.length;
        add(bolds[i].textContent);
        if (names.length > before) added = true;
      }
      if (added) return;
      add(textWithoutControls(cell));
      return;
    }

    var row = img.closest("tr");
    if (!row) return;
    var rowNames = row.querySelectorAll("b");
    for (var j = 0; j < rowNames.length; j++) add(rowNames[j].textContent);
  }

  function nameText(el) {
    var bold = el.querySelector("b");
    var boldText = bold ? clean(bold.textContent) : "";
    if (boldText && !isPriceLabel(boldText)) return boldText;
    return el.textContent;
  }

  function textWithoutControls(el) {
    var clone = el.cloneNode(true);
    var noise = clone.querySelectorAll("img, script, style, button, input, select, textarea");
    for (var i = 0; i < noise.length; i++) noise[i].remove();
    return clone.textContent;
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isItemImage(el) {
    var src = [
      el.getAttribute("src"),
      el.getAttribute("data-src"),
      el.getAttribute("data-image"),
    ].join(" ");
    return /\/items\//i.test(src);
  }

  function collect(nodes, read) {
    for (var i = 0; i < nodes.length; i++) add(read(nodes[i]));
  }

  function adopt(nodes, read) {
    var before = names.length;
    collect(nodes, read);
    return names.length > before;
  }

  function finish() {
    return {
      names: names.slice(0, MAX_NAMES),
      total: names.length,
    };
  }

  // Shop stock. Name is the span text, not the price beside it.
  var shopStock = document.querySelectorAll(".market-your-item__name");
  if (adopt(shopStock, function (el) { return nameText(el); })) return finish();

  // Marketplace shops. data-name is the item; visible text is sometimes the price.
  var marketNames = document.querySelectorAll("li.bsp-item[data-name], li.bsp-item [data-name], .bsp-item__name");
  if (adopt(marketNames, function (el) {
    return el.getAttribute("data-name") || nameText(el);
  })) return finish();

  // Non-player shops, including objects.phtml?type=shop.
  var shopImages = document.querySelectorAll(".item-img[data-name]");
  if (adopt(shopImages, function (el) { return el.getAttribute("data-name"); })) return finish();

  var npcShops = document.querySelectorAll("p.item-name");
  if (adopt(npcShops, function (el) { return nameText(el); })) return finish();

  var named = document.querySelectorAll("[data-itemname], [data-item-name]");
  for (var i = 0; i < named.length; i++) {
    add(named[i].getAttribute("data-itemname") || named[i].getAttribute("data-item-name"));
  }

  var images = document.images;
  for (var j = 0; j < images.length; j++) {
    if (isItemImage(images[j])) addImageName(images[j]);
  }

  var links = document.querySelectorAll('a[href*="iteminfo.phtml"]');
  for (var k = 0; k < links.length; k++) {
    var boldName = links[k].querySelector("b");
    add(boldName ? boldName.textContent : links[k].textContent);
  }

  return finish();
}
