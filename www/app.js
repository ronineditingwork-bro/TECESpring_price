const SHEETS = window.PRICE.sheets; // вкладки прайса: TECE, TECEspring, Uranum, BWT, Poloplast, Conex Banninger, Viega
const CATALOG = window.CATALOG || {};
const STORES = window.STOCK?.stores || []; // склады: Ростов-на-Дону, Москва
const bySku = new Map(SHEETS.flatMap((s, si) => s.groups.flatMap((g) => g.items.map((i) => [i.sku, { ...i, sheet: si, group: g.name }]))));
const rub = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const $ = (id) => document.getElementById(id);
const DOCS = { quote: "Коммерческое предложение", invoice: "Счёт на оплату" };
const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/></svg>',
};

const stock = (sku) => STORES.reduce((n, s) => n + (s.items[sku] || 0), 0); // нет в выгрузке — нет на складе
const city = (name) => name.split("-")[0]; // «Ростов-на-Дону» → «Ростов» там, где мало места
const img = (sku) => CATALOG[sku]?.images[0] || "";

// localStorage может быть недоступен (приватный режим) — тогда приложение просто ничего не запоминает
const store = {
  get(k, d) { try { const v = localStorage.getItem("tecespring-" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("tecespring-" + k, JSON.stringify(v)); } catch {} },
};

let cart = store.get("cart", {});
for (const sku of Object.keys(cart)) if (!bySku.has(sku)) delete cart[sku]; // позиция ушла из нового прайса
let section = "", activeSheet; // группа внутри вкладки и сама вкладка (null — главный экран); undefined — ещё не нарисовано
const plural = (n, f) => { const t = n % 100, o = n % 10; return f[t > 10 && t < 20 ? 2 : o === 1 ? 0 : o > 1 && o < 5 ? 1 : 2]; };

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("on"), 2600);
}

function save() {
  store.set("cart", cart);
  const n = Object.keys(cart).length;
  for (const id of ["badge", "badge-top"]) { $(id).hidden = !n; $(id).textContent = n; }
}

function add(sku, n = 1) {
  cart[sku] = (cart[sku] || 0) + n;
  save();
  for (const id of ["badge", "badge-top"]) { $(id).classList.remove("bump"); void $(id).offsetWidth; $(id).classList.add("bump"); }
  const i = bySku.get(sku);
  toast(`Добавлено: ${i.name.length > 42 ? i.name.slice(0, 40) + "…" : i.name}. В корзине ${cart[sku]} ${i.unit}`);
}

function stockLine(sku) {
  if (!STORES.length) return "";
  if (!stock(sku)) return '<div class="stock"><span>Нет на складах</span></div>';
  return `<div class="stock">${STORES.map((s) => { const n = s.items[sku] || 0; return `<span class="${n > 0 ? "y" : ""}">${esc(city(s.name))} <b>${num.format(n)}</b></span>`; }).join("")}</div>`;
}

// ---------- каталог: главный экран — вкладки прайса, внутри вкладки — группы ----------
function tile(i) {
  return `
    <article class="tile">
      <a href="#p=${encodeURIComponent(i.sku)}" data-sku="${esc(i.sku)}">
        <div class="ph">${img(i.sku) ? `<img src="${esc(img(i.sku))}" alt="" loading="lazy">` : '<span class="noimg"></span>'}</div>
        <div class="body">
          <span class="name">${esc(i.name)}</span>
          <span class="sku">${esc(i.sku)}</span>
          ${stockLine(i.sku)}
          <span class="price">${rub.format(i.rub)} ₽</span>
        </div>
      </a>
      <button type="button" class="add" data-add="${esc(i.sku)}" aria-label="В корзину: ${esc(i.name)}">${ICON.plus}</button>
    </article>`;
}

function renderTabs() {
  const sheet = SHEETS[activeSheet];
  const tabs = sheet ? [["", "Все группы"], ...sheet.groups.map((g) => [g.name, g.name])] : [];
  $("tabs").innerHTML = tabs.map(([v, l]) => `<button type="button" role="tab" data-tab="${esc(v)}" aria-selected="${v === section}">${esc(l)}</button>`).join("");
}

function renderHome() {
  $("list").innerHTML = `<div class="sheets">${SHEETS.map((s, n) => {
    const items = s.groups.flatMap((g) => g.items);
    const cover = items.map((i) => img(i.sku)).find(Boolean);
    return `<a class="sheet" href="#s=${n}">
      <div class="ph">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : `<span class="word">${esc(s.name)}</span>`}</div>
      <div class="body"><b>${esc(s.name)}</b><span>${items.length} ${plural(items.length, ["позиция", "позиции", "позиций"])}, ${s.groups.length} ${plural(s.groups.length, ["группа", "группы", "групп"])}</span></div>
    </a>`;
  }).join("")}</div>`;
}

const RESULTS = 120; // shortcut: поиск показывает первые 120 совпадений; если станет мало — добавить «Показать ещё»
function renderList() {
  const words = $("q").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const onlyStock = $("in-stock").checked;
  const sheet = SHEETS[activeSheet];
  const searching = words.length > 0;
  $("ptitle").textContent = searching ? "Поиск по каталогу" : sheet ? sheet.name : "Каталог";
  $("tabs").hidden = !sheet || searching;
  $("filterline").hidden = !sheet && !searching;
  $("meta").textContent = sheet && !searching ? `${sheet.title.replace(/^Розничный прайс-лист/, "Прайс")}`.replace(/\s*\(вкл\. НДС (\d+%)\)/, ", цены с НДС $1") : "";
  if (!sheet && !searching) return renderHome();
  const ok = (i) => (!onlyStock || stock(i.sku) > 0) && words.every((w) => (i.name + " " + i.sku).toLowerCase().includes(w));
  let html = "", shown = 0;
  if (searching) {
    for (const s of SHEETS) {
      const items = s.groups.flatMap((g) => g.items).filter(ok).slice(0, RESULTS - shown);
      if (items.length) html += `<h2>${esc(s.name)}</h2><div class="grid">${items.map(tile).join("")}</div>`;
      shown += items.length;
      if (shown >= RESULTS) { html += `<p class="note more">Показаны первые ${RESULTS} совпадений. Уточните запрос, например добавьте размер.</p>`; break; }
    }
  } else {
    for (const g of sheet.groups.filter((g) => !section || g.name === section)) {
      const items = g.items.filter(ok);
      if (!items.length) continue;
      html += `<h2>${esc(g.name)}</h2>`;
      // подгруппы — как в прайсе, заголовком над своими позициями
      let open = false, last = null;
      for (const i of items) {
        if (i.sub !== last) { html += `${open ? "</div>" : ""}${i.sub ? `<h3>${esc(i.sub)}</h3>` : ""}<div class="grid">`; open = true; last = i.sub; }
        html += tile(i);
      }
      html += "</div>";
    }
  }
  $("list").innerHTML = html || `<div class="empty">Ничего не найдено. Проверьте артикул${onlyStock ? " или выключите «Только в наличии»" : ""}.</div>`;
}

// ---------- карточка товара ----------
function renderCard(sku) {
  const i = bySku.get(sku);
  if (!i) return false;
  const c = CATALOG[sku] || { images: [], text: "", docs: [] };
  const slides = c.images.length ? c.images.map((src, n) => `<div class="ph"><img src="${esc(src)}" alt="${n ? "" : esc(i.name)}"></div>`).join("") : '<div class="ph"><span class="noimg"></span></div>';
  $("card").innerHTML = `
    <div class="gallery" id="gal">${slides}</div>
    <div class="dots" id="gdots"></div>
    <div class="panel" style="margin-top:12px">
      <p class="sku-line"><a href="#s=${i.sheet}">${esc(SHEETS[i.sheet].name)}</a>, ${esc(i.group)}. Артикул ${esc(i.sku)}</p>
      <h1 class="title">${esc(i.name)}</h1>
      <p class="bigprice">${rub.format(i.rub)} ₽<small>${i.eur != null ? `${num.format(i.eur)} € ` : ""}за ${esc(i.unit)}, с НДС</small></p>
      ${STORES.length ? `<div class="wh">${STORES.map((s) => { const n = s.items[sku] || 0; return `<div>${esc(s.name)}<b class="${n > 0 ? "" : "no"}">${n > 0 ? `${num.format(n)} ${esc(i.unit)}` : "нет"}</b><small>на ${esc(s.date)}</small></div>`; }).join("")}</div>` : ""}
      <div class="buy">
        <span class="stepper"><button type="button" data-step="-1" aria-label="Меньше">−</button><input id="addQty" type="number" inputmode="numeric" min="1" value="1" aria-label="Количество, ${esc(i.unit)}"><button type="button" data-step="1" aria-label="Больше">+</button></span>
        <button type="button" class="btn" id="addBtn">В корзину</button>
      </div>
      <p class="incart" id="card-qty">${cart[sku] ? `В корзине ${cart[sku]} ${esc(i.unit)}` : ""}</p>
    </div>
    ${c.text ? `<div class="panel"><h3>Описание</h3><div class="desc">${esc(c.text.replace(/\n\s*\n/g, "\n"))}</div></div>` : ""}
    ${c.docs.length || c.url ? `<div class="panel"><h3>Документация</h3><ul class="docs">
      ${c.docs.map((d) => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${ICON.pdf}${esc(d.name)}</a></li>`).join("")}
      ${c.url ? `<li><a href="${esc(c.url)}" target="_blank" rel="noopener">Страница товара на spring.tececatalog.ru</a></li>` : ""}
    </ul></div>` : ""}`;
  const q = $("addQty");
  $("card").querySelectorAll("[data-step]").forEach((b) => b.onclick = () => { q.value = Math.max(1, (parseInt(q.value) || 1) + +b.dataset.step); });
  $("addBtn").onclick = () => {
    add(sku, Math.max(1, parseInt(q.value) || 1));
    $("card-qty").textContent = `В корзине ${cart[sku]} ${i.unit}`;
  };
  $("gal").onscroll = dots;
  dots();
  return true;
}

function dots() {
  const g = $("gal");
  if (!g) return;
  const n = g.children.length, cur = Math.round(g.scrollLeft / (g.clientWidth || 1));
  $("gdots").innerHTML = n > 1 ? Array.from({ length: n }, (_, k) => `<i class="${k === cur ? "on" : ""}"></i>`).join("") : "";
}

// ---------- корзина ----------
const cartLines = () => Object.entries(cart).map(([sku, n]) => ({ ...bySku.get(sku), qty: n }));
// сумма по каждой строке округляется до копеек, как в счёте
const cartTotal = () => cartLines().reduce((t, r) => t + Math.round(r.rub * r.qty * 100) / 100, 0);

function renderCart() {
  const rows = cartLines();
  if (!rows.length) {
    $("cart").innerHTML = `<div class="panel empty">Корзина пуста. Добавьте товары кнопкой «+» на карточке, и из них можно будет сделать КП или счёт.<br><a class="btn" href="#">Открыть каталог</a></div>`;
    return;
  }
  $("cart").innerHTML = `
    <div class="panel">${rows.map((r) => `
      <div class="line">
        <a class="ph" href="#p=${encodeURIComponent(r.sku)}">${img(r.sku) ? `<img src="${esc(img(r.sku))}" alt="">` : '<span class="noimg"></span>'}</a>
        <div>
          <a class="t" href="#p=${encodeURIComponent(r.sku)}">${esc(r.name)}<small>${esc(r.sku)}, ${rub.format(r.rub)} ₽ за ${esc(r.unit)}</small></a>
          <div class="ctl">
            <span class="stepper sm"><button type="button" data-dec="${esc(r.sku)}" aria-label="Меньше">−</button><input type="number" inputmode="numeric" min="1" value="${r.qty}" data-qty="${esc(r.sku)}" aria-label="Количество, ${esc(r.unit)}"><button type="button" data-inc="${esc(r.sku)}" aria-label="Больше">+</button></span>
            <span class="sum">${rub.format(r.rub * r.qty)} ₽</span>
          </div>
          ${r.qty > stock(r.sku) ? `<div class="warn">На складах ${num.format(stock(r.sku))} ${esc(r.unit)}</div>` : ""}
        </div>
      </div>`).join("")}
    </div>
    <div class="panel summary">
      <div class="row"><span>Позиций</span><span>${rows.length}</span></div>
      <div class="tot"><span>Итого с НДС</span><b>${rub.format(cartTotal())} ₽</b></div>
      <button type="button" class="btn full" data-go="doc/quote">Коммерческое предложение</button>
      <button type="button" class="btn ghost full" data-go="doc/invoice">Счёт на оплату</button>
      <button type="button" class="linkbtn" id="clear">Очистить корзину</button>
    </div>`;
  $("clear").onclick = () => { if (confirm("Очистить корзину?")) { cart = {}; save(); renderCart(); } };
}

function setQty(sku, n) {
  if (n >= 1) cart[sku] = n; else delete cart[sku];
  save();
  const y = $("cart").scrollTop, wy = scrollY;
  renderCart();
  $("cart").scrollTop = y; scrollTo(0, wy);
}

// ---------- КП и счёт: форма как в WHITECROSS и MAPEI — продавец, номер, клиент, «Создать PDF» ----------
function renderDoc(kind) {
  if (!DOCS[kind] || !Object.keys(cart).length) return false;
  const si = Math.min(store.get("seller", 0), SELLERS.length - 1);
  const noKey = (i) => `no:${kind}:${SELLERS[i].inn}`;
  const opts = store.get("docOpts", { photos: true, arts: true });
  const b = store.get("buyer", {});
  const n = Object.keys(cart).length;
  const field = (id, label, type = "text", mode = "") => `<label class="f" for="b_${id}">${label}</label><input id="b_${id}" type="${type}" ${mode ? `inputmode="${mode}"` : ""} value="${esc(b[id] || "")}">`;
  const sw = (id, t, sub) => `<label class="switch toggle"><span>${t}<small>${sub}</small></span><input type="checkbox" id="o_${id}" ${opts[id] ? "checked" : ""}></label>`;
  $("doc").innerHTML = `
    <div class="panel">
      <h1 class="title">${DOCS[kind]}</h1>
      <p class="muted">${n} ${n === 1 ? "позиция" : n < 5 ? "позиции" : "позиций"} на ${rub.format(cartTotal())} ₽</p>
    </div>
    <div class="panel form">
      <label class="f" for="seller">Продавец</label>
      <select id="seller">${SELLERS.map((s, i) => `<option value="${i}" ${i === si ? "selected" : ""}>${s.kpp ? "" : "ИП "}${esc(s.short)}, ${s.vatRate ? "НДС " + s.vatRate + "%" : "без НДС"}</option>`).join("")}</select>
      <div class="two">
        <div><label class="f" for="docNo">Номер</label><input id="docNo" type="number" inputmode="numeric" min="1" value="${store.get(noKey(si), 1)}"></div>
        <div><label class="f" for="docDate">Дата</label><input id="docDate" type="date" value="${new Date().toLocaleDateString("sv")}"></div>
      </div>
      ${kind === "quote" ? `<label class="f" for="valid">Срок действия, дней</label><input id="valid" type="number" inputmode="numeric" min="1" value="${store.get("validDays", 14)}">` : ""}
      <label class="f" for="discount">Скидка клиенту, %</label><input id="discount" type="number" inputmode="decimal" min="0" max="99" step="0.5" placeholder="0" value="${store.get("discount", "") || ""}">
    </div>
    <div class="panel form">
      ${sw("photos", "Фото товаров", "Картинка у каждой позиции")}
      ${sw("arts", "Артикулы", "Выключите, чтобы клиент не видел артикулы")}
    </div>
    <div class="panel form">
      <h3>${kind === "quote" ? "Клиент" : "Покупатель"}</h3>
      ${field("name", "Имя или компания")}
      <div class="two"><div>${field("inn", "ИНН", "text", "numeric")}</div><div>${field("kpp", "КПП", "text", "numeric")}</div></div>
      ${field("address", "Адрес")}
      ${field("phone", "Телефон", "tel")}
      <label class="f" for="b_comment">Комментарий в начале документа</label><textarea id="b_comment" rows="3">${esc(store.get("docComment", ""))}</textarea>
    </div>
    <div class="doc-cta"><button type="button" class="btn full" id="pdfBtn">Создать PDF</button></div>`;
  const view = $("doc");
  view.querySelectorAll('[id^="b_"]').forEach((el) => el.oninput = () => {
    if (el.id === "b_comment") return store.set("docComment", el.value);
    const cur = store.get("buyer", {}); cur[el.id.slice(2)] = el.value.trim(); store.set("buyer", cur);
  });
  view.querySelectorAll('[id^="o_"]').forEach((el) => el.onchange = () => { const o = store.get("docOpts", { photos: true, arts: true }); o[el.id.slice(2)] = el.checked; store.set("docOpts", o); });
  if ($("valid")) $("valid").oninput = () => store.set("validDays", parseInt($("valid").value) || 14);
  $("discount").oninput = () => store.set("discount", Math.min(Math.max(parseFloat($("discount").value) || 0, 0), 99));
  $("seller").onchange = () => { store.set("seller", +$("seller").value); $("docNo").value = store.get(noKey(+$("seller").value), 1); };
  $("pdfBtn").onclick = () => {
    const i = +$("seller").value, no = parseInt($("docNo").value) || 1, seller = SELLERS[i];
    // фото лежат внутри приложения, поэтому PDF собирается с картинками и без интернета
    const lines = cartLines().map((l) => ({ name: l.name, art: l.sku, qty: l.qty, unit: l.unit, price: l.rub, img: img(l.sku) }));
    const args = { kind, seller, buyer: store.get("buyer", {}), comment: $("b_comment").value.trim(), lines, no,
      date: $("docDate").value, validDays: $("valid") ? $("valid").value : 0, discount: store.get("discount", 0), opts: store.get("docOpts", { photos: true, arts: true }) };
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

// ---------- экраны и переходы ----------
// Z Fold 7 разложен (и планшеты): каталог слева, карточка, корзина или документ справа; сложен — один экран
const wide = matchMedia("(min-width: 700px)");
const calm = matchMedia("(prefers-reduced-motion: reduce)");
const PANES = ["catalog", "card", "cart", "doc"];
// куда ведёт «Назад», если приложение открыли сразу на этом экране
const parentOf = (v) => v.view === "card" ? `s=${bySku.get(v.sku).sheet}` : v.view === "doc" ? "cart" : "";
const trail = []; // экраны, пройденные в этом запуске, — чтобы «Назад» знал, есть ли куда возвращаться
let current = { view: "catalog", sheet: null }, scrolls = {}; // прокрутка каждого экрана каталога

function parse(hash) {
  const h = decodeURIComponent(hash.replace(/^#/, ""));
  if (h === "cart") return { view: "cart" };
  if (h.startsWith("p=") && bySku.has(h.slice(2))) return { view: "card", sku: h.slice(2) };
  if (h.startsWith("doc/")) return { view: "doc", kind: h.slice(4) };
  if (h.startsWith("s=") && SHEETS[+h.slice(2)]) return { view: "catalog", sheet: +h.slice(2) };
  return { view: "catalog", sheet: null };
}

// экраны переключаются через адрес (#, #cart, #p=артикул, #doc/quote), поэтому работают и кнопка «Назад», и жест на Android и iPhone
function route() {
  let next = parse(location.hash);
  if (next.view === "card") renderCard(next.sku);
  if (next.view === "doc" && !renderDoc(next.kind)) next = { view: "cart" };
  if (next.view === "cart" || wide.matches) renderCart();
  const key = (v) => "s" + v.sheet;
  if (current.view === "catalog") scrolls[key(current)] = scrollY;
  if (next.view === "catalog" && next.sheet !== activeSheet) {
    activeSheet = next.sheet; section = "";
    renderTabs(); renderList();
  }
  if (wide.matches) {
    const right = next.view === "catalog" ? "cart" : next.view;
    for (const id of PANES) $(id).hidden = id !== "catalog" && id !== right;
    $(right).scrollTop = 0;
  } else {
    for (const id of PANES) $(id).hidden = id !== next.view;
    scrollTo(0, next.view === "catalog" ? scrolls[key(next)] || 0 : 0);
  }
  const home = next.view === "catalog" && next.sheet === null;
  $("back").hidden = home || (wide.matches && next.view === "cart");
  document.body.dataset.view = next.view;
  const inCart = next.view === "cart" || next.view === "doc";
  $("nav-catalog").classList.toggle("on", !inCart);
  $("nav-cart").classList.toggle("on", inCart);
  current = next;
}

// фото товара плавно «перетекает» из плитки каталога в карточку и обратно
function navigate() {
  const h = location.hash;
  if (trail.length > 1 && trail[trail.length - 2] === h) trail.pop(); else if (trail[trail.length - 1] !== h) trail.push(h);
  if (!document.startViewTransition || calm.matches) return route();
  const next = parse(h), prev = current;
  const tileImg = (sku) => document.querySelector(`#list a[data-sku="${CSS.escape(sku)}"] img`);
  const heroOf = () => document.querySelector("#gal img");
  let from = null;
  if (next.view === "card" && prev.view !== "card") from = tileImg(next.sku);
  if (prev.view === "card" && next.view === "catalog") from = heroOf();
  if (from) from.style.viewTransitionName = "hero";
  const t = document.startViewTransition(() => {
    if (from) from.style.viewTransitionName = "";
    route();
    const to = next.view === "card" ? heroOf() : prev.view === "card" ? tileImg(prev.sku) : null;
    if (from && to) to.style.viewTransitionName = "hero";
  });
  t.finished.finally(() => document.querySelectorAll("[style*=view-transition-name]").forEach((el) => el.style.viewTransitionName = ""));
}

function back() {
  if (trail.length > 1) history.back();
  else location.replace("#" + parentOf(current));
}

// ---------- события ----------
$("q").addEventListener("input", renderList);
$("in-stock").addEventListener("change", renderList);
$("back").addEventListener("click", back);
$("tabs").addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab]");
  if (!t) return;
  const swap = () => { section = t.dataset.tab; renderTabs(); renderList(); };
  document.startViewTransition && !calm.matches ? document.startViewTransition(swap) : swap();
  $("tabs").querySelector(`[aria-selected="true"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
});
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-add], [data-go], [data-inc], [data-dec]");
  if (!t) return;
  if (t.dataset.add) add(t.dataset.add);
  if (t.dataset.go) location.hash = t.dataset.go;
  if (t.dataset.inc) setQty(t.dataset.inc, cart[t.dataset.inc] + 1);
  if (t.dataset.dec) setQty(t.dataset.dec, cart[t.dataset.dec] - 1);
});
$("cart").addEventListener("change", (e) => {
  const sku = e.target.dataset.qty;
  if (sku) setQty(sku, Math.floor(Number(e.target.value)));
});
addEventListener("hashchange", navigate);
wide.addEventListener("change", route); // сложили или разложили телефон

save();
trail.push(location.hash);
route();
