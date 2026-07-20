import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, onSnapshot, query, orderBy, limit,
  writeBatch, setDoc, deleteDoc, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  REQUIRED_HEADERS, IMPORTED_FIELDS, normalizeNullable, normalizeIdentifier, normalizeHeader,
  normalizeSearch, parseFlexibleNumber, parseDateToIso, mapVisualStage, deriveOriginOm,
  normalizeEvaluationFee, calculateTdrStatus, calculateReturnDeadline, stableKeySource,
  sha256Hex, importedDataEqual, contextualServiceDateLabel, moneyDisplay, textDisplay
} from "./repair-import-core.js";
import { BUNDLED_REPAIR_DATA } from "./repair-processes-current-data.js";

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
const CONFIG_DOC = "repairProcessesConfig/current";
const IMPORT_COLLECTION = "repairProcessImports";
const MAX_ATOMIC_RECORDS = 450;
const SOURCE_SHEET = "BD Monitoramento";
const TODAY_ISO = localTodayIso();
const fmtInteger = new Intl.NumberFormat("pt-BR");
const fmtDateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const FLOW_STEPS = [
  { code: "brazil", label: "Brasil / OM", icon: "bi-building", stages: ["Brasil / OM"] },
  { code: "to-cabw", label: "Trânsito ao exterior", icon: "bi-airplane", stages: ["Trânsito ao exterior"] },
  { code: "cabw", label: "CABW / Washington", icon: "bi-geo-alt", stages: ["CABW / Washington"] },
  { code: "to-shop", label: "Trânsito à oficina", icon: "bi-truck", stages: ["Trânsito à oficina"] },
  { code: "shop", label: "Oficina reparadora", icon: "bi-tools", stages: ["Oficina reparadora"] },
  { code: "return", label: "Fluxo de retorno", icon: "bi-arrow-return-left", stages: ["Fluxo de retorno"] },
  { code: "delivered", label: "Entregue à OM", icon: "bi-check2-circle", stages: ["Entregue à OM"] },
  { code: "unmapped", label: "Etapa não mapeada", icon: "bi-question-circle", stages: ["Etapa não mapeada"] }
];

const state = {
  user: null,
  isAdmin: false,
  firestoreRecords: [],
  config: null,
  records: [],
  absentRecords: [],
  filtered: [],
  sourceMode: "bundle",
  flowGroup: "",
  importPreview: null,
  importHistory: [],
  subscriptions: [],
  firestoreError: null
};

const els = {};
const $ = id => document.getElementById(id);

function localTodayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[char]));
}

function formatDate(value) {
  const iso = normalizeNullable(value);
  if (!iso) return "Não informado";
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
}

function toJsDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = toJsDate(value);
  return date ? fmtDateTime.format(date) : "Não informado";
}

function referenceDate() {
  return state.config?.referenceDate || BUNDLED_REPAIR_DATA.metadata.referenceDate || TODAY_ISO;
}

function derived(record) {
  const visualStage = mapVisualStage(record.realStatus);
  const tdr = calculateTdrStatus(record.receivedAtRepairerDate, record.tdrSentDate, TODAY_ISO);
  const deadline = calculateReturnDeadline(record, TODAY_ISO);
  return { visualStage, tdr, deadline };
}

function recordFromSnapshot(snapshot) {
  return { id: snapshot.id, ...(snapshot.data() || {}) };
}

function currentFirestoreRecords() {
  if (!state.firestoreRecords.length) return [];
  const activeBatchId = state.config?.activeBatchId;
  if (!activeBatchId) return state.firestoreRecords.filter(record => record.po && record.requisition && record.partNumber && record.serialNumber);
  return state.firestoreRecords.filter(record => record.lastSeenBatchId === activeBatchId || record.manualOnly === true);
}

function rebuildRecordSet() {
  const current = currentFirestoreRecords();
  if (current.length) {
    state.sourceMode = "firestore";
    state.records = current;
    const currentIds = new Set(current.map(record => record.id));
    state.absentRecords = state.firestoreRecords.filter(record => !currentIds.has(record.id));
  } else {
    state.sourceMode = "bundle";
    state.records = BUNDLED_REPAIR_DATA.records.map(record => ({ ...record }));
    state.absentRecords = state.firestoreRecords.slice();
  }
  populateFilters();
  applyFilters();
  renderSource();
}

function renderSource() {
  if (!els.source) return;
  if (state.sourceMode === "firestore") {
    const file = state.config?.sourceFileName || "Fonte não informada";
    const batch = state.config?.activeBatchId || "sem lote ativo";
    const when = state.config?.importedAt ? formatDateTime(state.config.importedAt) : "data não informada";
    els.source.textContent = `Fonte: Firestore · ${file} · aba ${state.config?.sourceSheet || SOURCE_SHEET} · lote ${batch} · importado em ${when}`;
    els.source.classList.remove("rep-source-error");
  } else {
    els.source.textContent = `Fonte local inicial: ${BUNDLED_REPAIR_DATA.metadata.sourceFileName} · ${fmtInteger.format(BUNDLED_REPAIR_DATA.metadata.validRows)} registros válidos. Administradores podem importar a planilha para centralizar a base no Firestore.`;
    els.source.classList.toggle("rep-source-error", Boolean(state.firestoreError));
  }
}

function uniqueValues(field, derivedField = false) {
  return Array.from(new Set(state.records.map(record => derivedField ? derived(record)[field] : record[field]).filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true }));
}

function fillSelect(select, values, placeholder) {
  if (!select) return;
  const previous = select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (values.includes(previous)) select.value = previous;
}

function populateFilters() {
  fillSelect(els.statusFilter, uniqueValues("realStatus"), "Todos os status");
  fillSelect(els.stageFilter, uniqueValues("visualStage", true), "Todas as etapas");
  fillSelect(els.originFilter, uniqueValues("originOm"), "Todas as OMs");
  fillSelect(els.repairerFilter, uniqueValues("repairerName"), "Todos os reparadores");
  fillSelect(els.conditionFilter, uniqueValues("condition"), "Todas as condições");
  fillSelect(els.cageFilter, uniqueValues("repairerCage"), "Todos os CAGE Codes");
}

function readFilters() {
  return {
    po: normalizeSearch(els.poFilter.value),
    requisition: normalizeSearch(els.requisitionFilter.value),
    status: els.statusFilter.value,
    stage: els.stageFilter.value,
    origin: els.originFilter.value,
    repairer: els.repairerFilter.value,
    condition: els.conditionFilter.value,
    evaluationFee: els.evaluationFeeFilter.value,
    tdr: els.tdrFilter.value,
    cage: els.cageFilter.value,
    deadline: els.deadlineFilter.value,
    search: normalizeSearch(els.search.value),
    sort: els.sort.value,
    includeAbsent: els.includeAbsent.checked
  };
}

function searchableText(record) {
  return normalizeSearch([
    record.po, record.requisition, record.partNumber, record.serialNumber, record.originOm,
    record.trackingToRepairer, record.returnTrackingVolume, record.repairerCage, record.repairerName,
    record.realStatus, record.condition, record.processNumber, record.description, record.manualNotes
  ].join(" "));
}

function applyFilters() {
  const filters = readFilters();
  const base = filters.includeAbsent ? [...state.records, ...state.absentRecords] : state.records.slice();
  let records = base.filter(record => {
    const info = derived(record);
    if (filters.po && !normalizeSearch(record.po).includes(filters.po)) return false;
    if (filters.requisition && !normalizeSearch(record.requisition).includes(filters.requisition)) return false;
    if (filters.status && record.realStatus !== filters.status) return false;
    if (filters.stage && info.visualStage !== filters.stage) return false;
    if (filters.origin && record.originOm !== filters.origin) return false;
    if (filters.repairer && record.repairerName !== filters.repairer) return false;
    if (filters.condition && record.condition !== filters.condition) return false;
    if (filters.cage && record.repairerCage !== filters.cage) return false;
    if (filters.evaluationFee === "informed" && record.evaluationFee == null) return false;
    if (filters.evaluationFee === "missing" && record.evaluationFee != null) return false;
    if (filters.tdr && info.tdr.code !== filters.tdr) return false;
    if (filters.deadline && info.deadline.code !== filters.deadline) return false;
    if (filters.search && !searchableText(record).includes(filters.search)) return false;
    if (state.flowGroup) {
      const step = FLOW_STEPS.find(item => item.code === state.flowGroup);
      if (step && !step.stages.includes(info.visualStage)) return false;
    }
    return true;
  });

  records.sort((a, b) => {
    const da = derived(a); const dbi = derived(b);
    if (filters.sort === "dpe") return (a.dpeFinalDate || "9999-12-31").localeCompare(b.dpeFinalDate || "9999-12-31");
    if (filters.sort === "tdr") return (da.tdr.dueDate || "9999-12-31").localeCompare(dbi.tdr.dueDate || "9999-12-31");
    if (filters.sort === "po") return String(a.po || "").localeCompare(String(b.po || ""), "pt-BR", { numeric: true });
    if (filters.sort === "requisition") return String(a.requisition || "").localeCompare(String(b.requisition || ""), "pt-BR", { numeric: true });
    if (filters.sort === "repairer") return String(a.repairerName || "").localeCompare(String(b.repairerName || ""), "pt-BR");
    const aDate = toJsDate(a.updatedAt || a.importedAt) || new Date(0);
    const bDate = toJsDate(b.updatedAt || b.importedAt) || new Date(0);
    return bDate - aDate || Number(a.sourceRow || 0) - Number(b.sourceRow || 0);
  });

  state.filtered = records;
  renderAll();
}

function clearFilters() {
  [els.poFilter, els.requisitionFilter, els.search].forEach(element => { element.value = ""; });
  [els.statusFilter, els.stageFilter, els.originFilter, els.repairerFilter, els.conditionFilter, els.evaluationFeeFilter, els.tdrFilter, els.cageFilter, els.deadlineFilter].forEach(element => { element.value = ""; });
  els.sort.value = "updated";
  els.includeAbsent.checked = false;
  state.flowGroup = "";
  applyFilters();
}

function aggregateMoney(records, field) {
  const known = records.filter(record => record[field] !== null && record[field] !== undefined && Number.isFinite(Number(record[field])));
  if (!known.length) return { value: "Não informado", note: `0 de ${records.length} itens com valor informado` };
  const totals = new Map();
  known.forEach(record => {
    const currency = record.currency || "Moeda não informada";
    totals.set(currency, (totals.get(currency) || 0) + Number(record[field]));
  });
  const value = Array.from(totals.entries()).map(([currency, total]) => currency === "Moeda não informada"
    ? `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total)} — Moeda não informada`
    : moneyDisplay(total, currency)).join(" / ");
  return { value, note: known.length === records.length ? "total dos itens filtrados" : `Total parcial — ${known.length} de ${records.length} itens com valor informado` };
}

function renderKpis() {
  const records = state.filtered;
  const enriched = records.map(record => ({ record, ...derived(record) }));
  const itemValue = aggregateMoney(records, "itemValue");
  const repairValue = aggregateMoney(records, "repairValue");
  els.kpiTotal.textContent = fmtInteger.format(records.length);
  els.kpiRepair.textContent = fmtInteger.format(enriched.filter(item => item.visualStage === "Oficina reparadora").length);
  els.kpiTransit.textContent = fmtInteger.format(enriched.filter(item => ["Trânsito ao exterior", "Trânsito à oficina", "Fluxo de retorno"].includes(item.visualStage)).length);
  els.kpiOverdue.textContent = fmtInteger.format(enriched.filter(item => item.deadline.code === "overdue").length);
  els.kpiCompleted.textContent = fmtInteger.format(enriched.filter(item => item.visualStage === "Entregue à OM").length);
  els.kpiTdr.textContent = fmtInteger.format(enriched.filter(item => ["overdue", "due-soon"].includes(item.tdr.code)).length);
  els.kpiItemValue.textContent = itemValue.value;
  els.kpiItemValueNote.textContent = itemValue.note;
  els.kpiRepairValue.textContent = repairValue.value;
  els.kpiRepairValueNote.textContent = repairValue.note;
  els.results.textContent = `${fmtInteger.format(records.length)} item(ns) exibido(s)`;
  els.tableCount.textContent = `${fmtInteger.format(records.length)} registro(s)`;
}

function renderFlow() {
  const counts = new Map(FLOW_STEPS.map(step => [step.code, 0]));
  state.filtered.forEach(record => {
    const stage = derived(record).visualStage;
    const step = FLOW_STEPS.find(item => item.stages.includes(stage));
    if (step) counts.set(step.code, (counts.get(step.code) || 0) + 1);
  });
  els.flowGrid.innerHTML = FLOW_STEPS.map((step, index) => {
    const active = state.flowGroup === step.code ? " is-active" : "";
    const connector = index < FLOW_STEPS.length - 1 ? '<span class="rep-flow-connector"><i class="bi bi-chevron-right"></i></span>' : "";
    return `<button type="button" class="rep-flow-step${active}" data-flow="${step.code}">
      <span class="rep-flow-step__icon"><i class="bi ${step.icon}"></i></span>
      <strong>${escapeHtml(step.label)}</strong><span>${fmtInteger.format(counts.get(step.code) || 0)} item(ns)</span>
    </button>${connector}`;
  }).join("");
  els.clearFlow.hidden = !state.flowGroup;
  els.flowGrid.querySelectorAll("[data-flow]").forEach(button => button.addEventListener("click", () => {
    state.flowGroup = state.flowGroup === button.dataset.flow ? "" : button.dataset.flow;
    applyFilters();
  }));
}

function statusBadge(record) {
  const stage = derived(record).visualStage;
  const type = stage === "Entregue à OM" ? "completed" : stage === "Oficina reparadora" ? "repair" : ["Trânsito ao exterior", "Trânsito à oficina", "Fluxo de retorno"].includes(stage) ? "transit" : stage === "Etapa não mapeada" ? "alert" : "open";
  return `<span class="rep-badge rep-badge--${type}">${escapeHtml(textDisplay(record.realStatus))}</span>`;
}

function tdrBadge(record) {
  const info = derived(record).tdr;
  return `<span class="rep-deadline rep-deadline--${escapeHtml(info.code)}">${escapeHtml(info.label)}</span>`;
}

function deadlineBadge(record) {
  const info = derived(record).deadline;
  return `<span class="rep-deadline rep-deadline--${escapeHtml(info.code)}">${escapeHtml(info.label)}</span>`;
}

function renderStatusSummary() {
  const map = new Map();
  state.filtered.forEach(record => map.set(record.realStatus || "Não informado", (map.get(record.realStatus || "Não informado") || 0) + 1));
  const rows = Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  const max = Math.max(...rows.map(row => row[1]), 1);
  els.statusSummary.innerHTML = rows.length ? rows.map(([status, count]) => `<div class="rep-summary-row">
    <div><strong>${escapeHtml(status)}</strong><span>${fmtInteger.format(count)} item(ns)</span></div>
    <span class="rep-summary-bar"><i style="width:${Math.max(4, count / max * 100)}%"></i></span>
  </div>`).join("") : '<p class="rep-empty-message">Nenhum status disponível.</p>';
}

function attentionScore(record) {
  const info = derived(record);
  if (info.deadline.code === "overdue") return 1000 + Math.abs(info.deadline.days || 0);
  if (info.tdr.code === "overdue") return 800 + Math.abs(info.tdr.days || 0);
  if (info.tdr.code === "due-soon") return 700 - (info.tdr.days || 0);
  if (info.visualStage === "Etapa não mapeada") return 650;
  if ((record.qualityWarnings || []).length) return 300 + record.qualityWarnings.length;
  return 0;
}

function renderAttentionList() {
  const attention = state.filtered.map(record => ({ record, score: attentionScore(record) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  els.attentionList.innerHTML = attention.length ? attention.map(({ record }) => {
    const info = derived(record);
    const reason = info.deadline.code === "overdue" ? info.deadline.label : info.tdr.code === "overdue" || info.tdr.code === "due-soon" ? info.tdr.label : info.visualStage === "Etapa não mapeada" ? "Status sem mapeamento visual" : (record.qualityWarnings || ["Dados incompletos"])[0];
    return `<button type="button" class="rep-attention-item" data-view-id="${record.id}">
      <div><strong>${escapeHtml(record.po)}</strong><span>${escapeHtml(record.requisition)} · PN ${escapeHtml(record.partNumber)} · SN ${escapeHtml(record.serialNumber)}</span></div>
      <small>${escapeHtml(reason)}</small>
    </button>`;
  }).join("") : '<p class="rep-empty-message">Nenhum item crítico para os filtros selecionados.</p>';
  bindViewButtons(els.attentionList);
}

function buildQualityCounts(records) {
  const counts = {
    tteDiscarded: 0, omDerived: 0, unmapped: 0, tdrNoBase: 0, deliveredMismatch: 0,
    manualProcessMissing: 0, manualDescriptionMissing: 0, itemValueMissing: 0, repairValueMissing: 0,
    absent: state.absentRecords.length
  };
  records.forEach(record => {
    if (record.evaluationFeeDiscardReason) counts.tteDiscarded += 1;
    if (record.originDerived) counts.omDerived += 1;
    if (derived(record).visualStage === "Etapa não mapeada") counts.unmapped += 1;
    if (!record.receivedAtRepairerDate) counts.tdrNoBase += 1;
    if (record.dpeFinalIndicator === "ENTREGUE" && record.realStatus !== "10-Encerrado") counts.deliveredMismatch += 1;
    if (!normalizeNullable(record.processNumber)) counts.manualProcessMissing += 1;
    if (!normalizeNullable(record.description)) counts.manualDescriptionMissing += 1;
    if (record.itemValue == null) counts.itemValueMissing += 1;
    if (record.repairValue == null) counts.repairValueMissing += 1;
  });
  return counts;
}

function renderQuality() {
  const counts = buildQualityCounts(state.filtered);
  const items = [
    ["TTE descartadas por regra de qualidade", counts.tteDiscarded, "bi-cash-stack"],
    ["OM derivada da requisição", counts.omDerived, "bi-building-check"],
    ["Status sem etapa visual mapeada", counts.unmapped, "bi-question-diamond"],
    ["Prazo do TDR não calculável", counts.tdrNoBase, "bi-calendar-x"],
    ["DPE indica ENTREGUE com status não encerrado", counts.deliveredMismatch, "bi-exclamation-octagon"],
    ["Número do processo não informado", counts.manualProcessMissing, "bi-folder-x"],
    ["Descrição do item não informada", counts.manualDescriptionMissing, "bi-card-text"],
    ["Valor do item não informado", counts.itemValueMissing, "bi-currency-dollar"],
    ["Valor do reparo não informado", counts.repairValueMissing, "bi-receipt"],
    ["Ausentes do lote atual preservados", counts.absent, "bi-archive"]
  ];
  els.qualityGrid.innerHTML = items.map(([label, count, icon]) => `<article class="rep-quality-item${count ? " has-warning" : ""}">
    <i class="bi ${icon}"></i><div><strong>${fmtInteger.format(count)}</strong><span>${escapeHtml(label)}</span></div>
  </article>`).join("");
}

function renderTable() {
  const tbody = els.table.querySelector("tbody");
  tbody.innerHTML = state.filtered.map(record => {
    const info = derived(record);
    return `<tr>
      <td><strong>${escapeHtml(record.po)}</strong><small>${escapeHtml(formatDate(record.poIssueDate))}</small></td>
      <td>${escapeHtml(record.requisition)}</td>
      <td><strong>PN ${escapeHtml(record.partNumber)}</strong><small>SN ${escapeHtml(record.serialNumber)}</small></td>
      <td>${escapeHtml(textDisplay(record.originOm))}${record.originDerived ? '<small class="rep-derived-note">derivada</small>' : ""}</td>
      <td>${escapeHtml(textDisplay(record.condition))}</td>
      <td>${statusBadge(record)}<small>${escapeHtml(info.visualStage)}</small></td>
      <td>${escapeHtml(textDisplay(record.repairerName))}<small>CAGE ${escapeHtml(textDisplay(record.repairerCage))}</small></td>
      <td>${tdrBadge(record)}<small>Limite: ${escapeHtml(formatDate(info.tdr.dueDate))}</small></td>
      <td>${deadlineBadge(record)}<small>DPE: ${escapeHtml(record.dpeFinalIndicator || formatDate(record.dpeFinalDate))}</small></td>
      <td class="rep-row-actions"><button type="button" class="rep-icon-button" data-view-id="${record.id}" title="Ver detalhes"><i class="bi bi-eye"></i></button>${state.isAdmin ? `<button type="button" class="rep-icon-button" data-edit-id="${record.id}" title="Editar dados complementares"><i class="bi bi-pencil"></i></button><button type="button" class="rep-icon-button rep-icon-button--danger" data-delete-id="${record.id}" title="Excluir"><i class="bi bi-trash"></i></button>` : ""}</td>
    </tr>`;
  }).join("");

  els.mobileList.innerHTML = state.filtered.map(record => {
    const info = derived(record);
    return `<article class="rep-mobile-card">
      <div class="rep-mobile-card__header"><div><span>${escapeHtml(record.po)}</span><strong>${escapeHtml(record.requisition)}</strong></div>${deadlineBadge(record)}</div>
      <dl><div><dt>PN / SN</dt><dd>${escapeHtml(record.partNumber)} / ${escapeHtml(record.serialNumber)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(textDisplay(record.realStatus))}</dd></div><div><dt>Etapa</dt><dd>${escapeHtml(info.visualStage)}</dd></div>
      <div><dt>Reparador</dt><dd>${escapeHtml(textDisplay(record.repairerName))}</dd></div><div><dt>TDR</dt><dd>${escapeHtml(info.tdr.label)}</dd></div></dl>
      <div class="rep-mobile-card__actions"><button type="button" class="rep-btn rep-btn--light" data-view-id="${record.id}"><i class="bi bi-eye"></i> Detalhes</button>${state.isAdmin ? `<button type="button" class="rep-btn rep-btn--outline" data-edit-id="${record.id}"><i class="bi bi-pencil"></i> Complementar</button>` : ""}</div>
    </article>`;
  }).join("");

  els.emptyState.hidden = state.filtered.length > 0;
  bindViewButtons(tbody); bindViewButtons(els.mobileList); bindEditButtons(tbody); bindEditButtons(els.mobileList);
  tbody.querySelectorAll("[data-delete-id]").forEach(button => button.addEventListener("click", () => deleteRecord(button.dataset.deleteId)));
}

function renderAll() {
  renderKpis(); renderFlow(); renderStatusSummary(); renderAttentionList(); renderQuality(); renderTable();
}

function bindViewButtons(root) {
  root.querySelectorAll("[data-view-id]").forEach(button => button.addEventListener("click", () => openDetail(button.dataset.viewId)));
}

function bindEditButtons(root) {
  root.querySelectorAll("[data-edit-id]").forEach(button => button.addEventListener("click", () => openEdit(button.dataset.editId)));
}

function findRecord(id) {
  return [...state.records, ...state.absentRecords].find(record => record.id === id);
}

function detailRow(label, value, extra = "") {
  return `<div class="rep-detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(textDisplay(value))}${extra}</dd></div>`;
}

function openDetail(id) {
  const record = findRecord(id); if (!record) return;
  const info = derived(record);
  const warnings = [...(record.qualityWarnings || [])];
  if (record.evaluationFeeDiscardReason) warnings.push("Taxa de avaliação desconsiderada pela regra de qualidade.");
  if (record.originDerived) warnings.push("OM derivada dos dois primeiros caracteres da requisição.");
  if (info.visualStage === "Etapa não mapeada") warnings.push("Status real sem mapeamento visual.");
  if (record.dpeFinalIndicator === "ENTREGUE" && record.realStatus !== "10-Encerrado") warnings.push("DPE FINAL indica ENTREGUE, mas o status real não está encerrado.");
  els.detailTitle.textContent = `${record.po} · ${record.requisition}`;
  els.detailContent.innerHTML = `
    <section class="rep-detail-group"><h3>Identificação</h3><dl>${detailRow("Número do processo", record.processNumber)}${detailRow("Descrição do item", record.description)}${detailRow("Chave estável", record.importKey)}${detailRow("Situação no lote", record.lastSeenBatchId === state.config?.activeBatchId || state.sourceMode === "bundle" ? "Presente no lote atual" : "Ausente do lote atual — registro preservado")}</dl></section>
    <section class="rep-detail-group"><h3>Empenho e requisição</h3><dl>${detailRow("Empenho / PO", record.po)}${detailRow("Data de emissão", formatDate(record.poIssueDate))}${detailRow("Requisição", record.requisition)}${detailRow("Parque / OM", record.originOm, record.originDerived ? ' <span class="rep-inline-alert">derivada da requisição</span>' : "")}</dl></section>
    <section class="rep-detail-group"><h3>Item</h3><dl>${detailRow("Part Number", record.partNumber)}${detailRow("Serial Number", record.serialNumber)}${detailRow("Condição", record.condition)}${detailRow("Valor do item", moneyDisplay(record.itemValue, record.currency))}</dl></section>
    <section class="rep-detail-group"><h3>Reparador</h3><dl>${detailRow("CAGE Code", record.repairerCage)}${detailRow("Nome do reparador", record.repairerName)}${detailRow("Valor do reparo contratado", moneyDisplay(record.repairValue, record.currency))}${detailRow("Taxa de avaliação — TTE", record.evaluationFee == null ? "Não informado" : `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(record.evaluationFee)} — Moeda não informada`)}</dl></section>
    <section class="rep-detail-group"><h3>Envio ao reparador</h3><dl>${detailRow("Data de recebimento no reparador", formatDate(record.receivedAtRepairerDate))}${detailRow("Tracking do envio", record.trackingToRepairer)}</dl></section>
    <section class="rep-detail-group"><h3>TDR e decisão</h3><dl>${detailRow("Prazo-limite do TDR", formatDate(info.tdr.dueDate))}${detailRow("Data de envio do TDR", formatDate(record.tdrSentDate))}${detailRow("Situação do TDR", info.tdr.label)}${detailRow("Decisão sobre o serviço", record.serviceDecision)}${detailRow(record.serviceDateLabel || contextualServiceDateLabel(record.serviceDecision), formatDate(record.serviceAuthorizationOrAsIsDate))}</dl></section>
    <section class="rep-detail-group"><h3>Execução e prazo</h3><dl>${detailRow("Prazo de entrega do reparo", record.repairDeliveryDays == null ? null : `${record.repairDeliveryDays} dia(s)`)}${detailRow("DPE FINAL", record.dpeFinalIndicator || formatDate(record.dpeFinalDate))}${detailRow("Situação do retorno", info.deadline.label)}</dl></section>
    <section class="rep-detail-group"><h3>Retorno</h3><dl>${detailRow("Tracking / volume de retorno", record.returnTrackingVolume)}${detailRow("Recebimento no depósito CABW", formatDate(record.returnMaterialDate))}</dl></section>
    <section class="rep-detail-group"><h3>Dados complementares</h3><dl>${detailRow("Moeda", record.currency)}${detailRow("Observações manuais", record.manualNotes)}</dl></section>
    <section class="rep-detail-group"><h3>Metadados da importação</h3><dl>${detailRow("Arquivo", record.sourceFileName)}${detailRow("Aba", record.sourceSheet)}${detailRow("Linha de origem", record.sourceRow)}${detailRow("Lote", record.importBatchId)}${detailRow("Importado em", formatDateTime(record.importedAt))}${detailRow("Importado por", record.importedByName || record.importedBy || "Não informado")}${detailRow("Atualizado em", formatDateTime(record.updatedAt))}</dl></section>
    <section class="rep-detail-group rep-detail-group--warnings"><h3>Avisos de qualidade</h3>${warnings.length ? `<ul>${Array.from(new Set(warnings)).map(warning => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : '<p>Nenhuma divergência identificada neste registro.</p>'}</section>`;
  els.detailEdit.hidden = !state.isAdmin;
  els.detailEdit.dataset.editId = record.id;
  els.detailDialog.showModal();
}

function closeDialog(dialog) { if (dialog?.open) dialog.close(); }

function openEdit(id = "") {
  const record = id ? findRecord(id) : null;
  els.editForm.reset(); els.editMessage.textContent = ""; els.editMessage.className = "rep-form-message";
  els.editRecordId.value = record?.id || "";
  const existing = Boolean(record);
  els.editTitle.textContent = existing ? "Complementar dados do item" : "Cadastrar item manualmente";
  [els.editPo, els.editRequisition, els.editPn, els.editSn].forEach(input => { input.readOnly = existing; });
  els.editPo.value = record?.po || ""; els.editRequisition.value = record?.requisition || ""; els.editPn.value = record?.partNumber || ""; els.editSn.value = record?.serialNumber || "";
  els.editProcess.value = record?.processNumber || ""; els.editDescription.value = record?.description || "";
  els.editItemValue.value = record?.itemValue ?? ""; els.editRepairValue.value = record?.repairValue ?? ""; els.editCurrency.value = record?.currency || "";
  els.editNotes.value = record?.manualNotes || ""; els.editOrigin.value = record?.originOm || ""; els.editStatus.value = record?.realStatus || "";
  els.editRepairer.value = record?.repairerName || ""; els.editCage.value = record?.repairerCage || "";
  els.editDialog.showModal();
}

async function saveManual(event) {
  event.preventDefault();
  if (!state.isAdmin || !state.user) return;
  const existingId = els.editRecordId.value;
  const po = normalizeIdentifier(els.editPo.value), requisition = normalizeIdentifier(els.editRequisition.value), pn = normalizeIdentifier(els.editPn.value), sn = normalizeIdentifier(els.editSn.value);
  if (!po || !requisition || !pn || !sn) {
    setEditMessage("Empenho/PO, requisição, PN e SN são obrigatórios.", "error"); return;
  }
  const id = existingId || await sha256Hex(stableKeySource(po, requisition, pn, sn));
  const payload = {
    processNumber: normalizeNullable(els.editProcess.value), description: normalizeNullable(els.editDescription.value),
    itemValue: parseFlexibleNumber(els.editItemValue.value), repairValue: parseFlexibleNumber(els.editRepairValue.value),
    currency: normalizeNullable(els.editCurrency.value), manualNotes: normalizeNullable(els.editNotes.value),
    updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: state.user.displayName || state.user.email || ""
  };
  if (!existingId) {
    Object.assign(payload, {
      po, requisition, partNumber: pn, serialNumber: sn, importKey: stableKeySource(po, requisition, pn, sn),
      originOm: normalizeNullable(els.editOrigin.value), originDerived: false, realStatus: normalizeNullable(els.editStatus.value),
      visualStage: mapVisualStage(els.editStatus.value), repairerName: normalizeNullable(els.editRepairer.value), repairerCage: normalizeNullable(els.editCage.value),
      manualOnly: true, createdAt: serverTimestamp(), createdBy: state.user.uid, createdByName: state.user.displayName || state.user.email || ""
    });
  }
  try {
    await setDoc(doc(db, COLLECTION_NAME, id), payload, { merge: true });
    await logAction(existingId ? "Atualização de material reparável" : "Cadastro manual de material reparável", { recordId: id, po, requisition });
    closeDialog(els.editDialog);
  } catch (error) {
    console.error(error); setEditMessage(error.code === "permission-denied" ? "A gravação foi negada pelas regras do Firestore." : "Não foi possível salvar o registro.", "error");
  }
}

function setEditMessage(message, type) {
  els.editMessage.textContent = message; els.editMessage.className = `rep-form-message is-visible rep-form-message--${type}`;
}

async function deleteRecord(id) {
  if (!state.isAdmin || !id) return;
  const record = findRecord(id); if (!record) return;
  if (!window.confirm(`Excluir definitivamente o item ${record.po} / ${record.requisition}? Esta ação é administrativa e não é executada automaticamente pela importação.`)) return;
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    await logAction("Exclusão de material reparável", { recordId: id, po: record.po, requisition: record.requisition });
  } catch (error) {
    window.alert(error.code === "permission-denied" ? "Exclusão negada pelas regras do Firestore." : "Não foi possível excluir o registro.");
  }
}

async function determineAdmin(user) {
  try { return (await getDoc(doc(db, "admins", user.uid))).exists(); } catch { return false; }
}

async function logAction(action, details = {}) {
  if (!state.user) return;
  try {
    await addDoc(collection(db, "accessLogs"), {
      uid: state.user.uid, name: state.user.displayName || state.user.email || "", email: state.user.email || "",
      action, panel: "Controle de Materiais Reparáveis", path: "governanca-reparaveis.html",
      details: JSON.stringify(details), timestamp: serverTimestamp(), timestampClient: new Date().toISOString()
    });
  } catch (error) { console.warn("Log não gravado", error); }
}

function headerMap(sheet) {
  const range = window.XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const map = new Map();
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const cell = sheet[window.XLSX.utils.encode_cell({ r: 0, c: col })];
    if (cell) map.set(normalizeHeader(cell.v), col);
  }
  return { map, range };
}

function findHeaderColumn(map, header) {
  const target = normalizeHeader(header);
  for (const [key, value] of map.entries()) if (key === target) return value;
  return null;
}

function cellAt(sheet, row, col) {
  if (col == null) return null;
  return sheet[window.XLSX.utils.encode_cell({ r: row, c: col })] || null;
}

function workbookDateFromName(name) {
  const matches = String(name).match(/(\d{2})(\d{2})(\d{4})(?!\d)/g);
  if (!matches?.length) return TODAY_ISO;
  const value = matches[matches.length - 1];
  return `${value.slice(4, 8)}-${value.slice(2, 4)}-${value.slice(0, 2)}`;
}

async function parseWorkbookFile(file, referenceDateIso) {
  if (!window.XLSX) throw new Error("A biblioteca de leitura de planilhas não foi carregada.");
  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false, cellFormula: true, cellNF: true, cellText: false });
  if (!workbook.SheetNames.includes(SOURCE_SHEET)) throw new Error(`A aba obrigatória “${SOURCE_SHEET}” não foi encontrada.`);
  const sheet = workbook.Sheets[SOURCE_SHEET];
  const { map, range } = headerMap(sheet);
  const missingHeaders = REQUIRED_HEADERS.filter(header => findHeaderColumn(map, header) == null);
  if (missingHeaders.length) throw new Error(`Cabeçalhos obrigatórios ausentes: ${missingHeaders.join(", ")}.`);
  const col = header => findHeaderColumn(map, header);
  const parsed = [], rejected = [], warnings = [], seen = new Set();
  let ignored = 0;
  const quality = { tteDiscarded: 0, omDerived: 0, unmapped: 0, tdrNoBase: 0, duplicateKeys: 0 };

  for (let row = 1; row <= range.e.r; row += 1) {
    const value = header => cellAt(sheet, row, col(header))?.v;
    const formula = header => cellAt(sheet, row, col(header))?.f || "";
    const po = normalizeIdentifier(value("PO")), requisition = normalizeIdentifier(value("REQUISIÇÃO")), pn = normalizeIdentifier(value("PN")), sn = normalizeIdentifier(value("SN"));
    const essentials = [po, requisition, pn, sn];
    if (!essentials.some(Boolean)) { ignored += 1; continue; }
    if (!essentials.every(Boolean)) { rejected.push({ sourceRow: row + 1, reason: "PO, REQUISIÇÃO, PN e SN são obrigatórios." }); continue; }
    const key = stableKeySource(po, requisition, pn, sn);
    const id = await sha256Hex(key);
    if (seen.has(id)) { quality.duplicateKeys += 1; rejected.push({ sourceRow: row + 1, reason: "Chave PO + REQUISIÇÃO + PN + SN duplicada no arquivo." }); continue; }
    seen.add(id);
    const origin = deriveOriginOm(value("OM"), requisition);
    if (origin.derived) quality.omDerived += 1;
    const fee = normalizeEvaluationFee({ po, rawValue: value("TTE"), formula: formula("TTE") });
    if (fee.discardedReason) quality.tteDiscarded += 1;
    const realStatus = normalizeNullable(value("STATUS REAL DO MATERIAL"));
    const visualStage = mapVisualStage(realStatus);
    if (visualStage === "Etapa não mapeada") quality.unmapped += 1;
    const receivedAtRepairerDate = parseDateToIso(value("MAT EXP ou REC REPARADOR"));
    const tdrSentDate = parseDateToIso(value("TDR ENV PARQUE"));
    if (!receivedAtRepairerDate) quality.tdrNoBase += 1;
    const dpeRaw = normalizeNullable(value("DPE FINAL"));
    const dpeFinalIndicator = String(dpeRaw || "").toUpperCase() === "ENTREGUE" ? "ENTREGUE" : null;
    const serviceDecision = normalizeNullable(value("SERVIÇO APROVADO?"));
    const recordWarnings = [];
    if (origin.derived) recordWarnings.push("OM derivada dos dois primeiros caracteres da requisição");
    if (fee.discardedReason) recordWarnings.push("TTE descartada pela regra de qualidade");
    if (visualStage === "Etapa não mapeada") recordWarnings.push(`Status sem mapeamento visual: ${realStatus || "Não informado"}`);
    if (!receivedAtRepairerDate) recordWarnings.push("Prazo do TDR não calculável: recebimento no reparador não informado");
    if (dpeFinalIndicator === "ENTREGUE" && realStatus !== "10-Encerrado") recordWarnings.push("DPE FINAL indica ENTREGUE, mas o status real não está encerrado");
    const tdr = calculateTdrStatus(receivedAtRepairerDate, tdrSentDate, referenceDateIso);
    parsed.push({
      id, importKey: key, po, evaluationFee: fee.value, evaluationFeeCurrency: null, evaluationFeeRaw: fee.raw, evaluationFeeDiscardReason: fee.discardedReason,
      poIssueDate: parseDateToIso(value("DATA EMISSÃO PO")), realStatus, visualStage, requisition, originOm: origin.value, originDerived: origin.derived,
      partNumber: pn, serialNumber: sn, condition: normalizeNullable(value("COND")), receivedAtRepairerDate,
      trackingToRepairer: normalizeNullable(value("TRACKING ENVIO REPARADOR")), tdrDueDate: tdr.dueDate, tdrSentDate,
      serviceDecision, serviceAuthorizationOrAsIsDate: parseDateToIso(value("SVC AUTORIZADO / SOL RETORNO AS IS")), serviceDateLabel: contextualServiceDateLabel(serviceDecision),
      repairDeliveryDays: parseFlexibleNumber(value("PRAZO ENTREGA (DIAS)")) == null ? null : Math.trunc(parseFlexibleNumber(value("PRAZO ENTREGA (DIAS)"))),
      dpeFinalDate: parseDateToIso(dpeRaw), dpeFinalIndicator, returnTrackingVolume: normalizeNullable(value("TRACKING/VOLUME RETORNO REPARADOR -> DEPÓSITO")),
      returnMaterialDate: parseDateToIso(value("RETORNO MAT")), repairerCage: normalizeIdentifier(value("CAGE CODE REPARADOR")), repairerName: normalizeNullable(value("NOME REPARADOR")),
      qualityWarnings: recordWarnings, sourceFileName: file.name, sourceSheet: SOURCE_SHEET, sourceRow: row + 1
    });
  }
  if (!parsed.length) throw new Error("Nenhuma linha válida foi encontrada. Cada item deve possuir PO, REQUISIÇÃO, PN e SN.");
  return { fileName: file.name, fileSize: file.size, referenceDate: referenceDateIso, sheet: SOURCE_SHEET, records: parsed, rejected, ignored, quality, warnings };
}

function importedBusinessProjection(record) {
  const result = {};
  IMPORTED_FIELDS.forEach(field => { result[field] = record?.[field] ?? null; });
  return result;
}

function buildPreview(parsed) {
  const existingMap = new Map(state.firestoreRecords.map(record => [record.id, record]));
  let newCount = 0, updatedCount = 0, unchangedCount = 0;
  parsed.records.forEach(record => {
    const existing = existingMap.get(record.id);
    if (!existing) newCount += 1;
    else if (importedDataEqual(existing, record)) unchangedCount += 1;
    else updatedCount += 1;
  });
  const incoming = new Set(parsed.records.map(record => record.id));
  const currentIds = new Set(currentFirestoreRecords().filter(record => !record.manualOnly).map(record => record.id));
  const missingIds = Array.from(currentIds).filter(id => !incoming.has(id));
  return { ...parsed, newCount, updatedCount, unchangedCount, missingIds };
}

async function previewImport() {
  if (!state.isAdmin) return;
  const file = els.importFile.files?.[0];
  if (!file) { setImportMessage("Selecione um arquivo .xlsx.", "error"); return; }
  if (!/\.xlsx$/i.test(file.name)) { setImportMessage("Formato inválido. Selecione um arquivo .xlsx.", "error"); return; }
  const competence = els.importDate.value || workbookDateFromName(file.name);
  els.importDate.value = competence;
  setImportMessage("Lendo e validando a planilha...", "info");
  els.importPreviewButton.disabled = true;
  try {
    const parsed = await parseWorkbookFile(file, competence);
    state.importPreview = buildPreview(parsed);
    renderImportPreview();
    setImportMessage("Pré-visualização concluída. Revise os totais antes de confirmar.", "success");
  } catch (error) {
    console.error(error); state.importPreview = null; renderImportPreview(); setImportMessage(error.message || "Não foi possível processar a planilha.", "error");
  } finally { els.importPreviewButton.disabled = false; }
}

function renderImportPreview() {
  const preview = state.importPreview;
  els.importCommitButton.disabled = !preview;
  els.importPreviewPanel.hidden = !preview;
  if (!preview) { els.importPreviewGrid.innerHTML = ""; els.importWarnings.innerHTML = ""; return; }
  const cards = [
    ["Arquivo", preview.fileName], ["Competência", formatDate(preview.referenceDate)], ["Linhas válidas", preview.records.length],
    ["Novas", preview.newCount], ["Alteradas", preview.updatedCount], ["Sem alteração", preview.unchangedCount],
    ["Rejeitadas", preview.rejected.length], ["Linhas vazias/fórmulas ignoradas", preview.ignored], ["Ausentes no lote", preview.missingIds.length]
  ];
  els.importPreviewGrid.innerHTML = cards.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  const warnings = [];
  if (preview.quality.tteDiscarded) warnings.push(`${preview.quality.tteDiscarded} TTE(s) desconsiderada(s) por fórmula/ano da PO.`);
  if (preview.quality.omDerived) warnings.push(`${preview.quality.omDerived} OM(s) derivada(s) da requisição.`);
  if (preview.quality.unmapped) warnings.push(`${preview.quality.unmapped} status sem mapeamento visual.`);
  if (preview.quality.tdrNoBase) warnings.push(`${preview.quality.tdrNoBase} item(ns) sem data-base para calcular o TDR.`);
  if (preview.missingIds.length) warnings.push(`${preview.missingIds.length} registro(s) não aparecem no novo arquivo; serão preservados e sinalizados como ausentes do lote atual.`);
  if (preview.rejected.length) warnings.push(`${preview.rejected.length} linha(s) rejeitada(s).`);
  els.importWarnings.innerHTML = warnings.length ? `<ul>${warnings.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : '<p>Nenhum aviso de qualidade relevante.</p>';
}

function setImportMessage(message, type) {
  els.importMessage.textContent = message || "";
  els.importMessage.className = `rep-form-message${message ? ` is-visible rep-form-message--${type}` : ""}`;
}

async function commitImport() {
  const preview = state.importPreview;
  if (!preview || !state.isAdmin || !state.user) return;
  if (preview.records.length > MAX_ATOMIC_RECORDS) {
    setImportMessage(`A importação possui ${preview.records.length} registros e ultrapassa o limite atômico configurado de ${MAX_ATOMIC_RECORDS}. Nenhum dado foi gravado.`, "error"); return;
  }
  els.importCommitButton.disabled = true;
  setImportMessage("Gravando o lote de forma atômica no Firestore...", "info");
  try {
    const fileHash = (await sha256Hex(`${preview.fileName}|${preview.fileSize}|${preview.records.length}`)).slice(0, 10);
    const batchId = `rep-${preview.referenceDate.replaceAll("-", "")}-${Date.now()}-${fileHash}`;
    const existingMap = new Map(state.firestoreRecords.map(record => [record.id, record]));
    const batch = writeBatch(db);
    preview.records.forEach(record => {
      const existing = existingMap.get(record.id);
      const changed = existing ? !importedDataEqual(existing, record) : true;
      const { id: recordId, ...recordData } = record;
      const payload = {
        ...recordData, manualOnly: false, importBatchId: batchId, lastSeenBatchId: batchId, sourceFileName: preview.fileName, sourceSheet: SOURCE_SHEET,
        importedAt: serverTimestamp(), importedBy: state.user.uid, importedByName: state.user.displayName || state.user.email || ""
      };
      if (!existing) payload.createdAt = serverTimestamp();
      if (!existing || changed) payload.updatedAt = serverTimestamp();
      batch.set(doc(db, COLLECTION_NAME, recordId), payload, { merge: true });
    });
    const metadata = {
      activeBatchId: batchId, sourceFileName: preview.fileName, sourceSheet: SOURCE_SHEET, referenceDate: preview.referenceDate,
      validRows: preview.records.length, newCount: preview.newCount, updatedCount: preview.updatedCount, unchangedCount: preview.unchangedCount,
      rejectedCount: preview.rejected.length, ignoredRows: preview.ignored, missingRecordIds: preview.missingIds,
      quality: preview.quality, importedAt: serverTimestamp(), importedBy: state.user.uid, importedByName: state.user.displayName || state.user.email || ""
    };
    batch.set(doc(db, "repairProcessesConfig", "current"), metadata, { merge: true });
    batch.set(doc(db, IMPORT_COLLECTION, batchId), { ...metadata, batchId, rejectedRows: preview.rejected.slice(0, 100) });
    await batch.commit();
    await logAction("Importação mensal de materiais reparáveis", { batchId, fileName: preview.fileName, validRows: preview.records.length, newCount: preview.newCount, updatedCount: preview.updatedCount, unchangedCount: preview.unchangedCount, missingCount: preview.missingIds.length });
    setImportMessage(`Importação concluída: ${preview.records.length} registros processados sem duplicidade.`, "success");
    state.importPreview = null; els.importFile.value = ""; renderImportPreview(); await loadImportHistory();
  } catch (error) {
    console.error(error); setImportMessage(error.code === "permission-denied" ? "Importação negada. Publique as regras atualizadas do Firestore." : `Falha na importação. Nenhum lote foi confirmado: ${error.message || error.code || "erro desconhecido"}.`, "error");
  } finally { els.importCommitButton.disabled = !state.importPreview; }
}

async function loadImportHistory() {
  try {
    const snapshot = await getDocs(query(collection(db, IMPORT_COLLECTION), orderBy("importedAt", "desc"), limit(8)));
    state.importHistory = snapshot.docs.map(recordFromSnapshot);
  } catch { state.importHistory = []; }
  renderImportHistory();
}

function renderImportHistory() {
  if (!els.importHistory) return;
  els.importHistory.innerHTML = state.importHistory.length ? state.importHistory.map(item => `<article class="rep-import-history-item">
    <div><strong>${escapeHtml(item.sourceFileName || "Arquivo não informado")}</strong><span>${formatDate(item.referenceDate)} · ${formatDateTime(item.importedAt)}</span></div>
    <small>${fmtInteger.format(item.validRows || 0)} válidos · ${fmtInteger.format(item.newCount || 0)} novos · ${fmtInteger.format(item.updatedCount || 0)} alterados · ${fmtInteger.format(item.unchangedCount || 0)} sem alteração</small>
  </article>`).join("") : '<p class="rep-empty-message">Nenhuma importação registrada no Firestore.</p>';
}

function filterSummaryText() {
  const filters = readFilters(); const values = [];
  if (filters.po) values.push(`PO: ${els.poFilter.value}`); if (filters.requisition) values.push(`Requisição: ${els.requisitionFilter.value}`);
  if (filters.status) values.push(`Status: ${filters.status}`); if (filters.stage) values.push(`Etapa: ${filters.stage}`);
  if (filters.origin) values.push(`OM: ${filters.origin}`); if (filters.repairer) values.push(`Reparador: ${filters.repairer}`);
  if (filters.condition) values.push(`Condição: ${filters.condition}`); if (filters.evaluationFee) values.push(`TTE: ${filters.evaluationFee}`);
  if (filters.tdr) values.push(`TDR: ${filters.tdr}`); if (filters.deadline) values.push(`Prazo: ${filters.deadline}`);
  if (filters.search) values.push(`Busca: ${els.search.value}`); if (filters.includeAbsent) values.push("Inclui ausentes do lote atual");
  return values.length ? values.join(" · ") : "Sem filtros — todos os registros atuais";
}

function setupPdf(title, orientation = "portrait") {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  pdf.setFillColor(1, 45, 107); pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 24, "F");
  pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.text("PAINEL CABW", 14, 10);
  pdf.setFontSize(11); pdf.text(title, 14, 18);
  pdf.setTextColor(20, 35, 70); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
  pdf.text(`Gerado em ${fmtDateTime.format(new Date())}`, 14, 30);
  pdf.text(`Fonte/lote: ${state.config?.sourceFileName || BUNDLED_REPAIR_DATA.metadata.sourceFileName} · ${state.config?.activeBatchId || "pacote inicial"}`, 14, 35);
  const filters = pdf.splitTextToSize(`Filtros: ${filterSummaryText()}`, pdf.internal.pageSize.getWidth() - 28);
  pdf.text(filters, 14, 40);
  return { pdf, startY: 44 + filters.length * 4 };
}

function ensurePdf() {
  if (!state.filtered.length) { window.alert("Não há registros para o relatório com os filtros atuais."); return false; }
  if (!window.jspdf?.jsPDF) { window.alert("A biblioteca de PDF não foi carregada."); return false; }
  return true;
}

function generateSummaryPdf() {
  if (!ensurePdf()) return;
  const { pdf, startY } = setupPdf("Relatório Gerencial — Materiais Reparáveis");
  const records = state.filtered; const enriched = records.map(record => ({ record, ...derived(record) }));
  const itemValue = aggregateMoney(records, "itemValue"), repairValue = aggregateMoney(records, "repairValue");
  pdf.autoTable({ startY, head: [["Indicador", "Resultado"]], body: [
    ["Itens controlados", String(records.length)], ["Em oficina/reparo", String(enriched.filter(item => item.visualStage === "Oficina reparadora").length)],
    ["Em trânsito", String(enriched.filter(item => ["Trânsito ao exterior", "Trânsito à oficina", "Fluxo de retorno"].includes(item.visualStage)).length)],
    ["TDR atrasado/próximo", String(enriched.filter(item => ["overdue", "due-soon"].includes(item.tdr.code)).length)],
    ["Retornos atrasados", String(enriched.filter(item => item.deadline.code === "overdue").length)], ["Concluídos", String(enriched.filter(item => item.visualStage === "Entregue à OM").length)],
    ["Valor dos itens", `${itemValue.value} (${itemValue.note})`], ["Reparos contratados", `${repairValue.value} (${repairValue.note})`]
  ], headStyles: { fillColor: [1, 58, 126] }, styles: { fontSize: 8 } });
  let y = pdf.lastAutoTable.finalY + 6;
  const status = new Map(); records.forEach(record => status.set(record.realStatus || "Não informado", (status.get(record.realStatus || "Não informado") || 0) + 1));
  pdf.autoTable({ startY: y, head: [["Status real", "Itens"]], body: Array.from(status.entries()).sort((a, b) => b[1] - a[1]), headStyles: { fillColor: [1, 58, 126] }, styles: { fontSize: 7 } });
  y = pdf.lastAutoTable.finalY + 6;
  const repairers = new Map(); records.forEach(record => repairers.set(record.repairerName || "Não informado", (repairers.get(record.repairerName || "Não informado") || 0) + 1));
  pdf.autoTable({ startY: y, head: [["Reparadores com maior volume", "Itens"]], body: Array.from(repairers.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10), headStyles: { fillColor: [1, 58, 126] }, styles: { fontSize: 7 } });
  y = pdf.lastAutoTable.finalY + 6;
  const attention = enriched.filter(item => item.tdr.code === "overdue" || item.tdr.code === "due-soon" || item.deadline.code === "overdue").slice(0, 30);
  if (attention.length) pdf.autoTable({ startY: y, head: [["PO", "Requisição", "PN/SN", "TDR", "Retorno"]], body: attention.map(item => [item.record.po, item.record.requisition, `${item.record.partNumber} / ${item.record.serialNumber}`, item.tdr.label, item.deadline.label]), headStyles: { fillColor: [179, 37, 53] }, styles: { fontSize: 6.5 } });
  const quality = buildQualityCounts(records); y = pdf.lastAutoTable?.finalY ? pdf.lastAutoTable.finalY + 6 : y;
  pdf.autoTable({ startY: y, head: [["Avisos de dados incompletos", "Quantidade"]], body: [["TTE descartada", quality.tteDiscarded], ["OM derivada", quality.omDerived], ["Prazo TDR não calculável", quality.tdrNoBase], ["Processo não informado", quality.manualProcessMissing], ["Descrição não informada", quality.manualDescriptionMissing], ["Valor do item não informado", quality.itemValueMissing], ["Valor do reparo não informado", quality.repairValueMissing]], headStyles: { fillColor: [230, 160, 0] }, styles: { fontSize: 7 } });
  pdf.save(`materiais-reparaveis-gerencial-${TODAY_ISO}.pdf`);
}

function generateDetailedPdf() {
  if (!ensurePdf()) return;
  const { pdf, startY } = setupPdf("Relatório Detalhado — Materiais Reparáveis", "landscape");
  pdf.autoTable({
    startY, head: [["PO", "Requisição", "PN", "SN", "OM", "Condição", "Status", "Etapa", "Reparador", "TDR", "DPE/Retorno", "Processo", "Descrição"]],
    body: state.filtered.map(record => { const info = derived(record); return [record.po, record.requisition, record.partNumber, record.serialNumber, textDisplay(record.originOm), textDisplay(record.condition), textDisplay(record.realStatus), info.visualStage, textDisplay(record.repairerName), info.tdr.label, info.deadline.label, textDisplay(record.processNumber), textDisplay(record.description)]; }),
    headStyles: { fillColor: [1, 58, 126], fontSize: 6 }, styles: { fontSize: 5.4, cellPadding: 1.1, overflow: "linebreak" },
    didDrawPage: data => { pdf.setFontSize(7); pdf.setTextColor(90, 100, 120); pdf.text(`Página ${pdf.internal.getNumberOfPages()}`, pdf.internal.pageSize.getWidth() - 22, pdf.internal.pageSize.getHeight() - 6); }
  });
  pdf.save(`materiais-reparaveis-detalhado-${TODAY_ISO}.pdf`);
}

function renderAdminControls() {
  document.querySelectorAll("[data-repair-admin]").forEach(element => { element.hidden = !state.isAdmin; });
}

function subscribeData() {
  state.subscriptions.forEach(unsubscribe => unsubscribe?.()); state.subscriptions = [];
  let configLoaded = false, recordsLoaded = false;
  const update = () => { if (configLoaded && recordsLoaded) rebuildRecordSet(); };
  state.subscriptions.push(onSnapshot(doc(db, "repairProcessesConfig", "current"), snapshot => {
    state.config = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null; configLoaded = true; update();
  }, error => { console.warn(error); state.firestoreError = error; state.config = null; configLoaded = true; update(); }));
  state.subscriptions.push(onSnapshot(collection(db, COLLECTION_NAME), snapshot => {
    state.firestoreRecords = snapshot.docs.map(recordFromSnapshot); recordsLoaded = true; state.firestoreError = null; update();
  }, error => { console.error(error); state.firestoreError = error; state.firestoreRecords = []; recordsLoaded = true; update(); }));
}

function cacheElements() {
  Object.assign(els, {
    source: $("repSourceInfo"), importToggle: $("repImportToggle"), manualNew: $("repManualNew"), importPanel: $("repImportPanel"), importFile: $("repImportFile"), importDate: $("repImportDate"), importPreviewButton: $("repImportPreviewButton"), importCommitButton: $("repImportCommitButton"), importCancelButton: $("repImportCancelButton"), importPreviewPanel: $("repImportPreviewPanel"), importPreviewGrid: $("repImportPreviewGrid"), importWarnings: $("repImportWarnings"), importMessage: $("repImportMessage"), importHistory: $("repImportHistory"),
    poFilter: $("repPoFilter"), requisitionFilter: $("repRequisitionFilter"), statusFilter: $("repStatusFilter"), stageFilter: $("repStageFilter"), originFilter: $("repOriginFilter"), repairerFilter: $("repRepairerFilter"), conditionFilter: $("repConditionFilter"), evaluationFeeFilter: $("repEvaluationFeeFilter"), tdrFilter: $("repTdrFilter"), cageFilter: $("repCageFilter"), deadlineFilter: $("repDeadlineFilter"), search: $("repSearch"), sort: $("repSort"), includeAbsent: $("repIncludeAbsent"), clearFilters: $("repClearFilters"), results: $("repResults"),
    pdfSummary: $("repPdfSummary"), pdfDetailed: $("repPdfDetailed"), kpiTotal: $("repKpiTotal"), kpiRepair: $("repKpiRepair"), kpiTransit: $("repKpiTransit"), kpiOverdue: $("repKpiOverdue"), kpiCompleted: $("repKpiCompleted"), kpiTdr: $("repKpiTdr"), kpiItemValue: $("repKpiItemValue"), kpiItemValueNote: $("repKpiItemValueNote"), kpiRepairValue: $("repKpiRepairValue"), kpiRepairValueNote: $("repKpiRepairValueNote"),
    flowGrid: $("repFlowGrid"), clearFlow: $("repClearFlow"), statusSummary: $("repStatusSummary"), attentionList: $("repAttentionList"), qualityGrid: $("repQualityGrid"), table: $("repTable"), tableCount: $("repTableCount"), mobileList: $("repMobileList"), emptyState: $("repEmptyState"),
    detailDialog: $("repDetailDialog"), detailTitle: $("repDetailTitle"), detailContent: $("repDetailContent"), detailClose: $("repDetailClose"), detailEdit: $("repDetailEdit"),
    editDialog: $("repEditDialog"), editForm: $("repEditForm"), editTitle: $("repEditTitle"), editClose: $("repEditClose"), editCancel: $("repEditCancel"), editMessage: $("repEditMessage"), editRecordId: $("repEditRecordId"), editPo: $("repEditPo"), editRequisition: $("repEditRequisition"), editPn: $("repEditPn"), editSn: $("repEditSn"), editProcess: $("repEditProcess"), editDescription: $("repEditDescription"), editItemValue: $("repEditItemValue"), editRepairValue: $("repEditRepairValue"), editCurrency: $("repEditCurrency"), editNotes: $("repEditNotes"), editOrigin: $("repEditOrigin"), editStatus: $("repEditStatus"), editRepairer: $("repEditRepairer"), editCage: $("repEditCage")
  });
}

function bindEvents() {
  [els.statusFilter, els.stageFilter, els.originFilter, els.repairerFilter, els.conditionFilter, els.evaluationFeeFilter, els.tdrFilter, els.cageFilter, els.deadlineFilter, els.sort, els.includeAbsent].forEach(element => element.addEventListener("change", applyFilters));
  [els.poFilter, els.requisitionFilter, els.search].forEach(element => element.addEventListener("input", applyFilters));
  els.clearFilters.addEventListener("click", clearFilters); els.clearFlow.addEventListener("click", () => { state.flowGroup = ""; applyFilters(); });
  els.pdfSummary.addEventListener("click", generateSummaryPdf); els.pdfDetailed.addEventListener("click", generateDetailedPdf);
  els.importToggle.addEventListener("click", () => { els.importPanel.hidden = !els.importPanel.hidden; if (!els.importPanel.hidden) els.importFile.focus(); });
  els.importCancelButton.addEventListener("click", () => { state.importPreview = null; els.importFile.value = ""; renderImportPreview(); setImportMessage("", "info"); els.importPanel.hidden = true; });
  els.importPreviewButton.addEventListener("click", previewImport); els.importCommitButton.addEventListener("click", commitImport);
  els.importFile.addEventListener("change", () => { if (els.importFile.files?.[0]) els.importDate.value = workbookDateFromName(els.importFile.files[0].name); });
  els.manualNew.addEventListener("click", () => openEdit());
  els.detailClose.addEventListener("click", () => closeDialog(els.detailDialog)); els.detailEdit.addEventListener("click", () => { const id = els.detailEdit.dataset.editId; closeDialog(els.detailDialog); openEdit(id); });
  els.editClose.addEventListener("click", () => closeDialog(els.editDialog)); els.editCancel.addEventListener("click", () => closeDialog(els.editDialog)); els.editForm.addEventListener("submit", saveManual);
  [els.detailDialog, els.editDialog].forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(dialog); }));
}

document.addEventListener("DOMContentLoaded", () => {
  cacheElements(); bindEvents(); els.importDate.value = BUNDLED_REPAIR_DATA.metadata.referenceDate;
  rebuildRecordSet();
  onAuthStateChanged(auth, async user => {
    if (!user) return;
    state.user = user; state.isAdmin = await determineAdmin(user); renderAdminControls(); subscribeData(); loadImportHistory();
  });
});
