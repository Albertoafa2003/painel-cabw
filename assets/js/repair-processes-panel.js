import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZehcWZwnwlGG5LR6y7_hKAVErHiHDhXM",
  authDomain: "painel-cabw.firebaseapp.com",
  projectId: "painel-cabw",
  storageBucket: "painel-cabw.firebasestorage.app",
  messagingSenderId: "6881251447",
  appId: "1:6881251447:web:b497f601fb005d65d13672",
  measurementId: "G-D2C4E646PM"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const COLLECTION_NAME = "repairProcesses";

const STATUS_OPTIONS = [
  "Aguardando envio pelo Parque/OM",
  "Em trânsito para Washington",
  "Recebido na CABW",
  "Aguardando envio à oficina",
  "Em trânsito para oficina",
  "Em diagnóstico",
  "Aguardando orçamento",
  "Aguardando autorização",
  "Reparo autorizado",
  "Em reparo",
  "Aguardando peças",
  "Reparo concluído",
  "Retornando à CABW",
  "Retornando ao Brasil",
  "Entregue à OM de origem",
  "Suspenso",
  "Cancelado"
];

const LOCATION_OPTIONS = [
  "Parque/OM no Brasil",
  "Em trânsito Brasil → Washington",
  "CABW - Washington, DC",
  "Em trânsito CABW → Oficina",
  "Oficina reparadora",
  "Em trânsito Oficina → CABW",
  "CABW - aguardando retorno ao Brasil",
  "Em trânsito Washington → Brasil",
  "Parque/OM de origem",
  "Local não informado"
];

const FLOW_STEPS = [
  { code: "brazil", label: "Brasil / OM", icon: "bi-building", locations: ["Parque/OM no Brasil"] },
  { code: "to-cabw", label: "Trânsito ao exterior", icon: "bi-airplane", locations: ["Em trânsito Brasil → Washington"] },
  { code: "cabw", label: "CABW", icon: "bi-geo-alt", locations: ["CABW - Washington, DC", "CABW - aguardando retorno ao Brasil"] },
  { code: "to-shop", label: "Trânsito à oficina", icon: "bi-truck", locations: ["Em trânsito CABW → Oficina"] },
  { code: "shop", label: "Oficina reparadora", icon: "bi-tools", locations: ["Oficina reparadora"] },
  { code: "return", label: "Fluxo de retorno", icon: "bi-arrow-return-left", locations: ["Em trânsito Oficina → CABW", "Em trânsito Washington → Brasil"] },
  { code: "delivered", label: "Entregue à OM", icon: "bi-check2-circle", locations: ["Parque/OM de origem"] }
];

const COMPLETED_STATUSES = new Set(["Entregue à OM de origem", "Cancelado"]);
const REPAIR_STATUSES = new Set(["Em diagnóstico", "Aguardando orçamento", "Aguardando autorização", "Reparo autorizado", "Em reparo", "Aguardando peças", "Reparo concluído"]);
const TRANSIT_LOCATIONS = new Set(["Em trânsito Brasil → Washington", "Em trânsito CABW → Oficina", "Em trânsito Oficina → CABW", "Em trânsito Washington → Brasil"]);

const state = {
  records: [],
  filtered: [],
  user: null,
  isAdmin: false,
  flowGroup: "",
  unsubscribe: null
};

const els = {};
const fmtInteger = new Intl.NumberFormat("pt-BR");
const fmtDateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const moneyFormatters = {};

function $(id) { return document.getElementById(id); }

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[char]));
}

function formatMoney(value, currency = "USD") {
  const number = Number(value || 0);
  if (!moneyFormatters[currency]) {
    try {
      moneyFormatters[currency] = new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (error) {
      moneyFormatters[currency] = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
  let output = moneyFormatters[currency].format(number).replace(/\u00a0/g, " ");
  if (currency === "USD") output = output.replace(/^US\$/i, "US$");
  return output;
}

function toJsDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = toJsDate(value);
  return date ? new Intl.DateTimeFormat("pt-BR").format(date) : "—";
}

function formatDateTime(value) {
  const date = toJsDate(value);
  return date ? fmtDateTime.format(date) : "—";
}

function todayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysBetween(dateA, dateB) {
  return Math.round((dateA.getTime() - dateB.getTime()) / 86400000);
}

function deadlineInfo(item) {
  if (isCompleted(item)) return { code: "completed", label: "Concluído", days: null, className: "completed" };
  if (!item.expectedReturnDate) return { code: "no-date", label: "Sem previsão", days: null, className: "neutral" };
  const expected = new Date(`${item.expectedReturnDate}T00:00:00`);
  if (Number.isNaN(expected.getTime())) return { code: "no-date", label: "Sem previsão", days: null, className: "neutral" };
  const diff = daysBetween(expected, todayStart());
  if (diff < 0) return { code: "overdue", label: `${Math.abs(diff)} dia(s) atrasado`, days: diff, className: "danger" };
  if (diff <= 30) return { code: "due-30", label: diff === 0 ? "Vence hoje" : `${diff} dia(s)`, days: diff, className: "warning" };
  return { code: "on-time", label: `${diff} dia(s)`, days: diff, className: "success" };
}

function isCompleted(item) {
  return COMPLETED_STATUSES.has(item.repairStatus) || item.location === "Parque/OM de origem" || !!item.actualReturnDate;
}

function isInRepair(item) {
  return item.location === "Oficina reparadora" || REPAIR_STATUSES.has(item.repairStatus);
}

function isInTransit(item) {
  return TRANSIT_LOCATIONS.has(item.location) || normalize(item.repairStatus).includes("transito") || normalize(item.repairStatus).includes("retornando");
}

function recordFromSnapshot(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    processNumber: data.processNumber || "",
    commitmentPo: data.commitmentPo || "",
    description: data.description || "",
    partNumber: data.partNumber || "",
    serialNumber: data.serialNumber || "",
    originOm: data.originOm || "",
    repairShop: data.repairShop || "",
    currency: data.currency || "USD",
    itemValue: Number(data.itemValue || 0),
    repairValue: Number(data.repairValue || 0),
    repairStatus: data.repairStatus || "Aguardando envio pelo Parque/OM",
    location: data.location || "Local não informado",
    shipmentDateBrazil: data.shipmentDateBrazil || "",
    receivedCabwDate: data.receivedCabwDate || "",
    sentToShopDate: data.sentToShopDate || "",
    expectedReturnDate: data.expectedReturnDate || "",
    actualReturnDate: data.actualReturnDate || "",
    notes: data.notes || "",
    createdBy: data.createdBy || "",
    updatedBy: data.updatedBy || "",
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null
  };
}

function fillSelect(select, values, placeholder) {
  if (!select) return;
  const previous = select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (values.includes(previous)) select.value = previous;
}

function uniqueValues(field) {
  return Array.from(new Set(state.records.map(item => item[field]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}

function populateFilters() {
  fillSelect(els.statusFilter, STATUS_OPTIONS, "Todos os status");
  fillSelect(els.locationFilter, LOCATION_OPTIONS, "Todas as localizações");
  fillSelect(els.originFilter, uniqueValues("originOm"), "Todas as OMs");
  fillSelect(els.shopFilter, uniqueValues("repairShop"), "Todas as oficinas");
  fillSelect(els.currencyFilter, uniqueValues("currency"), "Todas as moedas");
}

function searchableText(item) {
  return normalize([
    item.processNumber, item.commitmentPo, item.description, item.partNumber, item.serialNumber,
    item.originOm, item.repairShop, item.repairStatus, item.location, item.notes, item.currency
  ].join(" "));
}

function readFilters() {
  return {
    status: els.statusFilter.value,
    location: els.locationFilter.value,
    origin: els.originFilter.value,
    shop: els.shopFilter.value,
    deadline: els.deadlineFilter.value,
    currency: els.currencyFilter.value,
    search: normalize(els.search.value),
    sort: els.sort.value
  };
}

function matchesFlow(item) {
  if (!state.flowGroup) return true;
  const step = FLOW_STEPS.find(value => value.code === state.flowGroup);
  return step ? step.locations.includes(item.location) : true;
}

function applyFilters() {
  const filters = readFilters();
  let records = state.records.filter(item => {
    if (filters.status && item.repairStatus !== filters.status) return false;
    if (filters.location && item.location !== filters.location) return false;
    if (filters.origin && item.originOm !== filters.origin) return false;
    if (filters.shop && item.repairShop !== filters.shop) return false;
    if (filters.currency && item.currency !== filters.currency) return false;
    if (filters.search && !searchableText(item).includes(filters.search)) return false;
    if (!matchesFlow(item)) return false;
    if (filters.deadline && deadlineInfo(item).code !== filters.deadline) return false;
    return true;
  });

  records.sort((a, b) => {
    if (filters.sort === "process") return a.processNumber.localeCompare(b.processNumber, "pt-BR", { numeric: true });
    if (filters.sort === "repair-desc") return b.repairValue - a.repairValue;
    if (filters.sort === "item-desc") return b.itemValue - a.itemValue;
    if (filters.sort === "deadline") {
      const da = deadlineInfo(a);
      const dbi = deadlineInfo(b);
      const va = da.days == null ? 999999 : da.days;
      const vb = dbi.days == null ? 999999 : dbi.days;
      return va - vb;
    }
    const aDate = toJsDate(a.updatedAt) || new Date(0);
    const bDate = toJsDate(b.updatedAt) || new Date(0);
    return bDate - aDate;
  });

  state.filtered = records;
  renderAll();
}

function renderSource(message, error = false) {
  if (!els.source) return;
  els.source.textContent = message || `Fonte: Cloud Firestore · coleção ${COLLECTION_NAME} · sincronização em tempo real`;
  els.source.classList.toggle("rep-source-error", !!error);
}

function renderKpis() {
  const records = state.filtered;
  const overdue = records.filter(item => deadlineInfo(item).code === "overdue").length;
  const currencies = new Set(records.map(item => item.currency || "USD"));
  const oneCurrency = currencies.size <= 1;
  const currency = currencies.values().next().value || "USD";
  const itemTotal = records.reduce((sum, item) => sum + item.itemValue, 0);
  const repairTotal = records.reduce((sum, item) => sum + item.repairValue, 0);

  els.kpiTotal.textContent = fmtInteger.format(records.length);
  els.kpiRepair.textContent = fmtInteger.format(records.filter(isInRepair).length);
  els.kpiTransit.textContent = fmtInteger.format(records.filter(isInTransit).length);
  els.kpiOverdue.textContent = fmtInteger.format(overdue);
  els.kpiCompleted.textContent = fmtInteger.format(records.filter(isCompleted).length);
  els.kpiItemValue.textContent = oneCurrency ? formatMoney(itemTotal, currency) : "Múltiplas moedas";
  els.kpiRepairValue.textContent = oneCurrency ? formatMoney(repairTotal, currency) : "Múltiplas moedas";
  els.kpiTotalNote.textContent = state.records.length === records.length ? "registros ativos" : "resultado dos filtros";
  els.results.textContent = `${fmtInteger.format(records.length)} item(ns) exibido(s)`;
  els.tableCount.textContent = `${fmtInteger.format(records.length)} registro(s)`;
}

function renderFlow() {
  const records = state.records;
  els.flowGrid.innerHTML = FLOW_STEPS.map((step, index) => {
    const count = records.filter(item => step.locations.includes(item.location)).length;
    const active = state.flowGroup === step.code ? " is-active" : "";
    const connector = index < FLOW_STEPS.length - 1 ? '<span class="rep-flow-connector"><i class="bi bi-chevron-right"></i></span>' : '';
    return `<button type="button" class="rep-flow-step${active}" data-flow="${step.code}">
      <span class="rep-flow-step__icon"><i class="bi ${step.icon}"></i></span>
      <strong>${escapeHtml(step.label)}</strong>
      <span>${fmtInteger.format(count)} item(ns)</span>
    </button>${connector}`;
  }).join("");
  els.clearFlow.hidden = !state.flowGroup;
  els.flowGrid.querySelectorAll("[data-flow]").forEach(button => button.addEventListener("click", () => {
    state.flowGroup = state.flowGroup === button.dataset.flow ? "" : button.dataset.flow;
    applyFilters();
  }));
}

function statusBadge(item) {
  const completed = isCompleted(item);
  const type = completed ? "completed" : isInRepair(item) ? "repair" : isInTransit(item) ? "transit" : "open";
  return `<span class="rep-badge rep-badge--${type}">${escapeHtml(item.repairStatus)}</span>`;
}

function deadlineBadge(item) {
  const info = deadlineInfo(item);
  return `<span class="rep-deadline rep-deadline--${info.className}">${escapeHtml(info.label)}</span>`;
}

function renderStatusSummary() {
  const map = new Map();
  state.filtered.forEach(item => map.set(item.repairStatus, (map.get(item.repairStatus) || 0) + 1));
  const rows = Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  const max = Math.max(...rows.map(row => row[1]), 1);
  els.statusSummary.innerHTML = rows.length ? rows.map(([status, count]) => `<div class="rep-summary-row">
    <div><strong>${escapeHtml(status)}</strong><span>${fmtInteger.format(count)} item(ns)</span></div>
    <span class="rep-summary-bar"><i style="width:${Math.max(5, count / max * 100)}%"></i></span>
  </div>`).join("") : '<p class="rep-empty-message">Nenhum status disponível para os filtros selecionados.</p>';
}

function attentionImpact(item) {
  const deadline = deadlineInfo(item);
  if (deadline.code === "overdue") return "Prazo de retorno ultrapassado; avaliar impacto na disponibilidade do material e na operação da OM.";
  if (item.repairStatus === "Aguardando peças") return "Dependência de peças pode ampliar o TAT e o custo logístico.";
  if (item.repairStatus === "Suspenso") return "Processo suspenso; confirmar causa e plano de retomada.";
  if (isInTransit(item)) return "Monitorar rastreamento, cadeia de custódia e prazo de entrega.";
  return "Acompanhar marco previsto e pendências técnicas.";
}

function renderAttentionList() {
  const priority = state.filtered
    .filter(item => !isCompleted(item))
    .sort((a, b) => {
      const da = deadlineInfo(a).days;
      const dbi = deadlineInfo(b).days;
      return (da == null ? 999999 : da) - (dbi == null ? 999999 : dbi);
    })
    .slice(0, 6);
  els.attentionList.innerHTML = priority.length ? priority.map(item => `<article class="rep-attention-item">
    <div><strong>${escapeHtml(item.processNumber || "Processo não informado")}</strong><span>${escapeHtml(item.description)}</span></div>
    <div>${deadlineBadge(item)}<small>${escapeHtml(attentionImpact(item))}</small></div>
  </article>`).join("") : '<p class="rep-empty-message">Não há itens em aberto com necessidade de atenção.</p>';
}

function pnSn(item) {
  const values = [];
  if (item.partNumber) values.push(`PN ${item.partNumber}`);
  if (item.serialNumber) values.push(`SN ${item.serialNumber}`);
  return values.join(" · ") || "—";
}

function renderTable() {
  const tbody = els.table.querySelector("tbody");
  const records = state.filtered;
  tbody.innerHTML = records.map(item => `<tr>
    <td><strong>${escapeHtml(item.processNumber || "—")}</strong></td>
    <td>${escapeHtml(item.commitmentPo || "—")}</td>
    <td class="rep-description-cell"><strong>${escapeHtml(item.description || "—")}</strong>${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ""}</td>
    <td>${escapeHtml(pnSn(item))}</td>
    <td>${escapeHtml(item.originOm || "—")}</td>
    <td>${statusBadge(item)}</td>
    <td><span class="rep-location"><i class="bi bi-geo-alt"></i>${escapeHtml(item.location)}</span></td>
    <td>${escapeHtml(item.repairShop || "—")}</td>
    <td><span>${formatDate(item.expectedReturnDate)}</span>${deadlineBadge(item)}</td>
    <td class="text-right">${formatMoney(item.itemValue, item.currency)}</td>
    <td class="text-right">${formatMoney(item.repairValue, item.currency)}</td>
    <td>${formatDateTime(item.updatedAt)}</td>
    ${state.isAdmin ? `<td class="rep-row-actions"><button type="button" data-edit="${item.id}" title="Editar"><i class="bi bi-pencil"></i></button><button type="button" data-delete="${item.id}" title="Excluir"><i class="bi bi-trash"></i></button></td>` : ""}
  </tr>`).join("");

  els.mobileList.innerHTML = records.map(item => `<article class="rep-mobile-card">
    <div class="rep-mobile-card__header"><div><span>${escapeHtml(item.processNumber || "Processo não informado")}</span><strong>${escapeHtml(item.description || "—")}</strong></div>${deadlineBadge(item)}</div>
    <div class="rep-mobile-card__badges">${statusBadge(item)}<span class="rep-badge rep-badge--location"><i class="bi bi-geo-alt"></i>${escapeHtml(item.location)}</span></div>
    <dl>
      <div><dt>Empenho / PO</dt><dd>${escapeHtml(item.commitmentPo || "—")}</dd></div>
      <div><dt>PN / SN</dt><dd>${escapeHtml(pnSn(item))}</dd></div>
      <div><dt>Origem</dt><dd>${escapeHtml(item.originOm || "—")}</dd></div>
      <div><dt>Oficina</dt><dd>${escapeHtml(item.repairShop || "—")}</dd></div>
      <div><dt>Valor do item</dt><dd>${formatMoney(item.itemValue, item.currency)}</dd></div>
      <div><dt>Valor do reparo</dt><dd>${formatMoney(item.repairValue, item.currency)}</dd></div>
    </dl>
    ${state.isAdmin ? `<div class="rep-mobile-card__actions"><button type="button" class="rep-btn rep-btn--light" data-edit="${item.id}"><i class="bi bi-pencil"></i> Editar</button><button type="button" class="rep-btn rep-btn--danger" data-delete="${item.id}"><i class="bi bi-trash"></i> Excluir</button></div>` : ""}
  </article>`).join("");

  els.emptyState.hidden = records.length > 0;
  els.table.parentElement.hidden = records.length === 0;
  els.mobileList.hidden = records.length === 0;

  document.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => openDialog(button.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", () => deleteRecord(button.dataset.delete)));
}

function renderAdminControls() {
  document.querySelectorAll("[data-repair-admin]").forEach(element => { element.hidden = !state.isAdmin; });
  if (els.newButton) els.newButton.hidden = !state.isAdmin;
}

function renderAll() {
  renderAdminControls();
  renderKpis();
  renderFlow();
  renderStatusSummary();
  renderAttentionList();
  renderTable();
}

function clearFilters() {
  [els.statusFilter, els.locationFilter, els.originFilter, els.shopFilter, els.deadlineFilter, els.currencyFilter].forEach(element => { element.value = ""; });
  els.search.value = "";
  els.sort.value = "updated";
  state.flowGroup = "";
  applyFilters();
}

function setFormMessage(message, type = "error") {
  els.formMessage.textContent = message || "";
  els.formMessage.className = `rep-form-message${message ? ` is-visible rep-form-message--${type}` : ""}`;
}

function populateFormOptions() {
  els.repairStatus.innerHTML = STATUS_OPTIONS.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  els.location.innerHTML = LOCATION_OPTIONS.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function resetForm() {
  els.form.reset();
  els.recordId.value = "";
  els.currency.value = "USD";
  els.repairStatus.value = STATUS_OPTIONS[0];
  els.location.value = LOCATION_OPTIONS[0];
  setFormMessage("");
}

function openDialog(id = "") {
  if (!state.isAdmin) return;
  resetForm();
  const item = state.records.find(record => record.id === id);
  els.dialogTitle.textContent = item ? "Editar item reparável" : "Cadastrar item reparável";
  if (item) {
    els.recordId.value = item.id;
    els.processNumber.value = item.processNumber;
    els.commitmentPo.value = item.commitmentPo;
    els.description.value = item.description;
    els.partNumber.value = item.partNumber;
    els.serialNumber.value = item.serialNumber;
    els.originOm.value = item.originOm;
    els.repairShop.value = item.repairShop;
    els.currency.value = item.currency;
    els.itemValue.value = item.itemValue || "";
    els.repairValue.value = item.repairValue || "";
    els.repairStatus.value = item.repairStatus;
    els.location.value = item.location;
    els.shipmentDateBrazil.value = item.shipmentDateBrazil;
    els.receivedCabwDate.value = item.receivedCabwDate;
    els.sentToShopDate.value = item.sentToShopDate;
    els.expectedReturnDate.value = item.expectedReturnDate;
    els.actualReturnDate.value = item.actualReturnDate;
    els.notes.value = item.notes;
  }
  if (typeof els.dialog.showModal === "function") els.dialog.showModal();
  else els.dialog.setAttribute("open", "");
}

function closeDialog() {
  if (typeof els.dialog.close === "function") els.dialog.close();
  else els.dialog.removeAttribute("open");
}

function formPayload() {
  return {
    processNumber: els.processNumber.value.trim(),
    commitmentPo: els.commitmentPo.value.trim(),
    description: els.description.value.trim(),
    partNumber: els.partNumber.value.trim(),
    serialNumber: els.serialNumber.value.trim(),
    originOm: els.originOm.value.trim(),
    repairShop: els.repairShop.value.trim(),
    currency: els.currency.value || "USD",
    itemValue: Number(els.itemValue.value || 0),
    repairValue: Number(els.repairValue.value || 0),
    repairStatus: els.repairStatus.value,
    location: els.location.value,
    shipmentDateBrazil: els.shipmentDateBrazil.value,
    receivedCabwDate: els.receivedCabwDate.value,
    sentToShopDate: els.sentToShopDate.value,
    expectedReturnDate: els.expectedReturnDate.value,
    actualReturnDate: els.actualReturnDate.value,
    notes: els.notes.value.trim()
  };
}

function duplicateExists(payload, editingId) {
  const key = normalize([payload.processNumber, payload.commitmentPo, payload.partNumber, payload.serialNumber, payload.description].join("|"));
  return state.records.some(item => item.id !== editingId && normalize([item.processNumber, item.commitmentPo, item.partNumber, item.serialNumber, item.description].join("|")) === key);
}

async function writeAudit(action, item) {
  if (!state.user) return;
  try {
    await addDoc(collection(db, "accessLogs"), {
      uid: state.user.uid,
      name: state.user.displayName || state.user.email || "",
      email: state.user.email || "",
      action,
      panel: "Materiais Reparáveis",
      path: "governanca-reparaveis.html",
      details: `${item.processNumber || ""} · ${item.commitmentPo || ""} · ${item.description || ""}`,
      timestamp: serverTimestamp(),
      timestampClient: new Date().toISOString(),
      userAgent: navigator.userAgent || ""
    });
  } catch (error) {
    console.warn("Não foi possível gravar o log da alteração.", error);
  }
}

async function saveRecord(event) {
  event.preventDefault();
  if (!state.isAdmin || !state.user) return;
  const payload = formPayload();
  if (!payload.processNumber || !payload.commitmentPo || !payload.description || !payload.repairStatus || !payload.location) {
    setFormMessage("Preencha os campos obrigatórios.");
    return;
  }
  if (payload.itemValue < 0 || payload.repairValue < 0) {
    setFormMessage("Os valores não podem ser negativos.");
    return;
  }
  const editingId = els.recordId.value;
  if (duplicateExists(payload, editingId)) {
    setFormMessage("Já existe um registro com a mesma combinação de processo, empenho/PO e identificação do item.");
    return;
  }

  els.saveButton.disabled = true;
  els.saveButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Salvando...';
  try {
    const common = {
      ...payload,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.email || state.user.uid
    };
    if (editingId) {
      await updateDoc(doc(db, COLLECTION_NAME, editingId), common);
      await writeAudit("Atualização de material reparável", payload);
    } else {
      await addDoc(collection(db, COLLECTION_NAME), {
        ...common,
        createdAt: serverTimestamp(),
        createdBy: state.user.email || state.user.uid
      });
      await writeAudit("Cadastro de material reparável", payload);
    }
    closeDialog();
  } catch (error) {
    console.error(error);
    setFormMessage(error.code === "permission-denied" ? "A gravação foi negada pelo Firestore. Publique as regras da coleção repairProcesses." : "Não foi possível salvar o registro. Verifique a conexão e tente novamente.");
  } finally {
    els.saveButton.disabled = false;
    els.saveButton.innerHTML = '<i class="bi bi-cloud-check"></i> Salvar no Firestore';
  }
}

async function deleteRecord(id) {
  if (!state.isAdmin || !state.user) return;
  const item = state.records.find(record => record.id === id);
  if (!item) return;
  if (!window.confirm(`Excluir o registro do processo ${item.processNumber}? Esta ação não pode ser desfeita.`)) return;
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    await writeAudit("Exclusão de material reparável", item);
  } catch (error) {
    window.alert(error.code === "permission-denied" ? "Exclusão negada pelas regras do Firestore." : "Não foi possível excluir o registro.");
  }
}

function filtersDescription() {
  const values = [];
  if (els.statusFilter.value) values.push(`Status: ${els.statusFilter.value}`);
  if (els.locationFilter.value) values.push(`Localização: ${els.locationFilter.value}`);
  if (els.originFilter.value) values.push(`Origem: ${els.originFilter.value}`);
  if (els.shopFilter.value) values.push(`Oficina: ${els.shopFilter.value}`);
  if (els.deadlineFilter.value) values.push(`Prazo: ${els.deadlineFilter.options[els.deadlineFilter.selectedIndex].text}`);
  if (els.currencyFilter.value) values.push(`Moeda: ${els.currencyFilter.value}`);
  if (els.search.value.trim()) values.push(`Busca: ${els.search.value.trim()}`);
  if (state.flowGroup) values.push(`Fluxo: ${FLOW_STEPS.find(step => step.code === state.flowGroup)?.label || state.flowGroup}`);
  return values.length ? values.join(" · ") : "Sem filtros — todos os registros";
}

function setupPdfDocument(title, orientation = "portrait") {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  pdf.setFillColor(1, 43, 98);
  pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 24, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("PAINEL CABW", 14, 10);
  pdf.setFontSize(11);
  pdf.text(title, 14, 18);
  pdf.setTextColor(15, 41, 82);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(`Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`, 14, 30);
  const filterLines = pdf.splitTextToSize(filtersDescription(), pdf.internal.pageSize.getWidth() - 28);
  pdf.text(filterLines, 14, 35);
  return { pdf, startY: 35 + filterLines.length * 4 + 4 };
}

function ensurePdfData() {
  if (!state.filtered.length) {
    window.alert("Não há registros para gerar o relatório.");
    return false;
  }
  return true;
}

function generateSummaryPdf() {
  if (!ensurePdfData()) return;
  const { pdf, startY } = setupPdfDocument("Relatório Gerencial — Materiais Reparáveis");
  const records = state.filtered;
  const overdue = records.filter(item => deadlineInfo(item).code === "overdue").length;
  const currencies = Array.from(new Set(records.map(item => item.currency || "USD")));
  const itemTotals = currencies.map(currency => [currency, records.filter(item => item.currency === currency).reduce((sum, item) => sum + item.itemValue, 0)]);
  const repairTotals = currencies.map(currency => [currency, records.filter(item => item.currency === currency).reduce((sum, item) => sum + item.repairValue, 0)]);

  pdf.autoTable({
    startY,
    theme: "grid",
    head: [["Indicador", "Resultado"]],
    body: [
      ["Itens controlados", String(records.length)],
      ["Em oficina / reparo", String(records.filter(isInRepair).length)],
      ["Em trânsito", String(records.filter(isInTransit).length)],
      ["Retornos atrasados", String(overdue)],
      ["Concluídos / entregues", String(records.filter(isCompleted).length)],
      ["Valor dos itens", itemTotals.map(([currency, value]) => formatMoney(value, currency)).join(" / ")],
      ["Reparos contratados", repairTotals.map(([currency, value]) => formatMoney(value, currency)).join(" / ")]
    ],
    headStyles: { fillColor: [1, 58, 126] },
    styles: { fontSize: 8.5 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 62 } }
  });

  const statusMap = new Map();
  records.forEach(item => statusMap.set(item.repairStatus, (statusMap.get(item.repairStatus) || 0) + 1));
  pdf.autoTable({
    startY: pdf.lastAutoTable.finalY + 6,
    theme: "striped",
    head: [["Status do reparo", "Itens"]],
    body: Array.from(statusMap.entries()).sort((a, b) => b[1] - a[1]),
    headStyles: { fillColor: [1, 58, 126] },
    styles: { fontSize: 8 }
  });

  const flowRows = FLOW_STEPS.map(step => [step.label, String(records.filter(item => step.locations.includes(item.location)).length)]);
  pdf.autoTable({
    startY: pdf.lastAutoTable.finalY + 6,
    theme: "striped",
    head: [["Localização / etapa logística", "Itens"]],
    body: flowRows,
    headStyles: { fillColor: [1, 58, 126] },
    styles: { fontSize: 8 }
  });

  const attention = records.filter(item => !isCompleted(item)).sort((a, b) => (deadlineInfo(a).days ?? 999999) - (deadlineInfo(b).days ?? 999999)).slice(0, 12);
  if (attention.length) {
    pdf.autoTable({
      startY: pdf.lastAutoTable.finalY + 6,
      theme: "grid",
      head: [["Processo", "Empenho/PO", "Item", "Status", "Localização", "Retorno", "Prazo"]],
      body: attention.map(item => [item.processNumber, item.commitmentPo, item.description, item.repairStatus, item.location, formatDate(item.expectedReturnDate), deadlineInfo(item).label]),
      headStyles: { fillColor: [1, 58, 126] },
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      columnStyles: { 2: { cellWidth: 48 }, 4: { cellWidth: 32 } }
    });
  }
  pdf.save(`materiais-reparaveis-gerencial-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function generateDetailedPdf() {
  if (!ensurePdfData()) return;
  const { pdf, startY } = setupPdfDocument("Relatório Detalhado — Materiais Reparáveis", "landscape");
  pdf.autoTable({
    startY,
    theme: "grid",
    head: [["Processo", "Empenho/PO", "Descrição", "PN/SN", "Origem", "Status", "Localização", "Oficina", "Retorno", "Prazo", "Valor item", "Valor reparo"]],
    body: state.filtered.map(item => [
      item.processNumber, item.commitmentPo, item.description, pnSn(item), item.originOm || "—", item.repairStatus,
      item.location, item.repairShop || "—", formatDate(item.expectedReturnDate), deadlineInfo(item).label,
      formatMoney(item.itemValue, item.currency), formatMoney(item.repairValue, item.currency)
    ]),
    headStyles: { fillColor: [1, 58, 126], fontSize: 6 },
    styles: { fontSize: 5.5, cellPadding: 1.15, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: 22 }, 2: { cellWidth: 45 }, 3: { cellWidth: 28 },
      4: { cellWidth: 24 }, 5: { cellWidth: 32 }, 6: { cellWidth: 34 }, 7: { cellWidth: 32 },
      8: { cellWidth: 20 }, 9: { cellWidth: 19 }, 10: { cellWidth: 22 }, 11: { cellWidth: 22 }
    },
    didDrawPage: data => {
      const page = pdf.internal.getNumberOfPages();
      pdf.setFontSize(7);
      pdf.setTextColor(90, 100, 120);
      pdf.text(`Página ${page}`, pdf.internal.pageSize.getWidth() - 22, pdf.internal.pageSize.getHeight() - 6);
    }
  });
  pdf.save(`materiais-reparaveis-detalhado-${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function determineAdmin(user) {
  try {
    const snapshot = await getDoc(doc(db, "admins", user.uid));
    return snapshot.exists();
  } catch (error) {
    return false;
  }
}

function subscribeData() {
  if (state.unsubscribe) state.unsubscribe();
  state.unsubscribe = onSnapshot(collection(db, COLLECTION_NAME), snapshot => {
    state.records = snapshot.docs.map(recordFromSnapshot);
    populateFilters();
    applyFilters();
    renderSource();
  }, error => {
    console.error(error);
    state.records = [];
    populateFilters();
    applyFilters();
    const message = error.code === "permission-denied"
      ? "Acesso ao Firestore negado. Publique as regras da coleção repairProcesses para habilitar o painel."
      : "Não foi possível carregar os processos de manutenção. Verifique a conexão.";
    renderSource(message, true);
  });
}

function cacheElements() {
  Object.assign(els, {
    source: $("repSourceInfo"), newButton: $("repNewButton"), statusFilter: $("repStatusFilter"), locationFilter: $("repLocationFilter"),
    originFilter: $("repOriginFilter"), shopFilter: $("repShopFilter"), deadlineFilter: $("repDeadlineFilter"), currencyFilter: $("repCurrencyFilter"),
    search: $("repSearch"), sort: $("repSort"), clearFilters: $("repClearFilters"), results: $("repResults"), pdfSummary: $("repPdfSummary"),
    pdfDetailed: $("repPdfDetailed"), kpiTotal: $("repKpiTotal"), kpiTotalNote: $("repKpiTotalNote"), kpiRepair: $("repKpiRepair"),
    kpiTransit: $("repKpiTransit"), kpiOverdue: $("repKpiOverdue"), kpiCompleted: $("repKpiCompleted"), kpiItemValue: $("repKpiItemValue"),
    kpiRepairValue: $("repKpiRepairValue"), flowGrid: $("repFlowGrid"), clearFlow: $("repClearFlow"), statusSummary: $("repStatusSummary"),
    attentionList: $("repAttentionList"), table: $("repTable"), tableCount: $("repTableCount"), mobileList: $("repMobileList"), emptyState: $("repEmptyState"),
    dialog: $("repDialog"), form: $("repForm"), dialogTitle: $("repDialogTitle"), dialogClose: $("repDialogClose"), cancelButton: $("repCancelButton"),
    saveButton: $("repSaveButton"), formMessage: $("repFormMessage"), recordId: $("repRecordId"), processNumber: $("repProcessNumber"),
    commitmentPo: $("repCommitmentPo"), description: $("repDescription"), partNumber: $("repPartNumber"), serialNumber: $("repSerialNumber"),
    originOm: $("repOriginOm"), repairShop: $("repRepairShop"), currency: $("repCurrency"), itemValue: $("repItemValue"), repairValue: $("repRepairValue"),
    repairStatus: $("repRepairStatus"), location: $("repLocation"), shipmentDateBrazil: $("repShipmentDateBrazil"), receivedCabwDate: $("repReceivedCabwDate"),
    sentToShopDate: $("repSentToShopDate"), expectedReturnDate: $("repExpectedReturnDate"), actualReturnDate: $("repActualReturnDate"), notes: $("repNotes")
  });
}

function bindEvents() {
  [els.statusFilter, els.locationFilter, els.originFilter, els.shopFilter, els.deadlineFilter, els.currencyFilter, els.sort].forEach(element => element.addEventListener("change", applyFilters));
  els.search.addEventListener("input", applyFilters);
  els.clearFilters.addEventListener("click", clearFilters);
  els.clearFlow.addEventListener("click", () => { state.flowGroup = ""; applyFilters(); });
  els.pdfSummary.addEventListener("click", generateSummaryPdf);
  els.pdfDetailed.addEventListener("click", generateDetailedPdf);
  els.newButton.addEventListener("click", () => openDialog());
  els.dialogClose.addEventListener("click", closeDialog);
  els.cancelButton.addEventListener("click", closeDialog);
  els.form.addEventListener("submit", saveRecord);
  els.dialog.addEventListener("click", event => { if (event.target === els.dialog) closeDialog(); });
}

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  populateFormOptions();
  populateFilters();
  bindEvents();
  renderAll();
  onAuthStateChanged(auth, async user => {
    if (!user) return;
    state.user = user;
    state.isAdmin = await determineAdmin(user);
    renderAdminControls();
    subscribeData();
  });
});
