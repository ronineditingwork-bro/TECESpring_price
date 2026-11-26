const { title, rate, sections } = window.PRICE;
const CATALOG = window.CATALOG || {};
const STOCK = window.STOCK || { date: "", items: {} };
const stock = (sku) => STOCK.items[sku] || 0; // нет в выгрузке — нет в наличии
const stockLabel = (i) => stock(i.sku) > 0 ? `в наличии: ${stock(i.sku)} ${i.unit}` : "нет в наличии";
const bySku = new Map(sections.flatMap((s) => s.items.map((i) => [i.sku, i])));
const rub = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = (id) => document.getElementById(id);

let cart = {};
try { cart = JSON.parse(localStorage.getItem("tecespring-cart")) || {}; } catch {}
for (const sku of Object.keys(cart)) if (!bySku.has(sku)) delete cart[sku]; // позиция ушла из нового прайса

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function save() {
  try { localStorage.setItem("tecespring-cart", JSON.stringify(cart)); } catch {}
  renderCart();
}

function thumb(sku) {
  const img = CATALOG[sku]?.images[0];
  return img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="noimg"></span>`;
}

function renderList() {
  const q = $("q").value.trim().toLowerCase();
  const sec = $("section").value;
  const onlyStock = $("in-stock").checked;
  $("list").innerHTML = sections
    .filter((s) => !sec || s.name === sec)
    .map((s) => {
      const items = s.items.filter((i) => (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)) && (!onlyStock || stock(i.sku) > 0));
      if (!items.length) return "";
      return `<h2>${esc(s.name)}</h2><ul class="items">${items
        .map((i) => `<li><a class="item" href="#p=${encodeURIComponent(i.sku)}">${thumb(i.sku)}
          <span class="name">${esc(i.name)}<small>${esc(i.sku)} · <span class="${stock(i.sku) > 0 ? "ok" : "out"}">${esc(stockLabel(i))}</span></small></span>
          <span class="num">${rub.format(i.rub)} ₽<small>${i.eur} € / ${esc(i.unit)}</small></span></a>
          <button type="button" data-add="${esc(i.sku)}" aria-label="В корзину: ${esc(i.name)}">+</button></li>`)
        .join("")}</ul>`;
    })
    .join("") || "<p>Ничего не найдено.</p>";
}

function renderCard(sku) {
  const i = bySku.get(sku);
  if (!i) return false;
  const c = CATALOG[sku] || { images: [], text: "", docs: [] };
  $("card").innerHTML = `
    <a href="#" class="back" data-back>← Назад</a>
    <div class="gallery">${c.images.map((src) => `<img src="${esc(src)}" alt="${esc(i.name)}">`).join("") || '<span class="noimg big"></span>'}</div>
    <p class="sku">Артикул ${esc(i.sku)}</p>
    <h2>${esc(i.name)}</h2>
    <p class="price">${rub.format(i.rub)} ₽ <small>${i.eur} € за ${esc(i.unit)}</small></p>
    <p class="${stock(i.sku) > 0 ? "ok" : "out"}">${esc(stockLabel(i))}${STOCK.date ? ` (остатки на ${esc(STOCK.date)})` : ""}</p>
    <button type="button" data-add="${esc(i.sku)}">В корзину</button>
    <span class="in-cart" id="card-qty" data-sku="${esc(i.sku)}"></span>
    ${c.text ? `<div class="text">${esc(c.text)}</div>` : ""}
    ${c.docs.length ? `<h3>Документы</h3><ul class="docs">${c.docs.map((d) => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a></li>`).join("")}</ul>` : ""}
    ${c.url ? `<p><a href="${esc(c.url)}" target="_blank" rel="noopener">Страница на spring.tececatalog.ru</a></p>` : ""}`;
  return true;
}

function renderCart() {
  const rows = Object.entries(cart).map(([sku, qty]) => ({ ...bySku.get(sku), qty }));
  // сумма по каждой строке округляется до копеек, как в счёте
  const total = rows.reduce((t, r) => t + Math.round(r.rub * r.qty * 100) / 100, 0);
  $("cart-rows").innerHTML = rows
    .map((r) => `<tr><td class="sku">${esc(r.sku)}</td><td>${esc(r.name)}</td>
      <td><input type="number" min="1" step="1" inputmode="numeric" value="${r.qty}" data-qty="${esc(r.sku)}" aria-label="Количество, ${esc(r.unit)}"> ${esc(r.unit)}${r.qty > stock(r.sku) ? `<small class="out no-print">в наличии: ${stock(r.sku)}</small>` : ""}</td>
      <td class="num">${rub.format(r.rub)}</td><td class="num">${rub.format(r.rub * r.qty)}</td>
      <td class="no-print"><button type="button" class="secondary" data-del="${esc(r.sku)}" aria-label="Удалить">×</button></td></tr>`)
    .join("");
  $("total").textContent = rub.format(total);
  $("empty").hidden = rows.length > 0;
  $("cart-sum").textContent = rows.length ? `· ${rub.format(total)} ₽` : "";
  const q = $("card-qty");
  if (q) q.textContent = cart[q.dataset.sku] ? `в корзине: ${cart[q.dataset.sku]}` : "";
}

// экраны переключаются через адрес (#, #cart, #p=артикул), чтобы работали «Назад» на Android и свайп на iPhone
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const sku = h.startsWith("p=") ? h.slice(2) : null;
  const view = h === "cart" ? "cart" : sku && renderCard(sku) ? "card" : "catalog";
  for (const id of ["catalog", "card", "cart"]) $(id).hidden = id !== view;
  $("nav-catalog").classList.toggle("active", view !== "cart");
  $("nav-cart").classList.toggle("active", view === "cart");
  if (view !== "catalog") scrollTo(0, 0);
  renderCart();
}

function quoteHtml() {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head>
    <body><main>${$("cart").outerHTML}</main></body></html>`;
}

$("meta").textContent = `${title} · 1 EUR = ${rate} ₽${STOCK.date ? ` · остатки на ${STOCK.date}` : ""}`;
$("quote-date").textContent = `${title}. Дата: ${new Date().toLocaleDateString("ru-RU")}`;
for (const s of sections) $("section").add(new Option(s.name, s.name));
$("q").addEventListener("input", renderList);
$("section").addEventListener("change", renderList);
$("in-stock").addEventListener("change", renderList);
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-add], [data-del], [data-back]");
  if (!t) return;
  if (t.dataset.add) { cart[t.dataset.add] = (cart[t.dataset.add] || 0) + 1; save(); }
  if (t.dataset.del) { delete cart[t.dataset.del]; save(); }
  if (t.hasAttribute("data-back")) { e.preventDefault(); history.length > 1 ? history.back() : (location.hash = ""); }
});
$("cart-rows").addEventListener("change", (e) => {
  const sku = e.target.dataset.qty;
  if (!sku) return;
  const qty = Math.floor(Number(e.target.value));
  if (qty >= 1) cart[sku] = qty; else delete cart[sku];
  save();
});
$("print").addEventListener("click", () => {
  if (window.Android) window.Android.print(quoteHtml(), "КП TECEspring");
  else window.print();
});
$("clear").addEventListener("click", () => { cart = {}; save(); });
addEventListener("hashchange", route);

renderList();
route();
