const DATA_URL = "assets/data/credit-budget-detailed-current.json?v=20260903-requisitions-credit-r1";

const state = { data: null, groups: [], lines: [], filteredGroups: [], filteredLines: [] };
const ids = ["creditFilterUg", "creditFilterAction", "creditFilterPi", "creditFilterNature", "creditFilterPtres", "creditFilterSource", "creditFilterSearch"];
const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

function formatMoney(value) {
  return "US$ " + Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
function normalize(value) { return String(value ?? "").toLocaleUpperCase("pt-BR"); }
function unique(values) { return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true })); }
function addOptions(select, items, labelFn = (item) => item) {
  items.forEach((item) => { const option = document.createElement("option"); option.value = item; option.textContent = labelFn(item); select.appendChild(option); });
}
function hydrateFilters() {
  addOptions(els.creditFilterUg, unique(state.lines.map((r) => r.ugCode)), (ug) => { const row = state.lines.find((r) => r.ugCode === ug); return `${ug} — ${row?.om || ""} — ${row?.ugName || ""}`; });
  addOptions(els.creditFilterAction, unique(state.lines.map((r) => r.action)), (action) => { const row = state.lines.find((r) => r.action === action); return `${action} — ${row?.actionDescription || ""}`; });
  addOptions(els.creditFilterPi, unique(state.lines.map((r) => r.pi)));
  addOptions(els.creditFilterNature, unique(state.lines.map((r) => r.expenseNature)));
  addOptions(els.creditFilterPtres, unique(state.lines.map((r) => r.ptres)));
  addOptions(els.creditFilterSource, unique(state.lines.map((r) => r.fundingSource)));
}
function selectedFilters() {
  return {
    ug: els.creditFilterUg.value,
    action: els.creditFilterAction.value,
    pi: els.creditFilterPi.value,
    nature: els.creditFilterNature.value,
    ptres: els.creditFilterPtres.value,
    source: els.creditFilterSource.value,
    search: normalize(els.creditFilterSearch.value),
  };
}
function matchesLine(row, f) {
  if (f.ug && row.ugCode !== f.ug) return false;
  if (f.action && row.action !== f.action) return false;
  if (f.pi && row.pi !== f.pi) return false;
  if (f.nature && row.expenseNature !== f.nature) return false;
  if (f.ptres && row.ptres !== f.ptres) return false;
  if (f.source && row.fundingSource !== f.source) return false;
  if (f.search) {
    const haystack = normalize([row.ugCode, row.om, row.ugName, row.action, row.actionDescription, row.ptres, row.pi, row.expenseNature, row.fundingSource].join(" "));
    if (!haystack.includes(f.search)) return false;
  }
  return true;
}
function regroup(lines) {
  const map = new Map();
  lines.forEach((row) => {
    if (!map.has(row.matchKey)) map.set(row.matchKey, { ...row, creditAvailable: 0, launches: 0, ptres: new Set(), fundingSources: new Set() });
    const group = map.get(row.matchKey);
    group.creditAvailable += Number(row.creditAvailable || 0);
    group.launches += 1;
    group.ptres.add(row.ptres);
    group.fundingSources.add(row.fundingSource);
  });
  return [...map.values()].map((group) => ({ ...group, ptres: [...group.ptres].sort(), fundingSources: [...group.fundingSources].sort() })).sort((a, b) => b.creditAvailable - a.creditAvailable);
}
function renderGroups() {
  const body = document.getElementById("creditGroupedBody");
  body.innerHTML = state.filteredGroups.length ? state.filteredGroups.map((row) => `<tr><td><strong>${esc(row.om)}</strong><small>${esc(row.ugCode)} — ${esc(row.ugName)}</small></td><td><strong>${esc(row.action)}</strong><small>${esc(row.actionDescription)}</small></td><td>${esc(row.pi)}</td><td>${esc(row.expenseNature)}</td><td>${esc(row.ptres.join(", "))}</td><td>${esc(row.fundingSources.join(", "))}</td><td class="text-right">${row.launches.toLocaleString("pt-BR")}</td><td class="text-right budget-money">${formatMoney(row.creditAvailable)}</td></tr>`).join("") : `<tr><td colspan="8"><div class="budget-empty-state"><i class="bi bi-search"></i><strong>Nenhum crédito encontrado</strong><span>Revise os filtros aplicados.</span></div></td></tr>`;
  document.getElementById("creditGroupedCount").textContent = `${state.filteredGroups.length.toLocaleString("pt-BR")} chaves`;
}
function renderLines() {
  const body = document.getElementById("creditLinesBody");
  body.innerHTML = state.filteredLines.length ? state.filteredLines.map((row) => `<tr><td>${row.sourceLine}</td><td><strong>${esc(row.om)}</strong><small>${esc(row.ugCode)}</small></td><td><strong>${esc(row.action)}</strong><small>${esc(row.actionDescription)}</small></td><td>${esc(row.ptres)}</td><td>${esc(row.pi)}</td><td>${esc(row.expenseNature)}</td><td>${esc(row.fundingSource)}</td><td class="text-right budget-money">${formatMoney(row.creditAvailable)}</td></tr>`).join("") : `<tr><td colspan="8"><div class="budget-empty-state"><i class="bi bi-search"></i><strong>Nenhum lançamento encontrado</strong></div></td></tr>`;
  document.getElementById("creditLineCount").textContent = `${state.filteredLines.length.toLocaleString("pt-BR")} lançamentos`;
}
function renderKpis() {
  const total = state.filteredLines.reduce((sum, row) => sum + Number(row.creditAvailable || 0), 0);
  document.getElementById("creditDetailTotal").textContent = formatMoney(total);
  document.getElementById("creditDetailKeys").textContent = state.filteredGroups.length.toLocaleString("pt-BR");
  document.getElementById("creditDetailOms").textContent = new Set(state.filteredLines.map((r) => r.ugCode)).size.toLocaleString("pt-BR");
  document.getElementById("creditDetailPis").textContent = new Set(state.filteredLines.map((r) => r.pi)).size.toLocaleString("pt-BR");
  document.getElementById("creditDetailNatures").textContent = new Set(state.filteredLines.map((r) => r.expenseNature)).size.toLocaleString("pt-BR");
}
function applyFilters() {
  const filters = selectedFilters();
  state.filteredLines = state.lines.filter((row) => matchesLine(row, filters));
  state.filteredGroups = regroup(state.filteredLines);
  renderKpis(); renderGroups(); renderLines();
}
function clearFilters() { ids.forEach((id) => { if (els[id]) els[id].value = ""; }); applyFilters(); }
function csvCell(value) { const text = String(value ?? ""); return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function downloadCsv() {
  const rows = [["UG", "OM", "Unidade Gestora", "Ação", "PI", "Natureza", "PTRES", "Fonte", "Lançamentos", "Crédito Disponível"], ...state.filteredGroups.map((r) => [r.ugCode, r.om, r.ugName, r.action, r.pi, r.expenseNature, r.ptres.join(", "), r.fundingSources.join(", "), r.launches, r.creditAvailable.toFixed(2)])];
  const blob = new Blob(["\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "credito-por-pi-natureza-01092026.csv"; link.click(); URL.revokeObjectURL(link.href);
}
function generatePdf() {
  if (!window.jspdf?.jsPDF) return;
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  doc.setFontSize(18); doc.text("Crédito Disponível por PI e Natureza de Despesa", 14, 16);
  doc.setFontSize(10); doc.text(`Posição: ${state.data.metadata.position} | Fonte: ${state.data.metadata.sourceFile}`, 14, 23);
  doc.text(`Total filtrado: ${document.getElementById("creditDetailTotal").textContent} | Chaves: ${state.filteredGroups.length}`, 14, 29);
  doc.autoTable({ startY: 35, head: [["OM/UG", "Ação", "PI", "Natureza", "PTRES", "Fonte", "Lanç.", "Crédito"]], body: state.filteredGroups.map((r) => [`${r.om} / ${r.ugCode}`, r.action, r.pi, r.expenseNature, r.ptres.join(", "), r.fundingSources.join(", "), String(r.launches), formatMoney(r.creditAvailable)]), styles: { fontSize: 7 }, headStyles: { fillColor: [6, 46, 102] }, columnStyles: { 7: { halign: "right" } }, margin: { left: 14, right: 14 } });
  doc.save("credito-por-pi-natureza-01092026.pdf");
}
async function init() {
  const status = document.getElementById("creditDetailStatus");
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json(); state.lines = state.data.records || []; state.groups = state.data.groupedByMatchKey || [];
    document.getElementById("budgetSource").textContent = `${state.data.metadata.sourceFile} · gerado em ${state.data.metadata.sourceGeneratedAt} · ${state.data.metadata.recordCount} lançamentos`;
    hydrateFilters(); applyFilters(); status.textContent = "";
  } catch (error) { console.error(error); status.textContent = "Não foi possível carregar o detalhamento do crédito disponível."; status.dataset.status = "error"; }
}
ids.forEach((id) => els[id]?.addEventListener(id === "creditFilterSearch" ? "input" : "change", applyFilters));
document.getElementById("creditDetailClear")?.addEventListener("click", clearFilters);
document.getElementById("creditDetailCsv")?.addEventListener("click", downloadCsv);
document.getElementById("creditDetailPdf")?.addEventListener("click", generatePdf);
init();
