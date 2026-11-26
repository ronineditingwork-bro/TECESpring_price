const { title, rate, sections } = window.PRICE;
const CATALOG = window.CATALOG || {};
const STORES = window.STOCK?.stores || []; // склады: Краснодар, Москва
const qty = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const stock = (sku) => STORES.reduce((n, s) => n + (s.items[sku] || 0), 0); // нет в выгрузке — нет на складе
const stockLabel = (i) => stock(i.sku) > 0
  ? STORES.map((s) => `${s.name}: ${qty.format(s.items[i.sku] || 0)}`).join(" · ") + ` ${i.unit}`
  : "нет в наличии";
const stockDates = STORES.map((s) => `${s.name} на ${s.date}`).join(", ");
const bySku = new Map(sections.flatMap((s) => s.items.map((i) => [i.sku, i])));
const rub = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = (id) => document.getElementById(id);
const DOCS = { quote: "Коммерческое предложение", invoice: "Счёт на оплату" };

// localStorage может быть недоступен (приватный режим) — тогда приложение просто ничего не запоминает
const store = {
  get(k, d) { try { const v = localStorage.getItem("tecespring-" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("tecespring-" + k, JSON.stringify(v)); } catch {} },
};

let cart = store.get("cart", {});
for (const sku of Object.keys(cart)) if (!bySku.has(sku)) delete cart[sku]; // позиция ушла из нового прайса

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("on"), 3500);
}

function save() {
  store.set("cart", cart);
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
    <p class="${stock(i.sku) > 0 ? "ok" : "out"}">${esc(stockLabel(i))}</p>
    ${STORES.length ? `<p class="muted">Остатки: ${esc(stockDates)}</p>` : ""}
    <button type="button" data-add="${esc(i.sku)}">В корзину</button>
    <span class="in-cart" id="card-qty" data-sku="${esc(i.sku)}"></span>
    ${c.text ? `<div class="text">${esc(c.text)}</div>` : ""}
    ${c.docs.length ? `<h3>Документы</h3><ul class="docs">${c.docs.map((d) => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a></li>`).join("")}</ul>` : ""}
    ${c.url ? `<p><a href="${esc(c.url)}" target="_blank" rel="noopener">Страница на spring.tececatalog.ru</a></p>` : ""}`;
  return true;
}

const cartLines = () => Object.entries(cart).map(([sku, n]) => ({ ...bySku.get(sku), qty: n }));
// сумма по каждой строке округляется до копеек, как в счёте
const cartTotal = () => cartLines().reduce((t, r) => t + Math.round(r.rub * r.qty * 100) / 100, 0);

function renderCart() {
  const rows = cartLines(), total = cartTotal();
  $("cart-rows").innerHTML = rows
    .map((r) => `<tr><td class="sku">${esc(r.sku)}</td><td>${esc(r.name)}</td>
      <td><input type="number" min="1" step="1" inputmode="numeric" value="${r.qty}" data-qty="${esc(r.sku)}" aria-label="Количество, ${esc(r.unit)}"> ${esc(r.unit)}${r.qty > stock(r.sku) ? `<small class="out">на складах: ${qty.format(stock(r.sku))}</small>` : ""}</td>
      <td class="num">${rub.format(r.rub)}</td><td class="num">${rub.format(r.rub * r.qty)}</td>
      <td><button type="button" class="secondary" data-del="${esc(r.sku)}" aria-label="Удалить">×</button></td></tr>`)
    .join("");
  $("total").textContent = rub.format(total);
  $("empty").hidden = rows.length > 0;
  $("cart-table").hidden = $("cart-actions").hidden = !rows.length;
  $("cart-sum").textContent = rows.length ? `· ${rub.format(total)} ₽` : "";
  const q = $("card-qty");
  if (q) q.textContent = cart[q.dataset.sku] ? `в корзине: ${cart[q.dataset.sku]}` : "";
}

// «Коммерческое предложение» или «Счёт на оплату» — та же форма, что в WHITECROSS и MAPEI: продавец, номер, клиент, «Создать PDF»
function renderDoc(kind) {
  if (!DOCS[kind] || !Object.keys(cart).length) return false;
  const si = Math.min(store.get("seller", 0), SELLERS.length - 1);
  const noKey = (i) => `no:${kind}:${SELLERS[i].inn}`;
  const opts = store.get("docOpts", { photos: true, arts: true });
  const b = store.get("buyer", {});
  const n = Object.keys(cart).length;
  const field = (id, label, type = "text", mode = "") => `<label for="b_${id}">${label}</label><input id="b_${id}" type="${type}" ${mode ? `inputmode="${mode}"` : ""} value="${esc(b[id] || "")}">`;
  const sw = (id, t, sub) => `<label class="switch"><span>${t}<small>${sub}</small></span><input type="checkbox" id="o_${id}" ${opts[id] ? "checked" : ""}></label>`;
  $("doc").innerHTML = `
    <a href="#cart" class="back">← Корзина</a>
    <h2>${DOCS[kind]}</h2>
    <p class="muted">${n} ${n === 1 ? "позиция" : n < 5 ? "позиции" : "позиций"} на ${rub.format(cartTotal())} ₽</p>
    <div class="form">
      <label for="seller">Продавец</label>
      <select id="seller">${SELLERS.map((s, i) => `<option value="${i}" ${i === si ? "selected" : ""}>${s.kpp ? "" : "ИП "}${esc(s.short)}, ${s.vatRate ? "НДС " + s.vatRate + "%" : "без НДС"}</option>`).join("")}</select>
      <div class="two">
        <div><label for="docNo">Номер</label><input id="docNo" type="number" inputmode="numeric" min="1" value="${store.get(noKey(si), 1)}"></div>
        <div><label for="docDate">Дата</label><input id="docDate" type="date" value="${new Date().toLocaleDateString("sv")}"></div>
      </div>
      ${kind === "quote" ? `<label for="valid">Срок действия, дней</label><input id="valid" type="number" inputmode="numeric" min="1" value="${store.get("validDays", 14)}">` : ""}
      ${sw("photos", "Фото товаров", "Картинка у каждой позиции")}
      ${sw("arts", "Артикулы", "Выключите, чтобы клиент не видел артикулы")}
      <h3>${kind === "quote" ? "Клиент" : "Покупатель"}</h3>
      ${field("name", "Имя или компания")}
      <div class="two"><div>${field("inn", "ИНН", "text", "numeric")}</div><div>${field("kpp", "КПП", "text", "numeric")}</div></div>
      ${field("address", "Адрес")}
      ${field("phone", "Телефон", "tel")}
      <label for="b_comment">Комментарий в начале документа</label><textarea id="b_comment" rows="3">${esc(store.get("docComment", ""))}</textarea>
      <button type="button" class="full" id="pdfBtn">Создать PDF</button>
    </div>`;
  const view = $("doc");
  view.querySelectorAll('[id^="b_"]').forEach((el) => el.oninput = () => {
    if (el.id === "b_comment") return store.set("docComment", el.value);
    const cur = store.get("buyer", {}); cur[el.id.slice(2)] = el.value.trim(); store.set("buyer", cur);
  });
  view.querySelectorAll('[id^="o_"]').forEach((el) => el.onchange = () => { const o = store.get("docOpts", { photos: true, arts: true }); o[el.id.slice(2)] = el.checked; store.set("docOpts", o); });
  if ($("valid")) $("valid").oninput = () => store.set("validDays", parseInt($("valid").value) || 14);
  $("seller").onchange = () => { store.set("seller", +$("seller").value); $("docNo").value = store.get(noKey(+$("seller").value), 1); };
  $("pdfBtn").onclick = () => {
    const i = +$("seller").value, no = parseInt($("docNo").value) || 1, seller = SELLERS[i];
    // фото лежат внутри приложения, поэтому PDF собирается с картинками и без интернета
    const lines = cartLines().map((l) => ({ name: l.name, art: l.sku, qty: l.qty, unit: l.unit, price: l.rub, img: CATALOG[l.sku]?.images[0] || "" }));
    const args = { kind, seller, buyer: store.get("buyer", {}), comment: $("b_comment").value.trim(), lines, no,
      date: $("docDate").value, validDays: $("valid") ? $("valid").value : 0, opts: store.get("docOpts", { photos: true, arts: true }) };
    const name = `${kind === "quote" ? "КП" : "Счёт"} ${no} от ${args.date} ${seller.short}`.replace(/[«»"]/g, "").replace(/[.\s]+$/, "");
    if (window.Android) { $("pdfBtn").disabled = true; $("pdfBtn").textContent = "Создаём PDF…"; window.Android.pdf(buildDoc(args), name); }
    else {
      try { localStorage.setItem("docHtml", buildDoc({ ...args, opts: { ...args.opts, toolbar: true } })); } catch (e) { return toast("Документ не открылся: " + e.message); }
      location.href = "doc.html";
    }
    store.set(noKey(i), no + 1);
    $("docNo").value = no + 1;
  };
  return true;
}

// MainActivity вызывает это, когда PDF сохранён в «Загрузки/TECEspring» и открыто окно «Отправить»
window.onPdf = (err, file) => {
  if ($("pdfBtn")) { $("pdfBtn").disabled = false; $("pdfBtn").textContent = "Создать PDF"; }
  toast(err ? "PDF не создан: " + err : `PDF сохранён в «Загрузки/TECEspring»: ${file}`);
};

// Z Fold 7 разложен (и планшеты): каталог слева, карточка, корзина или документ справа; сложен — один экран
const wide = matchMedia("(min-width: 700px)");
const PANES = ["catalog", "card", "cart", "doc"];

// экраны переключаются через адрес (#, #cart, #p=артикул, #doc/quote), чтобы работали «Назад» на Android и свайп на iPhone
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  let view = "catalog";
  if (h === "cart") view = "cart";
  else if (h.startsWith("p=") && renderCard(h.slice(2))) view = "card";
  else if (h.startsWith("doc/")) view = renderDoc(h.slice(4)) ? "doc" : "cart";
  if (wide.matches) {
    const right = view === "catalog" ? "cart" : view;
    for (const id of PANES) $(id).hidden = id !== "catalog" && id !== right;
    $(right).scrollTop = 0;
  } else {
    for (const id of PANES) $(id).hidden = id !== view;
    if (view !== "catalog") scrollTo(0, 0);
  }
  const inCart = view === "cart" || view === "doc";
  $("nav-catalog").classList.toggle("active", !inCart);
  $("nav-cart").classList.toggle("active", inCart);
  renderCart();
}

$("meta").textContent = `${title} · 1 EUR = ${rate} ₽${STORES.length ? ` · остатки: ${stockDates}` : ""}`;
for (const s of sections) $("section").add(new Option(s.name, s.name));
$("q").addEventListener("input", renderList);
$("section").addEventListener("change", renderList);
$("in-stock").addEventListener("change", renderList);
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-add], [data-del], [data-back], [data-go]");
  if (!t) return;
  if (t.dataset.add) { cart[t.dataset.add] = (cart[t.dataset.add] || 0) + 1; save(); }
  if (t.dataset.del) { delete cart[t.dataset.del]; save(); }
  if (t.dataset.go) location.hash = t.dataset.go;
  if (t.hasAttribute("data-back")) { e.preventDefault(); history.length > 1 ? history.back() : (location.hash = ""); }
});
$("cart-rows").addEventListener("change", (e) => {
  const sku = e.target.dataset.qty;
  if (!sku) return;
  const n = Math.floor(Number(e.target.value));
  if (n >= 1) cart[sku] = n; else delete cart[sku];
  save();
});
$("clear").addEventListener("click", () => { if (confirm("Очистить корзину?")) { cart = {}; save(); } });
addEventListener("hashchange", route);
wide.addEventListener("change", route); // сложили или разложили телефон

renderList();
route();
