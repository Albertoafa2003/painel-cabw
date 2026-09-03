import {
  ANY,
  criterionLabel,
  crossCreditAndRequisitions,
} from "./requisition-core.js";

const CREDIT_URL =
  "assets/data/credit-budget-detailed-current.json?v=20260903-requisitions-data-r2";
const REQUEST_URL =
  "assets/data/requisitions-available-current.json?v=20260903-requisitions-data-r2";

const state = {
  credit: null,
  requests: null,
  rows: [],
  filtered: [],
};

const fields = [
  "crossFilterUg",
  "crossFilterAction",
  "crossFilterPi",
  "crossFilterNature",
  "crossFilterStatus",
  "crossFilterSearch",
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

function addOptions(select, values, labeler = (value) => value) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    select.appendChild(option);
  });
}

function criterionHtml(value, kind) {
  const label = criterionLabel(value, kind);
  if (value !== ANY) return esc(label);
  return `<span class="budget-criterion-any">${esc(label)}</span>`;
}

function hydrate() {
  const ugRows = new Map();
  state.rows.forEach((row) => {
    if (row.ugCode && !ugRows.has(row.ugCode)) ugRows.set(row.ugCode, row);
  });

  addOptions(
    els.crossFilterUg,
    [...ugRows.keys()].sort(),
    (ugCode) => `${ugRows.get(ugCode)?.om || ugCode} — ${ugCode}`,
  );
  addOptions(
    els.crossFilterAction,
    unique(state.rows.map((row) => row.action)),
    (value) => criterionLabel(value, "action"),
  );
  addOptions(
    els.crossFilterPi,
    unique(state.rows.map((row) => row.pi)),
    (value) => criterionLabel(value, "pi"),
  );
  addOptions(
    els.crossFilterNature,
    unique(state.rows.map((row) => row.expenseNature)),
    (value) => criterionLabel(value, "expenseNature"),
  );
  addOptions(
    els.crossFilterStatus,
    unique(state.rows.map((row) => row.status)),
  );
}

function apply() {
  const filters = {
    ug: els.crossFilterUg.value,
    action: els.crossFilterAction.value,
    pi: els.crossFilterPi.value,
    nature: els.crossFilterNature.value,
    status: els.crossFilterStatus.value,
    search: String(els.crossFilterSearch.value || "").toUpperCase(),
  };

  state.filtered = state.rows.filter((row) => {
    if (filters.ug && row.ugCode !== filters.ug) return false;
    if (filters.action && row.action !== filters.action) return false;
    if (filters.pi && row.pi !== filters.pi) return false;
    if (filters.nature && row.expenseNature !== filters.nature) return false;
    if (filters.status && row.status !== filters.status) return false;

    if (filters.search) {
      const searchable = [
        row.ugCode,
        row.om,
        row.ugName,
        criterionLabel(row.action, "action"),
        criterionLabel(row.pi, "pi"),
        criterionLabel(row.expenseNature, "expenseNature"),
        row.requestNumbers?.join(" "),
        row.certames?.join(" "),
        row.vendors?.join(" "),
        row.status,
      ]
        .join(" ")
        .toUpperCase();
      if (!searchable.includes(filters.search)) return false;
    }

    return true;
  });

  render();
}

function statusClass(status) {
  if (status === "Crédito suficiente") return "is-success";
  if (status === "Crédito insuficiente") return "is-warning";
  return "is-danger";
}

function render() {
  const empty = state.filtered.length === 0;
  const body = document.getElementById("crossTableBody");

  body.innerHTML = !empty
    ? state.filtered
        .map(
          (row) => `
            <tr>
              <td>
                <strong>${esc(row.om || row.ugCode)}</strong>
                <small>${esc(row.ugCode)}${
                  row.ugName ? ` — ${esc(row.ugName)}` : ""
                }</small>
              </td>
              <td>
                ${criterionHtml(row.action, "action")}
                <small>${esc(row.actionDescription || "")}</small>
              </td>
              <td>${criterionHtml(row.pi, "pi")}</td>
              <td>${criterionHtml(
                row.expenseNature,
                "expenseNature",
              )}</td>
              <td class="text-right">${row.requestCount.toLocaleString(
                "pt-BR",
              )}</td>
              <td class="text-right budget-money">${money(
                row.requestValue,
              )}</td>
              <td class="text-right budget-money">${money(
                row.committedValue,
              )}</td>
              <td class="text-right budget-money">${money(
                row.balanceToCommit,
              )}</td>
              <td class="text-right budget-money">${money(
                row.creditAvailable,
              )}</td>
              <td class="text-right budget-money">${money(
                row.creditRemaining,
              )}</td>
              <td class="text-right budget-money">${money(row.deficit)}</td>
              <td>${Number(row.coveragePercent || 0).toLocaleString("pt-BR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}%</td>
              <td>
                <span class="budget-status-chip ${statusClass(row.status)}">${esc(
                  row.status,
                )}</span>
                <small>${row.requestNumbers.length.toLocaleString(
                  "pt-BR",
                )} BAC# agrupados</small>
              </td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="13"><div class="budget-empty-state"><i class="bi bi-search"></i><strong>Nenhum cruzamento encontrado</strong><span>Revise os filtros aplicados.</span></div></td></tr>`;

  renderOm();

  const demand = state.filtered.reduce(
    (sum, row) => sum + row.balanceToCommit,
    0,
  );
  const credit = state.filtered.reduce(
    (sum, row) => sum + row.creditAvailable,
    0,
  );
  const remaining = state.filtered.reduce(
    (sum, row) => sum + row.creditRemaining,
    0,
  );
  const deficit = state.filtered.reduce((sum, row) => sum + row.deficit, 0);
  const requests = state.filtered.reduce(
    (sum, row) => sum + row.requestCount,
    0,
  );

  document.getElementById("crossKpiDemand").textContent = money(demand);
  document.getElementById("crossKpiCredit").textContent = money(credit);
  document.getElementById("crossKpiRemaining").textContent = money(remaining);
  document.getElementById("crossKpiDeficit").textContent = money(deficit);
  document.getElementById("crossKpiRequests").textContent =
    requests.toLocaleString("pt-BR");
  document.getElementById("crossKeyCount").textContent =
    `${state.filtered.length.toLocaleString("pt-BR")} grupos`;
  document.getElementById("crossPdf").disabled = empty;
}

function renderOm() {
  const map = new Map();

  state.filtered.forEach((row) => {
    const key = row.ugCode || row.om || "Não informado";
    if (!map.has(key)) {
      map.set(key, {
        ugCode: row.ugCode,
        om: row.om,
        ugName: row.ugName,
        requestCount: 0,
        balance: 0,
        credit: 0,
        remaining: 0,
        deficit: 0,
      });
    }

    const group = map.get(key);
    group.requestCount += row.requestCount;
    group.balance += row.balanceToCommit;
    group.credit += row.creditAvailable;
    group.remaining += row.creditRemaining;
    group.deficit += row.deficit;
  });

  const rows = [...map.values()].sort((a, b) => b.balance - a.balance);

  document.getElementById("crossOmBody").innerHTML = rows.length
    ? rows
        .map(
          (group) => `
            <tr>
              <td>
                <strong>${esc(group.om || group.ugCode)}</strong>
                <small>${esc(group.ugCode)}${
                  group.ugName ? ` — ${esc(group.ugName)}` : ""
                }</small>
              </td>
              <td class="text-right">${group.requestCount.toLocaleString(
                "pt-BR",
              )}</td>
              <td class="text-right budget-money">${money(group.balance)}</td>
              <td class="text-right budget-money">${money(group.credit)}</td>
              <td class="text-right budget-money">${money(
                group.remaining,
              )}</td>
              <td class="text-right budget-money">${money(group.deficit)}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="6"><div class="budget-empty-state"><strong>Nenhuma OM para exibir</strong></div></td></tr>`;

  document.getElementById("crossOmCount").textContent =
    `${rows.length.toLocaleString("pt-BR")} OMs`;
}

function clear() {
  fields.forEach((id) => {
    if (els[id]) els[id].value = "";
  });
  apply();
}

function exportPdf() {
  if (!window.jspdf?.jsPDF || !state.filtered.length) return;

  const doc = new window.jspdf.jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a3",
  });

  doc.setFontSize(18);
  doc.text("Crédito Disponível x Requisições", 14, 16);
  doc.setFontSize(9);
  doc.text(
    "OM/UG é obrigatória. Ação, PI e Natureza em branco abrangem qualquer classificação da OM, sem dupla contagem do crédito.",
    14,
    23,
  );

  doc.autoTable({
    startY: 29,
    head: [
      [
        "OM/UG",
        "Ação",
        "PI",
        "Natureza",
        "Req.",
        "Saldo a empenhar",
        "Crédito compatível",
        "Remanescente",
        "Déficit",
        "Cobertura",
        "Situação",
      ],
    ],
    body: state.filtered.map((row) => [
      `${row.om} / ${row.ugCode}`,
      criterionLabel(row.action, "action"),
      criterionLabel(row.pi, "pi"),
      criterionLabel(row.expenseNature, "expenseNature"),
      String(row.requestCount),
      money(row.balanceToCommit),
      money(row.creditAvailable),
      money(row.creditRemaining),
      money(row.deficit),
      `${Number(row.coveragePercent || 0).toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      })}%`,
      row.status,
    ]),
    styles: { fontSize: 7, cellPadding: 1.7 },
    headStyles: { fillColor: [6, 46, 102] },
  });

  doc.save("credito-x-requisicoes-01092026.pdf");
}

async function init() {
  const status = document.getElementById("crossStatus");

  try {
    const [creditResponse, requestResponse] = await Promise.all([
      fetch(CREDIT_URL, { cache: "no-store" }),
      fetch(REQUEST_URL, { cache: "no-store" }),
    ]);

    if (!creditResponse.ok || !requestResponse.ok) {
      throw new Error("Falha ao carregar bases");
    }

    state.credit = await creditResponse.json();
    state.requests = await requestResponse.json();
    state.rows = crossCreditAndRequisitions(
      state.credit.groupedByMatchKey || state.credit.records || [],
      state.requests.records || [],
    );

    document.getElementById("crossSource").textContent =
      `Crédito: ${state.credit.metadata.groupedKeyCount} chaves / ` +
      `${state.credit.metadata.totalCreditAvailableText} · ` +
      `Requisições: ${state.requests.metadata.recordCount} registros / ` +
      `${money(state.requests.metadata.balanceToCommitTotal)} a empenhar`;

    hydrate();
    apply();

    const sufficient = state.rows.filter(
      (row) => row.status === "Crédito suficiente",
    ).length;
    const deficit = state.rows.reduce((sum, row) => sum + row.deficit, 0);

    status.textContent =
      `Cruzamento concluído: ${state.requests.metadata.recordCount} requisições ` +
      `agrupadas em ${state.rows.length} combinações; ${sufficient} com crédito ` +
      `suficiente e déficit total de ${money(deficit)}.`;
    status.dataset.status = deficit > 0 ? "warning" : "success";
  } catch (error) {
    console.error(error);
    status.textContent = "Não foi possível carregar as bases do cruzamento.";
    status.dataset.status = "error";
  }
}

fields.forEach((id) =>
  els[id]?.addEventListener(
    id === "crossFilterSearch" ? "input" : "change",
    apply,
  ),
);
document.getElementById("crossClear")?.addEventListener("click", clear);
document.getElementById("crossPdf")?.addEventListener("click", exportPdf);

init();
