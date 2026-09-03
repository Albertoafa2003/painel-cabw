import {
  ANY,
  criterionLabel,
  normalizeRequisition,
} from "./requisition-core.js";

const DATA_URL =
  "assets/data/requisitions-available-current.json?v=20260903-requisitions-data-r2";

const state = {
  data: null,
  records: [],
  filtered: [],
};

const fields = [
  "reqFilterUg",
  "reqFilterAction",
  "reqFilterPi",
  "reqFilterNature",
  "reqFilterStatus",
  "reqFilterSearch",
];

const els = Object.fromEntries(
  fields.map((id) => [id, document.getElementById(id)]),
);

function money(value) {
  return (
    "US$ " +
    Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), "pt-BR", { numeric: true }),
  );
}

function formatDate(value) {
  if (!value) return "Não informada";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function criterionHtml(value, kind) {
  const label = criterionLabel(value, kind);
  if (value !== ANY) return esc(label);
  return `<span class="budget-criterion-any">${esc(label)}</span>`;
}

function addOptions(select, values, labeler = (value) => value) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    select.appendChild(option);
  });
}

function hydrate() {
  const ugRecords = new Map();
  state.records.forEach((record) => {
    if (record.ugCode && !ugRecords.has(record.ugCode)) {
      ugRecords.set(record.ugCode, record);
    }
  });

  addOptions(
    els.reqFilterUg,
    [...ugRecords.keys()].sort(),
    (ugCode) => {
      const record = ugRecords.get(ugCode);
      return `${record?.om || ugCode} — ${ugCode}`;
    },
  );

  addOptions(
    els.reqFilterAction,
    unique(state.records.map((record) => record.action)),
    (value) => criterionLabel(value, "action"),
  );
  addOptions(
    els.reqFilterPi,
    unique(state.records.map((record) => record.pi)),
    (value) => criterionLabel(value, "pi"),
  );
  addOptions(
    els.reqFilterNature,
    unique(state.records.map((record) => record.expenseNature)),
    (value) => criterionLabel(value, "expenseNature"),
  );
  addOptions(
    els.reqFilterStatus,
    unique(state.records.map((record) => record.status)),
  );
}

function apply() {
  const filters = {
    ug: els.reqFilterUg.value,
    action: els.reqFilterAction.value,
    pi: els.reqFilterPi.value,
    nature: els.reqFilterNature.value,
    status: els.reqFilterStatus.value,
    search: String(els.reqFilterSearch.value || "").toUpperCase(),
  };

  state.filtered = state.records.filter((record) => {
    if (filters.ug && record.ugCode !== filters.ug) return false;
    if (filters.action && record.action !== filters.action) return false;
    if (filters.pi && record.pi !== filters.pi) return false;
    if (filters.nature && record.expenseNature !== filters.nature) return false;
    if (filters.status && record.status !== filters.status) return false;

    if (filters.search) {
      const searchable = [
        record.requestNumber,
        record.certame,
        record.ugCode,
        record.om,
        record.ugName,
        criterionLabel(record.action, "action"),
        criterionLabel(record.pi, "pi"),
        criterionLabel(record.expenseNature, "expenseNature"),
        record.vendorCode,
        record.vendor,
        record.status,
      ]
        .join(" ")
        .toUpperCase();
      if (!searchable.includes(filters.search)) return false;
    }

    return true;
  });

  render();
}

function render() {
  const body = document.getElementById("reqTableBody");

  body.innerHTML = state.filtered.length
    ? state.filtered
        .map(
          (record) => `
            <tr>
              <td>
                <strong>${esc(record.requestNumber)}</strong>
                <small>Certame ${esc(record.certame || "não informado")}</small>
                <small>${esc(
                  record.vendorCode
                    ? `${record.vendorCode} — ${record.vendor}`
                    : record.vendor || "Vencedor não informado",
                )}</small>
              </td>
              <td>
                <strong>${esc(record.om || record.ugCode)}</strong>
                <small>${esc(record.ugCode)} — ${esc(record.ugName)}</small>
              </td>
              <td>${criterionHtml(record.action, "action")}</td>
              <td>${criterionHtml(record.pi, "pi")}</td>
              <td>${criterionHtml(
                record.expenseNature,
                "expenseNature",
              )}</td>
              <td class="text-right budget-money">${money(
                record.requestValue,
              )}</td>
              <td class="text-right budget-money">${money(
                record.committedValue,
              )}</td>
              <td class="text-right budget-money">${money(
                record.balanceToCommit,
              )}</td>
              <td>
                <span class="budget-status-chip">${esc(record.status)}</span>
                <small>Proposta válida até ${esc(
                  formatDate(record.proposalValidityDate),
                )}</small>
              </td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="9"><div class="budget-empty-state"><i class="bi bi-search"></i><strong>Nenhuma requisição encontrada</strong><span>Revise os filtros aplicados.</span></div></td></tr>`;

  const requestValue = state.filtered.reduce(
    (sum, record) => sum + record.requestValue,
    0,
  );
  const committedValue = state.filtered.reduce(
    (sum, record) => sum + record.committedValue,
    0,
  );
  const balance = state.filtered.reduce(
    (sum, record) => sum + record.balanceToCommit,
    0,
  );

  document.getElementById("reqKpiValue").textContent = money(requestValue);
  document.getElementById("reqKpiCommitted").textContent =
    money(committedValue);
  document.getElementById("reqKpiBalance").textContent = money(balance);
  document.getElementById("reqKpiCount").textContent =
    state.filtered.length.toLocaleString("pt-BR");
  document.getElementById("reqKpiOms").textContent = new Set(
    state.filtered.map((record) => record.ugCode || record.om),
  ).size.toLocaleString("pt-BR");
  document.getElementById("reqRecordCount").textContent =
    `${state.filtered.length.toLocaleString("pt-BR")} registros`;

  const disabled = !state.filtered.length;
  document.getElementById("reqCsv").disabled = disabled;
  document.getElementById("reqPdf").disabled = disabled;
}

function clear() {
  fields.forEach((id) => {
    if (els[id]) els[id].value = "";
  });
  apply();
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
  const rows = [
    [
      "Número da Requisição",
      "Certame",
      "UG",
      "OM",
      "Ação",
      "PI",
      "Natureza",
      "Vencedor",
      "Validade da Proposta",
      "Valor da Requisição",
      "Valor Já Empenhado",
      "Saldo a Empenhar",
      "Situação",
    ],
    ...state.filtered.map((record) => [
      record.requestNumber,
      record.certame,
      record.ugCode,
      record.om,
      criterionLabel(record.action, "action"),
      criterionLabel(record.pi, "pi"),
      criterionLabel(record.expenseNature, "expenseNature"),
      record.vendorCode
        ? `${record.vendorCode} - ${record.vendor}`
        : record.vendor,
      formatDate(record.proposalValidityDate),
      record.requestValue.toFixed(2),
      record.committedValue.toFixed(2),
      record.balanceToCommit.toFixed(2),
      record.status,
    ]),
  ];

  const blob = new Blob(
    ["\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = "requisicoes-disponiveis-empenho-01092026.csv";
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function exportPdf() {
  if (!window.jspdf?.jsPDF || !state.filtered.length) return;

  const doc = new window.jspdf.jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a3",
  });

  doc.setFontSize(18);
  doc.text("Requisições Disponíveis para Empenho", 14, 16);
  doc.setFontSize(9);
  doc.text(
    "Posição: 01/09/2026 · Campos orçamentários em branco significam qualquer classificação da OM.",
    14,
    23,
  );

  doc.autoTable({
    startY: 29,
    head: [
      [
        "Requisição",
        "Certame",
        "OM/UG",
        "Ação",
        "PI",
        "Natureza",
        "Vencedor",
        "Validade",
        "Valor",
        "Empenhado",
        "Saldo",
        "Situação",
      ],
    ],
    body: state.filtered.map((record) => [
      record.requestNumber,
      record.certame,
      `${record.om} / ${record.ugCode}`,
      criterionLabel(record.action, "action"),
      criterionLabel(record.pi, "pi"),
      criterionLabel(record.expenseNature, "expenseNature"),
      record.vendorCode
        ? `${record.vendorCode} - ${record.vendor}`
        : record.vendor,
      formatDate(record.proposalValidityDate),
      money(record.requestValue),
      money(record.committedValue),
      money(record.balanceToCommit),
      record.status,
    ]),
    styles: { fontSize: 6.5, cellPadding: 1.5 },
    headStyles: { fillColor: [6, 46, 102] },
    columnStyles: {
      0: { cellWidth: 27 },
      1: { cellWidth: 18 },
      2: { cellWidth: 25 },
      6: { cellWidth: 49 },
    },
  });

  doc.save("requisicoes-disponiveis-empenho-01092026.pdf");
}

async function init() {
  const status = document.getElementById("reqStatus");
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    state.data = await response.json();
    state.records = (state.data.records || []).map(normalizeRequisition);

    const metadata = state.data.metadata || {};
    document.getElementById("requisitionSource").textContent =
      `${metadata.message || `${state.records.length} registros carregados`} ` +
      `· Fonte: ${metadata.sourceFile || "não informada"}`;

    hydrate();
    apply();

    status.textContent =
      `${state.records.length.toLocaleString("pt-BR")} requisições carregadas, ` +
      `com saldo total a empenhar de ${money(
        metadata.balanceToCommitTotal,
      )}.`;
    status.dataset.status = "success";
  } catch (error) {
    console.error(error);
    status.textContent = "Não foi possível carregar a base de requisições.";
    status.dataset.status = "error";
  }
}

fields.forEach((id) =>
  els[id]?.addEventListener(
    id === "reqFilterSearch" ? "input" : "change",
    apply,
  ),
);
document.getElementById("reqClear")?.addEventListener("click", clear);
document.getElementById("reqCsv")?.addEventListener("click", exportCsv);
document.getElementById("reqPdf")?.addEventListener("click", exportPdf);

init();
