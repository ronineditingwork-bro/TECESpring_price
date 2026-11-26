const { title, rate, sections } = window.PRICE;
const bySku = new Map(sections.flatMap((s) => s.items.map((i) => [i.sku, i])));
const rub = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = (id) => document.getElementById(id);

let cart = {};
try { cart = JSON.parse(localStorage.getItem("tecespring-cart")) || {}; } catch {}
for (const sku of Object.keys(cart)) if (!bySku.has(sku)) delete cart[sku]; // позиция ушла из нового прайса

function save() {
  try { localStorage.setItem("tecespring-cart", JSON.stringify(cart)); } catch {}
  renderCart();
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderList() {
  const q = $("q").value.trim().toLowerCase();
  const sec = $("section").value;
  $("list").innerHTML = sections
    .filter((s) => !sec || s.name === sec)
    .map((s) => {
      const items = s.items.filter((i) => !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
      if (!items.length) return "";
      return `<h2>${esc(s.name)}</h2><table class="price"><tbody>${items
        .map((i) => `<tr><td class="sku">${esc(i.sku)}</td><td>${esc(i.name)}</td>
          <td class="num">${rub.format(i.rub)} ₽<small>${i.eur} € / ${esc(i.unit)}</small></td>
          <td><button type="button" data-add="${esc(i.sku)}" aria-label="Добавить ${esc(i.name)}">+</button></td></tr>`)
        .join("")}</tbody></table>`;
    })
    .join("") || "<p>Ничего не найдено.</p>";
}

function renderCart() {
  const rows = Object.entries(cart).map(([sku, qty]) => ({ ...bySku.get(sku), qty }));
  // сумма по каждой строке округляется до копеек, как в счёте
  const total = rows.reduce((t, r) => t + Math.round(r.rub * r.qty * 100) / 100, 0);
  $("cart-rows").innerHTML = rows
    .map((r) => `<tr><td class="sku">${esc(r.sku)}</td><td>${esc(r.name)}</td>
      <td><input type="number" min="1" step="1" value="${r.qty}" data-qty="${esc(r.sku)}" aria-label="Количество, ${esc(r.unit)}"> ${esc(r.unit)}</td>
      <td class="num">${rub.format(r.rub)}</td><td class="num">${rub.format(r.rub * r.qty)}</td>
      <td class="no-print"><button type="button" class="secondary" data-del="${esc(r.sku)}" aria-label="Удалить">×</button></td></tr>`)
    .join("");
  $("total").textContent = rub.format(total);
  $("empty").hidden = rows.length > 0;
}

$("meta").textContent = `${title} · 1 EUR = ${rate} ₽`;
$("quote-date").textContent = `${title}. Дата: ${new Date().toLocaleDateString("ru-RU")}`;
for (const s of sections) $("section").add(new Option(s.name, s.name));
$("q").addEventListener("input", renderList);
$("section").addEventListener("change", renderList);
$("list").addEventListener("click", (e) => {
  const sku = e.target.dataset.add;
  if (sku) { cart[sku] = (cart[sku] || 0) + 1; save(); }
});
$("cart-rows").addEventListener("change", (e) => {
  const sku = e.target.dataset.qty;
  if (!sku) return;
  const qty = Math.floor(Number(e.target.value));
  if (qty >= 1) cart[sku] = qty; else delete cart[sku];
  save();
});
$("cart-rows").addEventListener("click", (e) => {
  if (e.target.dataset.del) { delete cart[e.target.dataset.del]; save(); }
});
$("print").addEventListener("click", () => window.print());
$("clear").addEventListener("click", () => { cart = {}; save(); });

renderList();
renderCart();
