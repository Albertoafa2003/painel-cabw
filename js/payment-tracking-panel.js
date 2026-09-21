import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
  setDoc,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  PAYMENT_STATUSES,
  PAYMENT_STAGES,
  PAYMENT_IMPORT_HEADERS,
  IMPORTED_PAYMENT_FIELDS,
  normalizeText,
  normalizeToken,
  normalizeStatus,
  stageForStatus,
  normalizeCurrency,
  parseFlexibleNumber,
  parseDateToIso,
  todayIso,
  classifyPaymentDeadline,
  buildHeaderMap,
  normalizeImportedPayment,
  stablePaymentKeySource,
  sha256Hex,
  importedPaymentEqual,
  aggregateByCurrency,
  formatMoney,
  paymentSearchText
} from "./payment-tracking-core.js?v=20260901-payments-r1";

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

const COLLECTION_NAME = "supplierPayments";
const CONFIG_DOC = "supplierPaymentsConfig/current";
const IMPORT_COLLECTION = "supplierPaymentImports";
const MAX_BATCH_WRITES = 400;
const BUILD_VERSION = "20260901-payments-r1";
const CURRENT_DATE = todayIso();

const FLOW_STEPS = Object.freeze([
  { stage: "Documentação", icon: "bi-file-earmark-text", description: "Recebimento e conferência da fatura" },
  { stage: "Atestação", icon: "bi-patch-check", description: "Comprovação do objeto e atesto" },
  { stage: "Liquidação", icon: "bi-calculator", description: "Liquidação da despesa" },
  { stage: "Programação financeira", icon: "bi-calendar2-week", description: "Autorização e programação" },
  { stage: "Pagamento", icon: "bi-bank", description: "Pagamento realizado" },
  { stage: "Pendência", icon: "bi-exclamation-diamond", description: "Tratamento de impedimentos" },
  { stage: "Encerrado sem pagamento", icon: "bi-x-octagon", description: "Registro cancelado" }
]);

const DEADLINE_OPTIONS = Object.freeze([
  ["", "Todas as situações"],
  ["late-all", "Todos os atrasos"],
  ["overdue", "Vencidos e não pagos"],
  ["paid-late", "Pagos com atraso"],
  ["due-today", "Vencem hoje"],
  ["due-7", "Vencem em até 7 dias"],
  ["due-30", "Vencem entre 8 e 30 dias"],
  ["in-time", "Prazo superior a 30 dias"],
  ["paid-on-time", "Pagos no prazo"],
  ["paid-no-due", "Pagos sem vencimento informado"],
  ["no-due-date", "Sem vencimento informado"],
  ["suspended", "Suspensos"],
  ["cancelled", "Cancelados"]
]);

const state = {
  user: null,
  isAdmin: false,
  records: [],
  filtered: [],
  config: null,
  importHistory: [],
  importPreview: null,
  subscriptions: [],
  firestoreError: null
};

const els = {};
const byId = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[character]));
}

function toJsDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const iso = parseDateToIso(value);
  if (!iso) return "Não informado";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  const date = toJsDate(value);
  return date
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : "Não informado";
}

function formatInteger(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function displayText(value, fallback = "Não informado") {
  const text = normalizeText(value);
  return text || fallback;
}

function normalizeRecord(input) {
  const status = normalizeStatus(input?.status);
  const netAmount = parseFlexibleNumber(input?.netAmount);
  const grossAmount = parseFlexibleNumber(input?.grossAmount);
  const deductions = parseFlexibleNumber(input?.deductions);
  const paidDate = parseDateToIso(input?.paidDate);
  return {
    ...input,
    id: input.id || "",
    supplier: normalizeText(input?.supplier),
    nup: normalizeText(input?.nup) || null,
    contractPag: normalizeText(input?.contractPag) || null,
    commitmentPo: normalizeText(input?.commitmentPo) || null,
    invoiceNumber: normalizeText(input?.invoiceNumber) || null,
    documentType: normalizeText(input?.documentType) || null,
    currency: normalizeCurrency(input?.currency) || null,
    grossAmount,
    deductions,
    netAmount: netAmount ?? (grossAmount !== null ? grossAmount - (deductions || 0) : null),
    issueDate: parseDateToIso(input?.issueDate),
    receivedDate: parseDateToIso(input?.receivedDate),
    dueDate: parseDateToIso(input?.dueDate),
    scheduledDate: parseDateToIso(input?.scheduledDate),
    paidDate,
    status,
    stage: paidDate ? "Pagamento" : stageForStatus(status),
    requestingUnit: normalizeText(input?.requestingUnit) || null,
    responsible: normalizeText(input?.responsible) || null,
    paymentReference: normalizeText(input?.paymentReference) || null,
    observations: normalizeText(input?.observations) || null,
    qualityWarnings: Array.isArray(input?.qualityWarnings) ? input.qualityWarnings : [],
    archived: input?.archived === true
  };
}

function recordFromSnapshot(snapshot) {
  return normalizeRecord({ id: snapshot.id, ...(snapshot.data() || {}) });
}

function isPaid(record) {
  return normalizeStatus(record.status) === "Pago" || Boolean(parseDateToIso(record.paidDate));
}

function isCancelled(record) {
  return normalizeStatus(record.status) === "Cancelado";
}

function setMessage(element, message, type = "info") {
  if (!element) return;
  element.textContent = message || "";
  element.className = `pay-form-message${message ? ` is-visible pay-form-message--${type}` : ""}`;
}

function showAdminElements() {
  document.querySelectorAll("[data-payment-admin]").forEach(element => {
    element.hidden = !state.isAdmin;
  });
  if (!state.isAdmin && els.importPanel) els.importPanel.hidden = true;
}

async function checkAdmin(user) {
  if (!user?.uid) return false;
  try {
    const snapshot = await getDoc(doc(db, "admins", user.uid));
    return snapshot.exists();
  } catch (error) {
    console.warn("Não foi possível verificar o perfil administrativo.", error);
    return false;
  }
}

async function logAction(action, details = "") {
  if (!state.user?.uid) return;
  try {
    await addDoc(collection(db, "accessLogs"), {
      uid: state.user.uid,
      name: state.user.displayName || state.user.email || "",
      email: state.user.email || "",
      action,
      panel: "Acompanhamento de Pagamentos",
      path: "pagamentos.html",
      details,
      timestamp: serverTimestamp(),
      timestampClient: new Date().toISOString(),
      userAgent: navigator.userAgent || ""
    });
  } catch (error) {
    console.warn("Não foi possível registrar a ação no histórico.", error);
  }
}

function selectValue(element) {
  return element ? element.value : "";
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function populateSelect(element, values, allLabel, officialValues = []) {
  if (!element) return;
  const current = element.value;
  const official = Array.from(new Set(officialValues.filter(Boolean)));
  const officialSet = new Set(official);
  const extras = uniqueSorted(values.filter(value => value && !officialSet.has(value)));
  const options = [...official, ...extras];
  element.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>`
    + options.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (options.includes(current)) element.value = current;
}

function populateFilters() {
  populateSelect(els.supplierFilter, state.records.map(record => record.supplier), "Todos os fornecedores");
  populateSelect(els.statusFilter, state.records.map(record => record.status), "Todos os status", PAYMENT_STATUSES);
  populateSelect(els.stageFilter, state.records.map(record => record.stage), "Todas as etapas", PAYMENT_STAGES);
  populateSelect(els.currencyFilter, state.records.map(record => record.currency), "Todas as moedas");
  populateSelect(els.unitFilter, state.records.map(record => record.requestingUnit), "Todas as unidades");
}

function dateForFilter(record) {
  const field = selectValue(els.dateFieldFilter) || "dueDate";
  return parseDateToIso(record[field]);
}

function deadlineMatches(code, filter) {
  if (!filter) return true;
  if (filter === "late-all") return ["overdue", "paid-late"].includes(code);
  if (filter === "paid-on-time") return code === "paid-on-time";
  return code === filter;
}

function deadlineRank(record) {
  const info = classifyPaymentDeadline(record, CURRENT_DATE);
  const order = {
    overdue: 0,
    "due-today": 1,
    "due-7": 2,
    "due-30": 3,
    suspended: 4,
    "no-due-date": 5,
    "in-time": 6,
    "paid-late": 7,
    "paid-on-time": 8,
    "paid-no-due": 9,
    "paid-no-date": 10,
    cancelled: 11
  };
  return order[info.code] ?? 99;
}

function applyFilters() {
  const supplier = selectValue(els.supplierFilter);
  const status = selectValue(els.statusFilter);
  const stage = selectValue(els.stageFilter);
  const deadline = selectValue(els.deadlineFilter);
  const currency = selectValue(els.currencyFilter);
  const unit = selectValue(els.unitFilter);
  const dateFrom = selectValue(els.dateFromFilter);
  const dateTo = selectValue(els.dateToFilter);
  const search = normalizeText(els.searchFilter?.value).toLowerCase();
  const includeArchived = state.isAdmin && Boolean(els.includeArchived?.checked);

  let records = state.records.filter(record => {
    if (!includeArchived && record.archived) return false;
    if (supplier && record.supplier !== supplier) return false;
    if (status && record.status !== status) return false;
    if (stage && record.stage !== stage) return false;
    if (currency && record.currency !== currency) return false;
    if (unit && record.requestingUnit !== unit) return false;
    if (!deadlineMatches(classifyPaymentDeadline(record, CURRENT_DATE).code, deadline)) return false;
    const date = dateForFilter(record);
    if (dateFrom && (!date || date < dateFrom)) return false;
    if (dateTo && (!date || date > dateTo)) return false;
    if (search && !paymentSearchText(record).includes(search)) return false;
    return true;
  });

  const sortMode = selectValue(els.sortFilter) || "deadline";
  records.sort((a, b) => {
    if (sortMode === "deadline") {
      return deadlineRank(a) - deadlineRank(b)
        || String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31"))
        || a.supplier.localeCompare(b.supplier, "pt-BR");
    }
    if (sortMode === "due-date") {
      return String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31"));
    }
    if (sortMode === "amount-desc") {
      return Number(b.netAmount || 0) - Number(a.netAmount || 0);
    }
    if (sortMode === "supplier") return a.supplier.localeCompare(b.supplier, "pt-BR");
    if (sortMode === "status") return a.status.localeCompare(b.status, "pt-BR");
    if (sortMode === "recent") {
      return (toJsDate(b.updatedAt || b.importedAt)?.getTime() || 0) - (toJsDate(a.updatedAt || a.importedAt)?.getTime() || 0);
    }
    return 0;
  });

  state.filtered = records;
  renderAll();
}

function formatCurrencyList(records, field) {
  const totals = aggregateByCurrency(records, field);
  if (!totals.length) return "Não informado";
  return totals.slice(0, 3).map(item => formatMoney(item.value, item.currency)).join(" · ")
    + (totals.length > 3 ? ` · +${totals.length - 3}` : "");
}

function renderSource() {
  if (!els.sourceTitle || !els.sourceInfo) return;
  if (state.firestoreError) {
    els.sourceTitle.textContent = "Firestore indisponível";
    els.sourceInfo.textContent = "Verifique as regras de segurança incluídas no pacote e a conexão com o banco.";
    return;
  }
  if (state.config) {
    const file = state.config.sourceFileName || "Cadastro manual / Firestore";
    const reference = formatDate(state.config.referenceDate);
    const imported = formatDateTime(state.config.importedAt || state.config.updatedAt);
    els.sourceTitle.textContent = reference === "Não informado" ? "Base ativa" : `Posição ${reference}`;
    els.sourceInfo.textContent = `${file} · ${formatInteger(state.records.filter(record => !record.archived).length)} registro(s) · atualizado em ${imported}.`;
    return;
  }
  if (state.records.length) {
    els.sourceTitle.textContent = "Base ativa";
    els.sourceInfo.textContent = `${formatInteger(state.records.filter(record => !record.archived).length)} registro(s) carregados do Firestore.`;
  } else {
    els.sourceTitle.textContent = "Base ainda não cadastrada";
    els.sourceInfo.textContent = state.isAdmin
      ? "Importe uma planilha ou cadastre o primeiro pagamento."
      : "Aguarde a inclusão dos dados pela administração do sistema.";
  }
}

function renderKpis() {
  const records = state.filtered;
  const active = records.filter(record => !record.archived);
  const suppliers = new Set(active.map(record => record.supplier).filter(Boolean)).size;
  const paid = active.filter(isPaid);
  const processing = active.filter(record => !isPaid(record) && !isCancelled(record));
  const awaiting = active.filter(record => [
    "Aguardando autorização de pagamento",
    "Pagamento programado"
  ].includes(record.status));
  const overdue = active.filter(record => classifyPaymentDeadline(record, CURRENT_DATE).code === "overdue");
  const dueSoon = active.filter(record => ["due-today", "due-7"].includes(classifyPaymentDeadline(record, CURRENT_DATE).code));
  const pendingValue = active.filter(record => !isPaid(record) && !isCancelled(record));

  els.kpiTotal.textContent = formatInteger(active.length);
  els.kpiSuppliers.textContent = `${formatInteger(suppliers)} fornecedor${suppliers === 1 ? "" : "es"}`;
  els.kpiProcessing.textContent = formatInteger(processing.length);
  els.kpiAwaiting.textContent = formatInteger(awaiting.length);
  els.kpiOverdue.textContent = formatInteger(overdue.length);
  els.kpiDueSoon.textContent = formatInteger(dueSoon.length);
  els.kpiPaid.textContent = formatInteger(paid.length);
  els.kpiPaidRate.textContent = active.length ? `${(paid.length / active.length * 100).toFixed(1).replace(".", ",")}% da consulta` : "0% da consulta";
  els.kpiPendingAmount.textContent = formatCurrencyList(pendingValue, "netAmount");
  els.kpiPaidAmount.textContent = formatCurrencyList(paid, "netAmount");
}

function renderFlow() {
  if (!els.flowGrid) return;
  const selected = selectValue(els.stageFilter);
  const total = state.filtered.length || 1;
  els.flowGrid.innerHTML = FLOW_STEPS.map(step => {
    const count = state.filtered.filter(record => record.stage === step.stage).length;
    const percentage = Math.round(count / total * 100);
    const activeClass = selected === step.stage ? " is-active" : "";
    return `<button type="button" class="pay-flow-step${activeClass}" data-flow-stage="${escapeHtml(step.stage)}">
      <span class="pay-flow-step__icon"><i class="bi ${escapeHtml(step.icon)}"></i></span>
      <span class="pay-flow-step__text"><strong>${escapeHtml(step.stage)}</strong><small>${escapeHtml(step.description)}</small></span>
      <span class="pay-flow-step__count">${formatInteger(count)}</span>
      <span class="pay-flow-step__bar"><i style="width:${percentage}%"></i></span>
    </button>`;
  }).join("");

  els.flowGrid.querySelectorAll("[data-flow-stage]").forEach(button => {
    button.addEventListener("click", () => {
      const stage = button.dataset.flowStage || "";
      els.stageFilter.value = els.stageFilter.value === stage ? "" : stage;
      applyFilters();
    });
  });
}

function supplierSummary(records) {
  const map = new Map();
  records.filter(record => !isPaid(record) && !isCancelled(record)).forEach(record => {
    const currency = record.currency || "SEM MOEDA";
    const key = `${record.supplier}|||${currency}`;
    const current = map.get(key) || {
      supplier: record.supplier || "Não informado",
      currency,
      count: 0,
      amount: 0,
      overdue: 0
    };
    current.count += 1;
    current.amount += Number(record.netAmount || 0);
    if (classifyPaymentDeadline(record, CURRENT_DATE).code === "overdue") current.overdue += 1;
    map.set(key, current);
  });
  return Array.from(map.values())
    .sort((a, b) => a.currency.localeCompare(b.currency, "pt-BR") || b.amount - a.amount)
    .slice(0, 12);
}

function renderSummaries() {
  const suppliers = supplierSummary(state.filtered);
  els.supplierSummaryBody.innerHTML = suppliers.length
    ? suppliers.map(item => `<tr>
        <td>${escapeHtml(item.supplier)}</td>
        <td class="text-center">${formatInteger(item.count)}</td>
        <td>${escapeHtml(item.currency)}</td>
        <td class="text-right pay-tabular">${escapeHtml(formatMoney(item.amount, item.currency))}</td>
        <td class="text-center">${item.overdue ? `<span class="pay-count-danger">${formatInteger(item.overdue)}</span>` : "0"}</td>
      </tr>`).join("")
    : '<tr><td colspan="5" class="pay-empty-cell">Nenhum valor pendente na consulta.</td></tr>';

  const currencies = new Map();
  state.filtered.forEach(record => {
    const currency = record.currency || "SEM MOEDA";
    const current = currencies.get(currency) || { currency, gross: 0, deductions: 0, net: 0, paid: 0, pending: 0 };
    current.gross += Number(record.grossAmount || 0);
    current.deductions += Number(record.deductions || 0);
    current.net += Number(record.netAmount || 0);
    if (isPaid(record)) current.paid += Number(record.netAmount || 0);
    else if (!isCancelled(record)) current.pending += Number(record.netAmount || 0);
    currencies.set(currency, current);
  });
  const currencyRows = Array.from(currencies.values()).sort((a, b) => a.currency.localeCompare(b.currency, "pt-BR"));
  els.currencySummaryBody.innerHTML = currencyRows.length
    ? currencyRows.map(item => `<tr>
        <td><strong>${escapeHtml(item.currency)}</strong></td>
        <td class="text-right pay-tabular">${escapeHtml(formatMoney(item.gross, item.currency))}</td>
        <td class="text-right pay-tabular">${escapeHtml(formatMoney(item.deductions, item.currency))}</td>
        <td class="text-right pay-tabular">${escapeHtml(formatMoney(item.net, item.currency))}</td>
        <td class="text-right pay-tabular">${escapeHtml(formatMoney(item.paid, item.currency))}</td>
        <td class="text-right pay-tabular">${escapeHtml(formatMoney(item.pending, item.currency))}</td>
      </tr>`).join("")
    : '<tr><td colspan="6" class="pay-empty-cell">Nenhum valor financeiro disponível.</td></tr>';
}

function deadlineBadge(record) {
  const info = classifyPaymentDeadline(record, CURRENT_DATE);
  return `<span class="pay-deadline pay-deadline--${escapeHtml(info.severity)}">${escapeHtml(info.label)}</span>`;
}

function statusBadge(record) {
  const token = normalizeToken(record.status).toLowerCase().replace(/\s+/g, "-");
  return `<span class="pay-status pay-status--${escapeHtml(token)}">${escapeHtml(record.status)}</span>`;
}

function actionButtons(record) {
  const archiveTitle = record.archived ? "Restaurar registro" : "Arquivar registro";
  const archiveIcon = record.archived ? "bi-arrow-counterclockwise" : "bi-archive";
  return `<div class="pay-row-actions">
    <button type="button" class="pay-icon-button" data-view-payment="${escapeHtml(record.id)}" title="Ver detalhes"><i class="bi bi-eye"></i></button>
    ${state.isAdmin ? `<button type="button" class="pay-icon-button" data-edit-payment="${escapeHtml(record.id)}" title="Editar"><i class="bi bi-pencil"></i></button>
    <button type="button" class="pay-icon-button${record.archived ? "" : " pay-icon-button--danger"}" data-archive-payment="${escapeHtml(record.id)}" title="${archiveTitle}"><i class="bi ${archiveIcon}"></i></button>` : ""}
  </div>`;
}

function renderDetailTable() {
  const records = state.filtered;
  const baseExists = state.records.some(record => !record.archived);
  const emptyTitle = els.emptyState?.querySelector("h3");
  const emptyText = els.emptyState?.querySelector("p");

  els.resultsInfo.textContent = `${formatInteger(records.length)} registro${records.length === 1 ? "" : "s"} exibido${records.length === 1 ? "" : "s"}`;
  els.rowsInfo.textContent = state.records.length
    ? `${formatInteger(records.length)} de ${formatInteger(state.records.filter(record => !record.archived).length)} registro(s) conforme os filtros aplicados.`
    : "Nenhum pagamento cadastrado no Firestore.";

  if (!records.length) {
    els.emptyState.hidden = false;
    els.tableWrap.hidden = true;
    els.mobileList.innerHTML = "";
    if (emptyTitle) emptyTitle.textContent = baseExists ? "Nenhum registro atende aos filtros" : "Nenhum pagamento cadastrado";
    if (emptyText) emptyText.textContent = baseExists
      ? "Revise os filtros selecionados ou limpe a consulta para visualizar a base completa."
      : "A base financeira não é incluída nos arquivos públicos do GitHub Pages. Um administrador deve cadastrar os registros ou importar uma planilha após publicar as regras do Firestore fornecidas no pacote.";
    return;
  }

  els.emptyState.hidden = true;
  els.tableWrap.hidden = false;
  els.detailBody.innerHTML = records.map(record => `<tr class="${record.archived ? "pay-row--archived" : ""}">
    <td>${deadlineBadge(record)}</td>
    <td>${statusBadge(record)}</td>
    <td><strong>${escapeHtml(displayText(record.supplier))}</strong></td>
    <td>${escapeHtml(displayText(record.invoiceNumber, "—"))}</td>
    <td class="pay-nowrap">${escapeHtml(displayText(record.nup, "—"))}</td>
    <td>${escapeHtml(displayText(record.contractPag, "—"))}</td>
    <td>${escapeHtml(displayText(record.commitmentPo, "—"))}</td>
    <td>${escapeHtml(displayText(record.requestingUnit, "—"))}</td>
    <td>${escapeHtml(displayText(record.currency, "—"))}</td>
    <td class="text-right pay-tabular">${escapeHtml(formatMoney(record.netAmount, record.currency || ""))}</td>
    <td class="pay-nowrap">${escapeHtml(formatDate(record.dueDate))}</td>
    <td class="pay-nowrap">${escapeHtml(formatDate(record.scheduledDate))}</td>
    <td class="pay-nowrap">${escapeHtml(formatDate(record.paidDate))}</td>
    <td>${escapeHtml(displayText(record.responsible, "—"))}</td>
    <td>${actionButtons(record)}</td>
  </tr>`).join("");

  els.mobileList.innerHTML = records.map(record => `<article class="pay-mobile-card ${record.archived ? "is-archived" : ""}">
    <div class="pay-mobile-card__top"><div>${statusBadge(record)}${deadlineBadge(record)}</div><strong>${escapeHtml(formatMoney(record.netAmount, record.currency || ""))}</strong></div>
    <h3>${escapeHtml(displayText(record.supplier))}</h3>
    <dl>
      <div><dt>Fatura</dt><dd>${escapeHtml(displayText(record.invoiceNumber, "—"))}</dd></div>
      <div><dt>NUP</dt><dd>${escapeHtml(displayText(record.nup, "—"))}</dd></div>
      <div><dt>Contrato/PAG</dt><dd>${escapeHtml(displayText(record.contractPag, "—"))}</dd></div>
      <div><dt>Vencimento</dt><dd>${escapeHtml(formatDate(record.dueDate))}</dd></div>
    </dl>
    <div class="pay-mobile-card__actions">${actionButtons(record)}</div>
  </article>`).join("");

  bindRowActions();
}

function renderAll() {
  renderKpis();
  renderFlow();
  renderSummaries();
  renderDetailTable();
  renderSource();
}

function detailRow(label, value, options = {}) {
  const rendered = options.raw ? value : escapeHtml(displayText(value));
  return `<div><dt>${escapeHtml(label)}</dt><dd>${rendered}</dd></div>`;
}

function openDetail(id) {
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  const deadline = classifyPaymentDeadline(record, CURRENT_DATE);
  els.detailTitle.textContent = record.supplier || "Detalhamento do pagamento";
  els.detailContent.innerHTML = `
    <section class="pay-detail-group"><h3>Identificação</h3><dl>
      ${detailRow("Fornecedor", record.supplier)}
      ${detailRow("Fatura / Invoice", record.invoiceNumber)}
      ${detailRow("Tipo do documento", record.documentType)}
      ${detailRow("NUP", record.nup)}
      ${detailRow("Contrato / PAG", record.contractPag)}
      ${detailRow("Empenho / PO", record.commitmentPo)}
      ${detailRow("Unidade demandante", record.requestingUnit)}
      ${detailRow("Responsável", record.responsible)}
    </dl></section>
    <section class="pay-detail-group"><h3>Situação financeira</h3><dl>
      ${detailRow("Status", statusBadge(record), { raw: true })}
      ${detailRow("Etapa", record.stage)}
      ${detailRow("Situação do prazo", deadlineBadge(record), { raw: true })}
      ${detailRow("Moeda", record.currency)}
      ${detailRow("Valor bruto", formatMoney(record.grossAmount, record.currency || ""))}
      ${detailRow("Retenções / descontos", formatMoney(record.deductions, record.currency || ""))}
      ${detailRow("Valor líquido", formatMoney(record.netAmount, record.currency || ""))}
    </dl></section>
    <section class="pay-detail-group"><h3>Datas do processamento</h3><dl>
      ${detailRow("Emissão", formatDate(record.issueDate))}
      ${detailRow("Recebimento na CABW", formatDate(record.receivedDate))}
      ${detailRow("Vencimento", formatDate(record.dueDate))}
      ${detailRow("Previsão de pagamento", formatDate(record.scheduledDate))}
      ${detailRow("Pagamento efetivo", formatDate(record.paidDate))}
    </dl></section>
    <section class="pay-detail-group"><h3>Pagamento e pendências</h3><dl>
      ${detailRow("Referência do pagamento", record.paymentReference)}
      ${detailRow("Observações / pendências", record.observations)}
      ${detailRow("Registro arquivado", record.archived ? "Sim" : "Não")}
    </dl></section>
    <section class="pay-detail-group"><h3>Metadados</h3><dl>
      ${detailRow("Chave de importação", record.importKey)}
      ${detailRow("Arquivo de origem", record.sourceFileName)}
      ${detailRow("Aba", record.sourceSheet)}
      ${detailRow("Linha", record.sourceRow)}
      ${detailRow("Referência da importação", formatDate(record.importReferenceDate))}
      ${detailRow("Criado em", formatDateTime(record.createdAt))}
      ${detailRow("Atualizado em", formatDateTime(record.updatedAt || record.importedAt))}
      ${detailRow("Atualizado por", record.updatedByName || record.importedByName || record.updatedBy || record.importedBy)}
    </dl></section>
    ${record.qualityWarnings?.length ? `<section class="pay-quality-warning"><h3>Avisos de qualidade</h3><ul>${record.qualityWarnings.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
  `;
  els.detailEdit.hidden = !state.isAdmin;
  els.detailEdit.dataset.editPayment = record.id;
  els.detailDialog.showModal();
}

function resetForm() {
  els.form.reset();
  els.formId.value = "";
  els.formTitle.textContent = "Cadastrar pagamento";
  els.formStatus.value = "Fatura recebida";
  setMessage(els.formMessage, "");
}

function setInput(element, value) {
  if (element) element.value = value ?? "";
}

function openForm(id = "") {
  if (!state.isAdmin) return;
  resetForm();
  if (id) {
    const record = state.records.find(item => item.id === id);
    if (!record) return;
    els.formTitle.textContent = "Editar pagamento";
    setInput(els.formId, record.id);
    setInput(els.formSupplier, record.supplier);
    setInput(els.formNup, record.nup);
    setInput(els.formContractPag, record.contractPag);
    setInput(els.formCommitmentPo, record.commitmentPo);
    setInput(els.formInvoice, record.invoiceNumber);
    setInput(els.formDocumentType, record.documentType);
    setInput(els.formCurrency, record.currency);
    setInput(els.formGross, record.grossAmount);
    setInput(els.formDeductions, record.deductions);
    setInput(els.formNet, record.netAmount);
    setInput(els.formIssueDate, record.issueDate);
    setInput(els.formReceivedDate, record.receivedDate);
    setInput(els.formDueDate, record.dueDate);
    setInput(els.formScheduledDate, record.scheduledDate);
    setInput(els.formPaidDate, record.paidDate);
    setInput(els.formStatus, record.status);
    setInput(els.formUnit, record.requestingUnit);
    setInput(els.formResponsible, record.responsible);
    setInput(els.formReference, record.paymentReference);
    setInput(els.formObservations, record.observations);
  }
  els.formDialog.showModal();
}

function formRecord() {
  const status = normalizeStatus(els.formStatus.value);
  return normalizeRecord({
    supplier: els.formSupplier.value,
    nup: els.formNup.value,
    contractPag: els.formContractPag.value,
    commitmentPo: els.formCommitmentPo.value,
    invoiceNumber: els.formInvoice.value,
    documentType: els.formDocumentType.value,
    currency: els.formCurrency.value,
    grossAmount: els.formGross.value,
    deductions: els.formDeductions.value,
    netAmount: els.formNet.value,
    issueDate: els.formIssueDate.value,
    receivedDate: els.formReceivedDate.value,
    dueDate: els.formDueDate.value,
    scheduledDate: els.formScheduledDate.value,
    paidDate: els.formPaidDate.value,
    status,
    stage: stageForStatus(status),
    requestingUnit: els.formUnit.value,
    responsible: els.formResponsible.value,
    paymentReference: els.formReference.value,
    observations: els.formObservations.value,
    archived: false
  });
}

async function saveForm(event) {
  event.preventDefault();
  if (!state.isAdmin || !state.user) return;
  const record = formRecord();
  const identifiers = [record.nup, record.contractPag, record.commitmentPo, record.invoiceNumber].filter(Boolean);
  if (!record.supplier) {
    setMessage(els.formMessage, "Informe o fornecedor.", "error");
    return;
  }
  if (!identifiers.length) {
    setMessage(els.formMessage, "Informe ao menos NUP, Contrato/PAG, Empenho/PO ou Fatura/Invoice.", "error");
    return;
  }

  els.formSave.disabled = true;
  setMessage(els.formMessage, "Salvando no Firestore...", "info");
  try {
    const existingId = normalizeText(els.formId.value);
    const importKey = stablePaymentKeySource(record);
    const id = existingId || await sha256Hex(importKey);
    const existing = state.records.find(item => item.id === id);
    const payload = {
      ...record,
      importKey: existing?.importKey || importKey,
      manualEntry: existing?.manualEntry ?? true,
      sourceFileName: existing?.sourceFileName || "Cadastro manual",
      sourceSheet: existing?.sourceSheet || null,
      sourceRow: existing?.sourceRow || null,
      importReferenceDate: existing?.importReferenceDate || CURRENT_DATE,
      archived: existing?.archived === true ? true : false,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid,
      updatedByName: state.user.displayName || state.user.email || ""
    };
    if (!existing) {
      payload.createdAt = serverTimestamp();
      payload.createdBy = state.user.uid;
      payload.createdByName = state.user.displayName || state.user.email || "";
    }
    await setDoc(doc(db, COLLECTION_NAME, id), payload, { merge: true });
    await setDoc(doc(db, "supplierPaymentsConfig", "current"), {
      buildVersion: BUILD_VERSION,
      referenceDate: CURRENT_DATE,
      sourceFileName: existing?.sourceFileName || "Cadastro manual",
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid,
      updatedByName: state.user.displayName || state.user.email || ""
    }, { merge: true });
    await logAction(existing ? "Pagamento atualizado" : "Pagamento cadastrado", `${record.supplier} · ${record.invoiceNumber || record.nup || record.commitmentPo || record.contractPag}`);
    els.formDialog.close();
  } catch (error) {
    console.error(error);
    setMessage(els.formMessage, error.code === "permission-denied"
      ? "Operação negada. Publique as regras de pagamentos fornecidas no pacote."
      : `Não foi possível salvar: ${error.message || error.code || "erro desconhecido"}.`, "error");
  } finally {
    els.formSave.disabled = false;
  }
}

async function toggleArchive(id) {
  if (!state.isAdmin || !state.user) return;
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  const restoring = record.archived === true;
  const message = restoring
    ? `Restaurar o pagamento de ${record.supplier}?`
    : `Arquivar o pagamento de ${record.supplier}? O registro continuará disponível para auditoria.`;
  if (!window.confirm(message)) return;
  try {
    await setDoc(doc(db, COLLECTION_NAME, id), {
      archived: !restoring,
      archivedAt: restoring ? null : serverTimestamp(),
      archivedBy: restoring ? null : state.user.uid,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid,
      updatedByName: state.user.displayName || state.user.email || ""
    }, { merge: true });
    await logAction(restoring ? "Pagamento restaurado" : "Pagamento arquivado", `${record.supplier} · ${record.invoiceNumber || record.nup || "registro"}`);
  } catch (error) {
    window.alert(error.code === "permission-denied"
      ? "Operação negada pelas regras do Firestore."
      : "Não foi possível alterar o registro.");
  }
}

function bindRowActions() {
  document.querySelectorAll("[data-view-payment]").forEach(button => {
    button.addEventListener("click", () => openDetail(button.dataset.viewPayment));
  });
  document.querySelectorAll("[data-edit-payment]").forEach(button => {
    button.addEventListener("click", () => openForm(button.dataset.editPayment));
  });
  document.querySelectorAll("[data-archive-payment]").forEach(button => {
    button.addEventListener("click", () => toggleArchive(button.dataset.archivePayment));
  });
}

function workbookSheetName(workbook, requested = "") {
  if (requested && workbook.SheetNames.includes(requested)) return requested;
  const preferred = workbook.SheetNames.find(name => /pagamento|pagamentos|financeiro|base|bd/i.test(name));
  return preferred || workbook.SheetNames[0];
}

function findHeaderRow(rows) {
  let best = { index: -1, score: 0, map: {} };
  rows.slice(0, 20).forEach((row, index) => {
    const headerMap = buildHeaderMap(row || []);
    const score = Object.keys(headerMap).length;
    if (score > best.score) best = { index, score, map: headerMap };
  });
  return best;
}

function mergeImportedWithExisting(record, existing, mappedFields) {
  if (!existing) return record;
  const mapped = new Set(mappedFields || []);
  const merged = { ...record };

  IMPORTED_PAYMENT_FIELDS.forEach(field => {
    if (field === "stage") return;
    if (mapped.has(field)) return;
    if (field === "netAmount" && (mapped.has("grossAmount") || mapped.has("deductions"))) return;
    if (existing[field] !== undefined && existing[field] !== null && existing[field] !== "") {
      merged[field] = existing[field];
    }
  });

  if (!mapped.has("status") && existing.status) {
    merged.status = existing.status;
    merged.stage = stageForStatus(existing.status);
  } else {
    merged.stage = stageForStatus(merged.status);
  }

  return merged;
}

async function parseImportFile(file) {
  if (!window.XLSX) throw new Error("Biblioteca de planilhas não carregada.");
  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  const sheetName = workbookSheetName(workbook, normalizeText(els.importSheet.value));
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error("Aba da planilha não encontrada.");
  const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true });
  const header = findHeaderRow(rows);
  if (header.index < 0 || header.score < 4) {
    throw new Error("Não foi possível identificar os cabeçalhos. Use o modelo CSV fornecido no painel.");
  }
  if (!Number.isInteger(header.map.supplier)) {
    throw new Error("A coluna FORNECEDOR é obrigatória.");
  }
  if (!["nup", "contractPag", "commitmentPo", "invoiceNumber"].some(field => Number.isInteger(header.map[field]))) {
    throw new Error("Inclua ao menos uma coluna de identificação: NUP, Contrato/PAG, Empenho/PO ou Fatura/Invoice.");
  }

  const referenceDate = els.importReferenceDate.value || CURRENT_DATE;
  els.importReferenceDate.value = referenceDate;
  els.importSheet.value = sheetName;
  const accepted = [];
  const rejected = [];
  let ignored = 0;

  for (let index = header.index + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (!row.some(value => normalizeText(value))) {
      ignored += 1;
      continue;
    }
    const normalized = await normalizeImportedPayment(row, header.map, {
      fileName: file.name,
      sheetName,
      sourceRow: index + 1,
      referenceDate
    });
    if (normalized.errors.length) {
      rejected.push({ sourceRow: index + 1, errors: normalized.errors, supplier: normalized.payment.supplier || "" });
    } else {
      accepted.push(normalized.payment);
    }
  }

  const deduplicated = new Map();
  let duplicatesInFile = 0;
  accepted.forEach(record => {
    if (deduplicated.has(record.id)) duplicatesInFile += 1;
    deduplicated.set(record.id, record);
  });
  const existingMap = new Map(state.records.map(record => [record.id, record]));
  const mappedFields = Object.keys(header.map);
  const records = Array.from(deduplicated.values()).map(record =>
    mergeImportedWithExisting(record, existingMap.get(record.id), mappedFields)
  );
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  records.forEach(record => {
    const existing = existingMap.get(record.id);
    if (!existing) newCount += 1;
    else if (importedPaymentEqual(existing, record)) unchangedCount += 1;
    else updatedCount += 1;
  });

  const warningCount = records.reduce((total, record) => total + (record.qualityWarnings?.length || 0), 0);
  return {
    fileName: file.name,
    sheetName,
    referenceDate,
    headerRow: header.index + 1,
    mappedFields: Object.keys(header.map),
    records,
    rejected,
    ignored,
    duplicatesInFile,
    newCount,
    updatedCount,
    unchangedCount,
    warningCount
  };
}

async function previewImport() {
  if (!state.isAdmin) return;
  const file = els.importFile.files?.[0];
  if (!file) {
    setMessage(els.importMessage, "Selecione um arquivo.", "error");
    return;
  }
  els.importPreviewButton.disabled = true;
  setMessage(els.importMessage, "Analisando a planilha...", "info");
  try {
    state.importPreview = await parseImportFile(file);
    renderImportPreview();
    setMessage(els.importMessage, "Prévia concluída. Confira os resultados antes de confirmar.", "success");
  } catch (error) {
    console.error(error);
    state.importPreview = null;
    renderImportPreview();
    setMessage(els.importMessage, error.message || "Não foi possível analisar o arquivo.", "error");
  } finally {
    els.importPreviewButton.disabled = false;
  }
}

function renderImportPreview() {
  const preview = state.importPreview;
  els.importPreview.hidden = !preview;
  els.importCommitButton.disabled = !preview || !preview.records.length;
  if (!preview) {
    els.previewGrid.innerHTML = "";
    els.previewWarnings.innerHTML = "";
    els.previewRejected.innerHTML = "";
    return;
  }
  const cards = [
    ["Linhas válidas", preview.records.length],
    ["Novos registros", preview.newCount],
    ["Registros alterados", preview.updatedCount],
    ["Sem alteração", preview.unchangedCount],
    ["Rejeitadas", preview.rejected.length],
    ["Duplicadas no arquivo", preview.duplicatesInFile],
    ["Linhas vazias ignoradas", preview.ignored],
    ["Avisos de qualidade", preview.warningCount]
  ];
  els.previewGrid.innerHTML = cards.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${formatInteger(value)}</strong></article>`).join("");

  const warningMap = new Map();
  preview.records.forEach(record => (record.qualityWarnings || []).forEach(warning => {
    warningMap.set(warning, (warningMap.get(warning) || 0) + 1);
  }));
  els.previewWarnings.innerHTML = warningMap.size
    ? `<ul>${Array.from(warningMap.entries()).map(([warning, count]) => `<li>${escapeHtml(warning)}: ${formatInteger(count)}</li>`).join("")}</ul>`
    : "<p>Nenhum aviso relevante.</p>";

  els.previewRejected.innerHTML = preview.rejected.length
    ? `<ul>${preview.rejected.slice(0, 15).map(item => `<li>Linha ${item.sourceRow}: ${escapeHtml(item.errors.join("; "))}</li>`).join("")}${preview.rejected.length > 15 ? `<li>... e mais ${preview.rejected.length - 15} linha(s).</li>` : ""}</ul>`
    : "<p>Nenhuma linha rejeitada.</p>";
}

async function commitImport() {
  const preview = state.importPreview;
  if (!state.isAdmin || !state.user || !preview?.records.length) return;
  els.importCommitButton.disabled = true;
  setMessage(els.importMessage, "Gravando a importação no Firestore...", "info");
  const batchId = `payments-${preview.referenceDate}-${Date.now()}`;
  try {
    for (let offset = 0; offset < preview.records.length; offset += MAX_BATCH_WRITES) {
      const chunk = preview.records.slice(offset, offset + MAX_BATCH_WRITES);
      const batch = writeBatch(db);
      chunk.forEach(record => {
        const existing = state.records.find(item => item.id === record.id);
        const payload = {
          ...record,
          archived: false,
          importBatchId: batchId,
          lastSeenBatchId: batchId,
          importedAt: serverTimestamp(),
          importedBy: state.user.uid,
          importedByName: state.user.displayName || state.user.email || "",
          updatedAt: serverTimestamp(),
          updatedBy: state.user.uid,
          updatedByName: state.user.displayName || state.user.email || ""
        };
        if (!existing) {
          payload.createdAt = serverTimestamp();
          payload.createdBy = state.user.uid;
          payload.createdByName = state.user.displayName || state.user.email || "";
        }
        batch.set(doc(db, COLLECTION_NAME, record.id), payload, { merge: true });
      });
      await batch.commit();
    }

    const configPayload = {
      activeBatchId: batchId,
      buildVersion: BUILD_VERSION,
      sourceFileName: preview.fileName,
      sourceSheet: preview.sheetName,
      referenceDate: preview.referenceDate,
      validRows: preview.records.length,
      rejectedRows: preview.rejected.length,
      newCount: preview.newCount,
      updatedCount: preview.updatedCount,
      unchangedCount: preview.unchangedCount,
      importedAt: serverTimestamp(),
      importedBy: state.user.uid,
      importedByName: state.user.displayName || state.user.email || ""
    };
    await setDoc(doc(db, "supplierPaymentsConfig", "current"), configPayload, { merge: true });
    await setDoc(doc(collection(db, IMPORT_COLLECTION)), configPayload, { merge: true });
    await logAction("Base de pagamentos importada", `${preview.fileName} · ${preview.records.length} registros válidos`);

    setMessage(els.importMessage, `Importação concluída: ${formatInteger(preview.records.length)} registro(s) processado(s), sem exclusão automática de históricos.`, "success");
    state.importPreview = null;
    els.importFile.value = "";
    renderImportPreview();
    await loadImportHistory();
  } catch (error) {
    console.error(error);
    setMessage(els.importMessage, error.code === "permission-denied"
      ? "Importação negada. Publique as regras de pagamentos fornecidas no pacote."
      : `Falha na importação: ${error.message || error.code || "erro desconhecido"}.`, "error");
  } finally {
    els.importCommitButton.disabled = !state.importPreview;
  }
}

async function loadImportHistory() {
  if (!state.isAdmin) {
    state.importHistory = [];
    renderImportHistory();
    return;
  }
  try {
    const snapshot = await getDocs(query(collection(db, IMPORT_COLLECTION), orderBy("importedAt", "desc"), limit(8)));
    state.importHistory = snapshot.docs.map(recordFromSnapshot);
  } catch (error) {
    state.importHistory = [];
  }
  renderImportHistory();
}

function renderImportHistory() {
  if (!els.importHistory) return;
  els.importHistory.innerHTML = state.importHistory.length
    ? state.importHistory.map(item => `<article class="pay-import-history-item">
        <div><strong>${escapeHtml(displayText(item.sourceFileName))}</strong><span>${escapeHtml(formatDate(item.referenceDate))} · ${escapeHtml(formatDateTime(item.importedAt))}</span></div>
        <small>${formatInteger(item.validRows)} válido(s) · ${formatInteger(item.newCount)} novo(s) · ${formatInteger(item.updatedCount)} atualizado(s)</small>
      </article>`).join("")
    : '<p class="pay-empty-message">Nenhuma importação registrada.</p>';
}

function downloadTemplate() {
  const content = `\ufeff${PAYMENT_IMPORT_HEADERS.join(";")}\r\n`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "MODELO_IMPORTACAO_PAGAMENTOS_CABW.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function filtersDescription() {
  const parts = [];
  const pairs = [
    ["Fornecedor", selectValue(els.supplierFilter)],
    ["Status", selectValue(els.statusFilter)],
    ["Etapa", selectValue(els.stageFilter)],
    ["Prazo", els.deadlineFilter?.selectedOptions?.[0]?.textContent && selectValue(els.deadlineFilter) ? els.deadlineFilter.selectedOptions[0].textContent : ""],
    ["Moeda", selectValue(els.currencyFilter)],
    ["Unidade", selectValue(els.unitFilter)],
    ["Data inicial", formatDate(selectValue(els.dateFromFilter))],
    ["Data final", formatDate(selectValue(els.dateToFilter))],
    ["Busca", normalizeText(els.searchFilter?.value)]
  ];
  pairs.forEach(([label, value]) => {
    if (value && value !== "Não informado") parts.push(`${label}: ${value}`);
  });
  return parts.length ? parts.join(" · ") : "Sem filtros específicos";
}

function pdfHeader(pdf, title, subtitle = "") {
  pdf.setFillColor(0, 38, 95);
  pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 25, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("PAINEL CABW", 14, 11);
  pdf.setFontSize(11);
  pdf.text(title, 14, 19);
  pdf.setTextColor(6, 38, 91);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(`Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`, 14, 31);
  if (subtitle) {
    const lines = pdf.splitTextToSize(subtitle, pdf.internal.pageSize.getWidth() - 28);
    pdf.text(lines, 14, 36);
    return 36 + lines.length * 4;
  }
  return 36;
}

function autoTableDefaults() {
  return {
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2, textColor: [6, 38, 91] },
    headStyles: { fillColor: [0, 54, 118], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 247, 251] },
    margin: { left: 14, right: 14 }
  };
}

function ensurePdfAvailable() {
  return Boolean(window.jspdf?.jsPDF);
}

function generateManagementPdf() {
  if (!ensurePdfAvailable()) {
    setMessage(els.reportMessage, "Biblioteca de PDF não carregada.", "error");
    return;
  }
  if (!state.filtered.length) {
    setMessage(els.reportMessage, "A consulta não possui registros para o relatório.", "error");
    return;
  }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = pdfHeader(pdf, "RELATÓRIO GERENCIAL DE PAGAMENTOS", filtersDescription());
  const records = state.filtered;
  const paid = records.filter(isPaid);
  const overdue = records.filter(record => classifyPaymentDeadline(record, CURRENT_DATE).code === "overdue");
  const dueSoon = records.filter(record => ["due-today", "due-7"].includes(classifyPaymentDeadline(record, CURRENT_DATE).code));

  pdf.autoTable({
    ...autoTableDefaults(),
    startY: y + 4,
    head: [["Registros", "Fornecedores", "Pagos", "Vencidos não pagos", "Vencem até 7 dias"]],
    body: [[
      formatInteger(records.length),
      formatInteger(new Set(records.map(record => record.supplier)).size),
      formatInteger(paid.length),
      formatInteger(overdue.length),
      formatInteger(dueSoon.length)
    ]]
  });

  const statusCounts = CounterLike(records.map(record => record.status));
  pdf.autoTable({
    ...autoTableDefaults(),
    startY: pdf.lastAutoTable.finalY + 6,
    head: [["Status", "Quantidade"]],
    body: statusCounts.map(item => [item.label, formatInteger(item.count)]),
    tableWidth: 105
  });

  const deadlineCounts = CounterLike(records.map(record => classifyPaymentDeadline(record, CURRENT_DATE).label));
  pdf.autoTable({
    ...autoTableDefaults(),
    startY: pdf.lastAutoTable.finalY + 6,
    head: [["Situação do prazo", "Quantidade"]],
    body: deadlineCounts.map(item => [item.label, formatInteger(item.count)]),
    tableWidth: 135
  });

  const currencyRows = [];
  const currencies = uniqueSorted(records.map(record => record.currency || "SEM MOEDA"));
  currencies.forEach(currency => {
    const scoped = records.filter(record => (record.currency || "SEM MOEDA") === currency);
    currencyRows.push([
      currency,
      formatMoney(scoped.reduce((sum, record) => sum + Number(record.netAmount || 0), 0), currency),
      formatMoney(scoped.filter(isPaid).reduce((sum, record) => sum + Number(record.netAmount || 0), 0), currency),
      formatMoney(scoped.filter(record => !isPaid(record) && !isCancelled(record)).reduce((sum, record) => sum + Number(record.netAmount || 0), 0), currency)
    ]);
  });
  pdf.autoTable({
    ...autoTableDefaults(),
    startY: pdf.lastAutoTable.finalY + 6,
    head: [["Moeda", "Valor líquido", "Pago", "Pendente"]],
    body: currencyRows
  });

  const suppliers = supplierSummary(records);
  if (suppliers.length) {
    pdf.autoTable({
      ...autoTableDefaults(),
      startY: pdf.lastAutoTable.finalY + 6,
      head: [["Fornecedor", "Faturas pendentes", "Moeda", "Valor pendente", "Vencidas"]],
      body: suppliers.map(item => [item.supplier, formatInteger(item.count), item.currency, formatMoney(item.amount, item.currency), formatInteger(item.overdue)])
    });
  }

  const totalPages = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(7);
    pdf.setTextColor(90, 100, 118);
    pdf.text(`Página ${page} de ${totalPages}`, pdf.internal.pageSize.getWidth() - 30, pdf.internal.pageSize.getHeight() - 7);
  }
  pdf.save(`CABW_Pagamentos_Gerencial_${CURRENT_DATE.replaceAll("-", "")}.pdf`);
  setMessage(els.reportMessage, "Relatório gerencial gerado.", "success");
}

function CounterLike(values) {
  const map = new Map();
  values.forEach(value => {
    const label = displayText(value);
    map.set(label, (map.get(label) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

function generateDetailedPdf() {
  if (!ensurePdfAvailable()) {
    setMessage(els.reportMessage, "Biblioteca de PDF não carregada.", "error");
    return;
  }
  if (!state.filtered.length) {
    setMessage(els.reportMessage, "A consulta não possui registros para o relatório.", "error");
    return;
  }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const y = pdfHeader(pdf, "RELATÓRIO DETALHADO DE PAGAMENTOS", filtersDescription());
  const headers = [[
    "Prazo", "Status", "Fornecedor", "Fatura/Invoice", "NUP", "Contrato/PAG", "Empenho/PO", "Unidade",
    "Moeda", "Bruto", "Retenções", "Líquido", "Emissão", "Recebimento", "Vencimento", "Previsão", "Pagamento", "Responsável", "Referência", "Observações"
  ]];
  const body = state.filtered.map(record => [
    classifyPaymentDeadline(record, CURRENT_DATE).label,
    record.status,
    record.supplier,
    record.invoiceNumber || "—",
    record.nup || "—",
    record.contractPag || "—",
    record.commitmentPo || "—",
    record.requestingUnit || "—",
    record.currency || "—",
    formatMoney(record.grossAmount, record.currency || ""),
    formatMoney(record.deductions, record.currency || ""),
    formatMoney(record.netAmount, record.currency || ""),
    formatDate(record.issueDate),
    formatDate(record.receivedDate),
    formatDate(record.dueDate),
    formatDate(record.scheduledDate),
    formatDate(record.paidDate),
    record.responsible || "—",
    record.paymentReference || "—",
    record.observations || "—"
  ]);
  pdf.autoTable({
    ...autoTableDefaults(),
    startY: y + 4,
    head: headers,
    body,
    styles: { fontSize: 5.7, cellPadding: 1.4, overflow: "linebreak", textColor: [6, 38, 91] },
    headStyles: { fillColor: [0, 54, 118], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 5.8 },
    columnStyles: {
      0: { cellWidth: 25 }, 1: { cellWidth: 26 }, 2: { cellWidth: 35 }, 3: { cellWidth: 24 }, 4: { cellWidth: 34 },
      5: { cellWidth: 27 }, 6: { cellWidth: 25 }, 7: { cellWidth: 24 }, 8: { cellWidth: 13 }, 9: { cellWidth: 22 },
      10: { cellWidth: 20 }, 11: { cellWidth: 22 }, 12: { cellWidth: 18 }, 13: { cellWidth: 18 }, 14: { cellWidth: 18 },
      15: { cellWidth: 18 }, 16: { cellWidth: 18 }, 17: { cellWidth: 26 }, 18: { cellWidth: 30 }, 19: { cellWidth: 45 }
    },
    didDrawPage: data => {
      pdf.setFontSize(7);
      pdf.setTextColor(90, 100, 118);
      pdf.text(`Página ${data.pageNumber}`, pdf.internal.pageSize.getWidth() - 25, pdf.internal.pageSize.getHeight() - 7);
    }
  });
  pdf.save(`CABW_Pagamentos_Detalhado_${CURRENT_DATE.replaceAll("-", "")}.pdf`);
  setMessage(els.reportMessage, "Relatório detalhado gerado.", "success");
}

function clearFilters() {
  [els.supplierFilter, els.statusFilter, els.stageFilter, els.deadlineFilter, els.currencyFilter, els.unitFilter].forEach(element => {
    if (element) element.value = "";
  });
  els.dateFieldFilter.value = "dueDate";
  els.dateFromFilter.value = "";
  els.dateToFilter.value = "";
  els.searchFilter.value = "";
  els.sortFilter.value = "deadline";
  if (els.includeArchived) els.includeArchived.checked = false;
  applyFilters();
}

function bindFilters() {
  [
    els.supplierFilter,
    els.statusFilter,
    els.stageFilter,
    els.deadlineFilter,
    els.currencyFilter,
    els.unitFilter,
    els.dateFieldFilter,
    els.dateFromFilter,
    els.dateToFilter,
    els.sortFilter,
    els.includeArchived
  ].forEach(element => element?.addEventListener("change", applyFilters));
  els.searchFilter?.addEventListener("input", applyFilters);
  els.clearFilters?.addEventListener("click", clearFilters);
}

function closeDialog(id) {
  const dialog = byId(id);
  if (dialog?.open) dialog.close();
}

function bindDialogs() {
  document.querySelectorAll("[data-close-dialog]").forEach(button => {
    button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
  });
  [els.detailDialog, els.formDialog].forEach(dialog => {
    dialog?.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
  });
  els.detailEdit?.addEventListener("click", () => {
    const id = els.detailEdit.dataset.editPayment;
    els.detailDialog.close();
    openForm(id);
  });
}

function subscribeToFirestore() {
  state.subscriptions.forEach(unsubscribe => unsubscribe());
  state.subscriptions = [];
  state.firestoreError = null;

  state.subscriptions.push(onSnapshot(
    doc(db, "supplierPaymentsConfig", "current"),
    snapshot => {
      state.config = snapshot.exists() ? snapshot.data() : null;
      renderSource();
    },
    error => {
      state.firestoreError = error;
      renderSource();
    }
  ));

  state.subscriptions.push(onSnapshot(
    collection(db, COLLECTION_NAME),
    snapshot => {
      state.records = snapshot.docs.map(recordFromSnapshot);
      populateFilters();
      applyFilters();
    },
    error => {
      console.error("Falha ao carregar pagamentos.", error);
      state.firestoreError = error;
      state.records = [];
      populateFilters();
      applyFilters();
    }
  ));
}

function cacheElements() {
  Object.assign(els, {
    sourceTitle: byId("paySourceTitle"),
    sourceInfo: byId("paySourceInfo"),
    importToggle: byId("payImportToggle"),
    newButton: byId("payNewButton"),
    templateButton: byId("payTemplateButton"),
    importPanel: byId("payImportPanel"),
    importFile: byId("payImportFile"),
    importReferenceDate: byId("payImportReferenceDate"),
    importSheet: byId("payImportSheet"),
    importPreviewButton: byId("payImportPreviewButton"),
    importCommitButton: byId("payImportCommitButton"),
    importCloseButton: byId("payImportCloseButton"),
    importMessage: byId("payImportMessage"),
    importPreview: byId("payImportPreview"),
    previewGrid: byId("payPreviewGrid"),
    previewWarnings: byId("payPreviewWarnings"),
    previewRejected: byId("payPreviewRejected"),
    importHistory: byId("payImportHistory"),
    supplierFilter: byId("paySupplierFilter"),
    statusFilter: byId("payStatusFilter"),
    stageFilter: byId("payStageFilter"),
    deadlineFilter: byId("payDeadlineFilter"),
    currencyFilter: byId("payCurrencyFilter"),
    unitFilter: byId("payUnitFilter"),
    dateFieldFilter: byId("payDateFieldFilter"),
    dateFromFilter: byId("payDateFromFilter"),
    dateToFilter: byId("payDateToFilter"),
    sortFilter: byId("paySortFilter"),
    searchFilter: byId("paySearchFilter"),
    includeArchived: byId("payIncludeArchived"),
    clearFilters: byId("payClearFilters"),
    managementPdf: byId("payManagementPdf"),
    detailedPdf: byId("payDetailedPdf"),
    reportMessage: byId("payReportMessage"),
    kpiTotal: byId("payKpiTotal"),
    kpiSuppliers: byId("payKpiSuppliers"),
    kpiProcessing: byId("payKpiProcessing"),
    kpiAwaiting: byId("payKpiAwaiting"),
    kpiOverdue: byId("payKpiOverdue"),
    kpiDueSoon: byId("payKpiDueSoon"),
    kpiPaid: byId("payKpiPaid"),
    kpiPaidRate: byId("payKpiPaidRate"),
    kpiPendingAmount: byId("payKpiPendingAmount"),
    kpiPaidAmount: byId("payKpiPaidAmount"),
    flowGrid: byId("payFlowGrid"),
    resultsInfo: byId("payResultsInfo"),
    supplierSummaryBody: byId("paySupplierSummaryBody"),
    currencySummaryBody: byId("payCurrencySummaryBody"),
    rowsInfo: byId("payRowsInfo"),
    emptyState: byId("payEmptyState"),
    tableWrap: byId("payTableWrap"),
    detailBody: byId("payDetailBody"),
    mobileList: byId("payMobileList"),
    detailDialog: byId("payDetailDialog"),
    detailTitle: byId("payDetailTitle"),
    detailContent: byId("payDetailContent"),
    detailEdit: byId("payDetailEdit"),
    formDialog: byId("payFormDialog"),
    form: byId("payForm"),
    formTitle: byId("payFormTitle"),
    formId: byId("payFormId"),
    formSupplier: byId("payFormSupplier"),
    formNup: byId("payFormNup"),
    formContractPag: byId("payFormContractPag"),
    formCommitmentPo: byId("payFormCommitmentPo"),
    formInvoice: byId("payFormInvoice"),
    formDocumentType: byId("payFormDocumentType"),
    formCurrency: byId("payFormCurrency"),
    formGross: byId("payFormGross"),
    formDeductions: byId("payFormDeductions"),
    formNet: byId("payFormNet"),
    formIssueDate: byId("payFormIssueDate"),
    formReceivedDate: byId("payFormReceivedDate"),
    formDueDate: byId("payFormDueDate"),
    formScheduledDate: byId("payFormScheduledDate"),
    formPaidDate: byId("payFormPaidDate"),
    formStatus: byId("payFormStatus"),
    formUnit: byId("payFormUnit"),
    formResponsible: byId("payFormResponsible"),
    formReference: byId("payFormReference"),
    formObservations: byId("payFormObservations"),
    formMessage: byId("payFormMessage"),
    formSave: byId("payFormSave")
  });
}

function initializeStaticOptions() {
  els.deadlineFilter.innerHTML = DEADLINE_OPTIONS.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
  els.formStatus.innerHTML = PAYMENT_STATUSES.map(status => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("");
  els.importReferenceDate.value = CURRENT_DATE;
}

function bindActions() {
  bindFilters();
  bindDialogs();
  els.importToggle?.addEventListener("click", async () => {
    els.importPanel.hidden = !els.importPanel.hidden;
    if (!els.importPanel.hidden) await loadImportHistory();
  });
  els.importCloseButton?.addEventListener("click", () => { els.importPanel.hidden = true; });
  els.newButton?.addEventListener("click", () => openForm());
  els.templateButton?.addEventListener("click", downloadTemplate);
  els.importPreviewButton?.addEventListener("click", previewImport);
  els.importCommitButton?.addEventListener("click", commitImport);
  els.managementPdf?.addEventListener("click", generateManagementPdf);
  els.detailedPdf?.addEventListener("click", generateDetailedPdf);
  els.form?.addEventListener("submit", saveForm);
  els.formPaidDate?.addEventListener("change", () => {
    if (els.formPaidDate.value) els.formStatus.value = "Pago";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  initializeStaticOptions();
  bindActions();
  populateFilters();
  applyFilters();

  onAuthStateChanged(auth, async user => {
    state.user = user || null;
    state.isAdmin = await checkAdmin(user);
    showAdminElements();
    if (user) {
      subscribeToFirestore();
      if (state.isAdmin) await loadImportHistory();
    } else {
      state.subscriptions.forEach(unsubscribe => unsubscribe());
      state.subscriptions = [];
      state.records = [];
      state.config = null;
      populateFilters();
      applyFilters();
    }
  });
});
