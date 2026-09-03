import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  amendmentDeadline,
  buildContractAliasIndex,
  calendarMonthSeries,
  contractLifecycle,
  contractPaymentSummary,
  coverageEstimate,
  diffCalendarDays,
  formatDate,
  formatMoney,
  monitoringTypeMap,
  normalizeContractIdentifier,
  normalizeText,
  normalizeToken,
  normalizeUnit,
  resolveContractForPayment,
  todayIso
} from "./accountability-core.js?v=20260903-accountability-r1";

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
const contractsAll = Array.isArray(window.CABW_CONTRACTS_DATA) ? window.CABW_CONTRACTS_DATA : [];
const monitoringAll = Array.isArray(window.CONTRACT_MONITORING_DATA) ? window.CONTRACT_MONITORING_DATA : [];
const typeMap = monitoringTypeMap(monitoringAll);
const aliasIndex = buildContractAliasIndex(contractsAll);
const referenceIso = todayIso();
const scope = document.body.dataset.accountabilityScope || "cabw";

const state = {
  contracts: [],
  payments: [],
  groupedPayments: new Map(),
  unmatchedPayments: [],
  paymentLoaded: false,
  paymentError: null,
  filters: {
    search: "",
    lifecycle: "current",
    type: "",
    currency: "",
    unit: "",
    amendment: "",
    sort: "amendment"
  }
};

const el = {};
const byId = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function contractType(contract) {
  return typeMap.get(normalizeContractIdentifier(contract.numero)) || "NÃO INFORMADO";
}

function displayType(value) {
  if (value === "CONTINUADO") return "Continuado";
  if (value === "DEMANDA PONTUAL") return "Demanda pontual";
  if (value === "DESCONSIDERAR") return "Desconsiderar";
  return "Não informado";
}

function scopeContracts() {
  return contractsAll.filter(contract => {
    const isCabw = normalizeUnit(contract.unidade) === "CABW";
    return scope === "cabw" ? isCabw : !isCabw;
  });
}

function groupPayments() {
  const grouped = new Map();
  const unmatched = [];
  state.payments.forEach(payment => {
    const contract = resolveContractForPayment(payment, aliasIndex);
    if (!contract) {
      unmatched.push(payment);
      return;
    }
    const id = String(contract.id);
    const current = grouped.get(id) || [];
    current.push(payment);
    grouped.set(id, current);
  });
  state.groupedPayments = grouped;
  state.unmatchedPayments = unmatched;
}

function enriched(contract) {
  const lifecycle = contractLifecycle(contract, referenceIso);
  const amendment = amendmentDeadline(contract, referenceIso);
  const type = contractType(contract);
  const payments = state.groupedPayments.get(String(contract.id)) || [];
  const payment = contractPaymentSummary(payments, contract.moeda, referenceIso);
  const coverage = coverageEstimate(contract.totalEmpenhado, contract.totalFaturado, payment.averageLastThree);
  return {
    ...contract,
    displayUnit: normalizeUnit(contract.unidade),
    lifecycle,
    amendment,
    type,
    payments,
    payment,
    coverage
  };
}

function populateSelect(select, values, allLabel) {
  if (!select) return;
  const current = select.value;
  const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  select.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>` + unique.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function populateFilters() {
  const base = state.contracts.map(enriched);
  populateSelect(el.currency, base.map(contract => contract.moeda), "Todas as moedas");
  populateSelect(el.type, base.map(contract => displayType(contract.type)), "Todos os tipos");
  if (el.unit) populateSelect(el.unit, base.map(contract => contract.displayUnit), "Todas as Organizações Militares");
}

function lifecycleAllowed(contract) {
  const filter = state.filters.lifecycle;
  if (filter === "current") return contract.lifecycle.code === "active" || contract.lifecycle.code === "no-date";
  if (filter === "ended") return contract.lifecycle.code === "ended";
  return true;
}

function amendmentAllowed(contract) {
  const filter = state.filters.amendment;
  if (!filter) return true;
  if (filter === "overdue") return contract.amendment.code === "overdue";
  if (filter === "due-30") return ["today", "urgent"].includes(contract.amendment.code);
  if (filter === "due-60") return ["today", "urgent", "attention"].includes(contract.amendment.code);
  if (filter === "unknown") return contract.amendment.code === "unknown";
  return true;
}

function filteredContracts() {
  const search = normalizeToken(state.filters.search);
  const records = state.contracts.map(enriched).filter(contract => {
    if (!lifecycleAllowed(contract)) return false;
    if (state.filters.type && displayType(contract.type) !== state.filters.type) return false;
    if (state.filters.currency && contract.moeda !== state.filters.currency) return false;
    if (state.filters.unit && contract.displayUnit !== state.filters.unit) return false;
    if (!amendmentAllowed(contract)) return false;
    if (search) {
      const haystack = normalizeToken([
        contract.numero,
        contract.contrato,
        contract.empresa,
        contract.objetoResumo,
        contract.displayUnit,
        contract.grandComando,
        contract.acao
      ].join(" "));
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const sort = state.filters.sort;
  records.sort((a, b) => {
    if (sort === "contract") return a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
    if (sort === "supplier") return a.empresa.localeCompare(b.empresa, "pt-BR");
    if (sort === "end") return (a.lifecycle.endDate || "9999-12-31").localeCompare(b.lifecycle.endDate || "9999-12-31");
    if (sort === "paid") return b.payment.primaryPaid - a.payment.primaryPaid;
    const aKey = a.amendment.date || "9999-12-31";
    const bKey = b.amendment.date || "9999-12-31";
    return aKey.localeCompare(bKey) || a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
  });
  return records;
}

function lifecycleBadge(contract) {
  return `<span class="acc-badge acc-badge--${contract.lifecycle.code}">${escapeHtml(contract.lifecycle.label)}</span>`;
}

function amendmentBadge(contract) {
  return `<span class="acc-deadline acc-deadline--${contract.amendment.code}">${escapeHtml(contract.amendment.label)}</span>`;
}

function paymentValue(contract) {
  if (!state.paymentLoaded && !state.paymentError) return "Carregando...";
  if (state.paymentError) return "Indisponível";
  return formatMoney(contract.payment.primaryPaid, contract.moeda);
}

function otherCurrencyNote(contract) {
  if (!contract.payment.otherCurrencies.length) return "";
  const values = contract.payment.otherCurrencies.map(item => formatMoney(item.amount, item.currency === "NÃO INFORMADA" ? "" : item.currency)).join(" · ");
  return `<small class="acc-financial-warning">Outras moedas/não informadas: ${escapeHtml(values)}</small>`;
}

function percentage(numerator, denominator) {
  if (!Number.isFinite(Number(numerator)) || !Number.isFinite(Number(denominator)) || Number(denominator) <= 0) return null;
  return Math.max(0, Number(numerator) / Number(denominator) * 100);
}

function formatPercent(value) {
  if (value === null) return "Não calculável";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

function progressBar(label, value, tone = "blue") {
  const width = value === null ? 0 : Math.min(100, Math.max(0, value));
  return `<div class="acc-progress-row"><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatPercent(value))}</strong></div><div class="acc-progress"><i class="acc-progress--${tone}" style="width:${width.toFixed(2)}%"></i></div></div>`;
}

function monthChart(contract) {
  const series = calendarMonthSeries(contract.payment.monthly, referenceIso, 12);
  const maximum = Math.max(...series.map(item => item.amount), 0);
  const bars = series.map(item => {
    const width = maximum > 0 ? item.amount / maximum * 100 : 0;
    return `<div class="acc-month-row"><span>${escapeHtml(item.label)}${item.partial ? " <em>parcial</em>" : ""}</span><div><i style="width:${width.toFixed(2)}%"></i></div><strong>${escapeHtml(formatMoney(item.amount, contract.moeda))}</strong></div>`;
  }).join("");
  return `<div class="acc-month-chart">${bars}</div>`;
}

function paymentRows(contract) {
  const rows = [...contract.payment.paidRecords]
    .sort((a, b) => String(b.paidDate || "").localeCompare(String(a.paidDate || "")))
    .slice(0, 20);
  if (!rows.length) return `<p class="acc-empty-inline">Nenhuma fatura paga foi vinculada a este contrato no Firestore.</p>`;
  return `<div class="acc-payment-table-wrap"><table class="acc-payment-table"><thead><tr><th>Data</th><th>Fatura</th><th>Fornecedor</th><th>Moeda</th><th>Valor bruto</th></tr></thead><tbody>${rows.map(record => `<tr><td>${escapeHtml(formatDate(record.paidDate, "Sem data"))}</td><td>${escapeHtml(record.invoiceNumber || "—")}</td><td>${escapeHtml(record.supplier || contract.empresa || "—")}</td><td>${escapeHtml(record.currency || "N/I")}</td><td>${escapeHtml(formatMoney(record.grossAmount, record.currency))}</td></tr>`).join("")}</tbody></table></div>`;
}

function coverageBlock(contract) {
  if (contract.type !== "CONTINUADO") return "";
  const average = contract.payment.averageLastThree;
  const coverage = contract.coverage.months;
  const usedMonths = contract.payment.averageMonthCount;
  return `<section class="acc-continuous-block"><div class="acc-continuous-heading"><div><span>Contrato continuado</span><h4>Cobertura do saldo empenhado</h4></div><span class="acc-badge acc-badge--continued">Cálculo aplicável</span></div><div class="acc-continuous-kpis"><div><span>Saldo empenhado</span><strong>${escapeHtml(formatMoney(contract.coverage.available, contract.moeda))}</strong><small>Empenhado − faturado</small></div><div><span>Média mensal paga</span><strong>${average === null ? "Não calculável" : escapeHtml(formatMoney(average, contract.moeda))}</strong><small>${usedMonths ? `${usedMonths} mês(es) completo(s) com pagamento` : "Sem meses completos com pagamento"}</small></div><div><span>Meses de cobertura</span><strong>${coverage === null ? "Não calculável" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(coverage)} mês(es)`}</strong><small>Saldo ÷ média mensal bruta</small></div></div><h5>Evolução mensal do valor bruto pago</h5>${monthChart(contract)}</section>`;
}

function qualityWarnings(contract) {
  const warnings = [];
  if (contract.payment.withoutAmount) warnings.push(`${contract.payment.withoutAmount} pagamento(s) marcado(s) como pago(s) sem valor bruto.`);
  if (contract.payment.withoutPaidDate) warnings.push(`${contract.payment.withoutPaidDate} pagamento(s) com valor bruto, mas sem data efetiva de pagamento.`);
  if (contract.payment.otherCurrencies.length) warnings.push("Existem pagamentos vinculados em moeda diferente da moeda contratual ou sem moeda informada; eles não entram no cálculo de cobertura.");
  if (contract.payment.primaryPaid > Number(contract.totalFaturado || 0) && Number(contract.totalFaturado || 0) > 0) warnings.push("O valor bruto pago registrado no Firestore supera o valor faturado constante da base contratual.");
  if (!warnings.length) return "";
  return `<div class="acc-quality"><strong>Pontos de atenção dos dados</strong><ul>${warnings.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
}

function contractCard(contract) {
  const invoicedRate = percentage(contract.totalFaturado, contract.totalEmpenhado);
  const paidRate = percentage(contract.payment.primaryPaid, contract.totalFaturado);
  const start = contract.dataInicio?.br || contract.dataAssinatura?.br || "Não informado";
  const end = contract.dataFinal?.br || "Sem data de vigência";
  const addendum = contract.amendment.date ? formatDate(contract.amendment.date) : "Não calculável";
  const unitLabel = scope === "supported" ? `<span><i class="bi bi-building"></i>${escapeHtml(contract.displayUnit)}</span>` : "";
  const detailsId = `acc-contract-${escapeHtml(String(contract.id))}`;

  return `<article class="acc-contract-card" data-contract-id="${escapeHtml(String(contract.id))}"><header class="acc-contract-header"><div><div class="acc-contract-badges">${lifecycleBadge(contract)}<span class="acc-badge acc-badge--type">${escapeHtml(displayType(contract.type))}</span>${unitLabel}</div><h3>${escapeHtml(contract.numero)}</h3><p>${escapeHtml(contract.empresa || "Fornecedor não informado")}</p></div><div class="acc-contract-currency">${escapeHtml(contract.moeda || "N/I")}</div></header><div class="acc-contract-object"><span>Objeto</span><p>${escapeHtml(contract.objetoResumo || "Não informado")}</p></div><div class="acc-contract-dates"><div><span>Prazo de vigência</span><strong>${escapeHtml(start)} a ${escapeHtml(end)}</strong><small>${contract.lifecycle.daysToEnd === null ? "Data final não informada" : contract.lifecycle.code === "ended" ? `Encerrado há ${Math.abs(contract.lifecycle.daysToEnd)} dia(s)` : `${contract.lifecycle.daysToEnd} dia(s) até o término`}</small></div><div><span>Entrada em Termo Aditivo</span><strong>${escapeHtml(addendum)}</strong>${amendmentBadge(contract)}<small>120 dias antes do término da vigência</small></div></div><div class="acc-financial-grid"><div><span>Valor contratado</span><strong>${escapeHtml(formatMoney(contract.valorContrato, contract.moeda))}</strong></div><div><span>Valor empenhado</span><strong>${escapeHtml(formatMoney(contract.totalEmpenhado, contract.moeda))}</strong></div><div><span>Valor faturado</span><strong>${escapeHtml(formatMoney(contract.totalFaturado, contract.moeda))}</strong></div><div><span>Valor pago — bruto</span><strong>${escapeHtml(paymentValue(contract))}</strong><small>${state.paymentLoaded ? `${contract.payment.paidCount} fatura(s) paga(s) vinculada(s)` : "Fonte: Firestore"}</small>${otherCurrencyNote(contract)}</div></div><div class="acc-progress-grid">${progressBar("Faturado sobre empenhado", invoicedRate, "blue")}${progressBar("Pago sobre faturado", state.paymentLoaded ? paidRate : null, "gold")}</div>${contract.type === "CONTINUADO" ? `<div class="acc-coverage-summary"><div><span>Saldo empenhado disponível</span><strong>${escapeHtml(formatMoney(contract.coverage.available, contract.moeda))}</strong></div><div><span>Média dos últimos meses completos</span><strong>${contract.payment.averageLastThree === null ? "Não calculável" : escapeHtml(formatMoney(contract.payment.averageLastThree, contract.moeda))}</strong></div><div><span>Cobertura estimada</span><strong>${contract.coverage.months === null ? "Não calculável" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(contract.coverage.months)} mês(es)`}</strong></div></div>` : ""}<details class="acc-contract-details" id="${detailsId}"><summary><span><i class="bi bi-graph-up-arrow"></i>Ver evolução e pagamentos vinculados</span><i class="bi bi-chevron-down"></i></summary><div class="acc-contract-details__body">${coverageBlock(contract)}<section><h4>Faturas pagas vinculadas</h4>${paymentRows(contract)}</section>${qualityWarnings(contract)}<p class="acc-source-note"><strong>Fontes:</strong> valores empenhado e faturado da base contratual de 13/08/2026; valor pago bruto da coleção <code>supplierPayments</code> do Firestore, vinculado pelo campo Contrato/PAG.</p></div></details></article>`;
}

function renderSource() {
  if (!el.sourceTitle || !el.sourceInfo) return;
  if (state.paymentError) {
    el.sourceTitle.textContent = "Pagamentos indisponíveis";
    el.sourceInfo.textContent = "Os contratos foram carregados, mas não foi possível consultar a coleção supplierPayments do Firestore.";
    el.sourceCard?.classList.add("is-error");
    return;
  }
  if (!state.paymentLoaded) {
    el.sourceTitle.textContent = "Carregando pagamentos";
    el.sourceInfo.textContent = "A base contratual já está disponível; aguardando retorno do Firestore.";
    return;
  }
  const matched = state.payments.length - state.unmatchedPayments.length;
  el.sourceTitle.textContent = `${matched} registro(s) vinculado(s)`;
  el.sourceInfo.textContent = `${state.payments.length} registro(s) lido(s) no Firestore · ${state.unmatchedPayments.length} sem correspondência contratual.`;
}

function moneyByCurrency(contracts) {
  const totals = new Map();
  contracts.forEach(contract => {
    const value = contract.payment.primaryPaid;
    if (!value) return;
    const currency = contract.moeda || "N/I";
    totals.set(currency, (totals.get(currency) || 0) + value);
  });
  return [...totals.entries()].map(([currency, value]) => formatMoney(value, currency)).join(" · ") || "Sem pagamentos vinculados";
}

function renderKpis(records) {
  const active = records.filter(contract => contract.lifecycle.code === "active").length;
  const noDate = records.filter(contract => contract.lifecycle.code === "no-date").length;
  const ended = records.filter(contract => contract.lifecycle.code === "ended").length;
  const overdue = records.filter(contract => contract.lifecycle.code === "active" && contract.amendment.code === "overdue").length;
  const continued = records.filter(contract => contract.type === "CONTINUADO").length;
  const paidCount = records.reduce((sum, contract) => sum + contract.payment.paidCount, 0);
  const set = (id, value) => { const node = byId(id); if (node) node.textContent = value; };
  set("accKpiDisplayed", String(records.length));
  set("accKpiActive", String(active));
  set("accKpiNoDate", String(noDate));
  set("accKpiEnded", String(ended));
  set("accKpiOverdue", String(overdue));
  set("accKpiContinued", String(continued));
  set("accKpiPaidInvoices", state.paymentLoaded ? String(paidCount) : "—");
  set("accKpiPaidAmount", state.paymentLoaded ? moneyByCurrency(records) : "Carregando...");
}

function render() {
  const records = filteredContracts();
  renderSource();
  renderKpis(records);
  if (el.results) el.results.textContent = `${records.length} contrato(s) exibido(s)`;
  if (!el.cards) return;
  if (!records.length) {
    el.cards.innerHTML = `<div class="acc-empty-state"><i class="bi bi-search"></i><h3>Nenhum contrato encontrado</h3><p>Revise os filtros aplicados ou selecione outra situação de vigência.</p></div>`;
    return;
  }
  el.cards.innerHTML = records.map(contractCard).join("");
}

function readFilters() {
  state.filters.search = el.search?.value || "";
  state.filters.lifecycle = el.lifecycle?.value || "current";
  state.filters.type = el.type?.value || "";
  state.filters.currency = el.currency?.value || "";
  state.filters.unit = el.unit?.value || "";
  state.filters.amendment = el.amendment?.value || "";
  state.filters.sort = el.sort?.value || "amendment";
  render();
}

function clearFilters() {
  if (el.search) el.search.value = "";
  if (el.lifecycle) el.lifecycle.value = "current";
  if (el.type) el.type.value = "";
  if (el.currency) el.currency.value = "";
  if (el.unit) el.unit.value = "";
  if (el.amendment) el.amendment.value = "";
  if (el.sort) el.sort.value = "amendment";
  readFilters();
}

function cacheElements() {
  Object.assign(el, {
    sourceCard: byId("accSourceCard"),
    sourceTitle: byId("accSourceTitle"),
    sourceInfo: byId("accSourceInfo"),
    search: byId("accSearch"),
    lifecycle: byId("accLifecycleFilter"),
    type: byId("accTypeFilter"),
    currency: byId("accCurrencyFilter"),
    unit: byId("accUnitFilter"),
    amendment: byId("accAmendmentFilter"),
    sort: byId("accSortFilter"),
    clear: byId("accClearFilters"),
    cards: byId("accContractCards"),
    results: byId("accResultsInfo")
  });
}

function bindFilters() {
  [el.lifecycle, el.type, el.currency, el.unit, el.amendment, el.sort].forEach(node => node?.addEventListener("change", readFilters));
  el.search?.addEventListener("input", readFilters);
  el.clear?.addEventListener("click", clearFilters);
}

function subscribePayments() {
  return onSnapshot(collection(db, "supplierPayments"), snapshot => {
    state.payments = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
    state.paymentLoaded = true;
    state.paymentError = null;
    groupPayments();
    render();
  }, error => {
    console.error("Falha ao consultar pagamentos para Prestação de Contas.", error);
    state.payments = [];
    state.paymentLoaded = false;
    state.paymentError = error;
    groupPayments();
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  state.contracts = scopeContracts();
  populateFilters();
  bindFilters();
  readFilters();
  onAuthStateChanged(auth, user => {
    if (user) subscribePayments();
  });
});
