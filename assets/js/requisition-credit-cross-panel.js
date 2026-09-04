import {
  ANY,
  buildDetailedCrossReportData,
  criterionLabel,
  crossCreditAndRequisitions,
} from "./requisition-core.js?v=20260904-requisitions-natures-r4";

const CREDIT_URL =
  "assets/data/credit-budget-detailed-current.json?v=20260904-requisitions-natures-r4";
const REQUEST_URL =
  "assets/data/requisitions-available-current.json?v=20260904-requisitions-natures-r4";

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



function formatDate(value) {
  if (!value) return "Não informada";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("pt-BR");
}

function percent(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function listText(values, fallback = "Não informado") {
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  return list.length ? list.join(", ") : fallback;
}

function selectedOptionText(select) {
  if (!select || !select.value) return "";
  return select.options[select.selectedIndex]?.textContent?.trim() || select.value;
}

function activeFilterDescriptions() {
  const descriptions = [
    ["OM / UG", selectedOptionText(els.crossFilterUg)],
    ["Ação", selectedOptionText(els.crossFilterAction)],
    ["PI", selectedOptionText(els.crossFilterPi)],
    ["Natureza", selectedOptionText(els.crossFilterNature)],
    ["Situação", selectedOptionText(els.crossFilterStatus)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);

  const search = String(els.crossFilterSearch?.value || "").trim();
  if (search) descriptions.push(`Busca geral: ${search}`);
  return descriptions.length ? descriptions : ["Nenhum filtro adicional aplicado"];
}

function requestSituation(request) {
  const operational = request.status || "Disponível para empenho";
  return `${operational} · ${request.crossStatus}`;
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

  const report = buildDetailedCrossReportData(
    state.filtered,
    state.requests?.records || [],
  );
  if (!report.requests.length) return;

  const doc = new window.jspdf.jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a3",
  });
  doc.setProperties({
    title: "Relatório Detalhado — Crédito Disponível x Requisições",
    subject: "Compatibilidade orçamentária das requisições disponíveis para empenho",
    author: "Painel CABW",
    creator: "Painel CABW",
  });

  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;
  const generatedAt = new Date().toLocaleString("pt-BR");
  const filters = activeFilterDescriptions().join(" · ");
  const creditPosition = state.credit?.metadata?.position || "Não informada";
  const requestPosition = state.requests?.metadata?.position || "Não informada";

  const tableBase = {
    theme: "grid",
    margin: { left: marginX, right: marginX, top: 14, bottom: 14 },
    styles: {
      fontSize: 7,
      cellPadding: 1.6,
      overflow: "linebreak",
      valign: "middle",
      lineColor: [205, 214, 226],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [6, 46, 102],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    alternateRowStyles: { fillColor: [247, 249, 252] },
  };

  let y = 16;
  doc.setTextColor(6, 46, 102);
  doc.setFontSize(18);
  doc.text("Relatório Detalhado — Crédito Disponível x Requisições", marginX, y);
  y += 7;

  doc.setTextColor(55, 70, 92);
  doc.setFontSize(9);
  doc.text(
    `Posição do crédito: ${creditPosition} · Posição das requisições: ${requestPosition}`,
    marginX,
    y,
  );
  y += 5;

  const methodology =
    "Metodologia: a OM/UG e a Natureza de Despesa são obrigatórias na base atual; " +
    "Ação e PI em branco abrangem qualquer classificação da respectiva OM. O crédito " +
    "é consumido uma única vez e somente dentro da mesma OM e Natureza. Por esse motivo, " +
    "crédito compatível, valor remanescente e déficit são apresentados no nível da OM " +
    "e do agrupamento orçamentário, enquanto cada BAC# é detalhado individualmente " +
    "com seu valor e saldo a empenhar.";
  const methodologyLines = doc.splitTextToSize(methodology, usableWidth);
  doc.text(methodologyLines, marginX, y);
  y += methodologyLines.length * 4 + 2;

  const filterLines = doc.splitTextToSize(`Filtros: ${filters}`, usableWidth);
  doc.text(filterLines, marginX, y);
  y += filterLines.length * 4 + 3;

  doc.autoTable({
    ...tableBase,
    startY: y,
    head: [["Indicador", "Valor", "Indicador", "Valor"]],
    body: [
      [
        "Organizações Militares",
        String(report.omSummaries.length),
        "Requisições",
        String(report.totals.requestCount),
      ],
      [
        "Valor das requisições",
        money(report.totals.requestValue),
        "Valor já empenhado",
        money(report.totals.committedValue),
      ],
      [
        "Saldo a empenhar",
        money(report.totals.balanceToCommit),
        "Crédito compatível",
        money(report.totals.creditAvailable),
      ],
      [
        "Crédito remanescente",
        money(report.totals.creditRemaining),
        "Déficit",
        money(report.totals.deficit),
      ],
      [
        "Cobertura global",
        percent(report.totals.coveragePercent),
        "Grupos orçamentários",
        String(report.groups.length),
      ],
    ],
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { halign: "right", cellWidth: 45 },
      2: { fontStyle: "bold", cellWidth: 55 },
      3: { halign: "right", cellWidth: 45 },
    },
  });

  y = doc.lastAutoTable.finalY + 8;
  doc.setTextColor(6, 46, 102);
  doc.setFontSize(12);
  doc.text("Resumo por Organização Militar", marginX, y);

  doc.autoTable({
    ...tableBase,
    startY: y + 3,
    head: [[
      "OM / UG",
      "Req.",
      "Valor das requisições",
      "Já empenhado",
      "Saldo a empenhar",
      "Crédito compatível",
      "Remanescente",
      "Déficit",
      "Cobertura",
      "Situação",
    ]],
    body: report.omSummaries.map((om) => [
      `${om.om || om.ugCode} / ${om.ugCode}`,
      String(om.requestCount),
      money(om.requestValue),
      money(om.committedValue),
      money(om.balanceToCommit),
      money(om.creditAvailable),
      money(om.creditRemaining),
      money(om.deficit),
      percent(om.coveragePercent),
      om.status,
    ]),
    columnStyles: {
      0: { cellWidth: 39 },
      1: { halign: "right", cellWidth: 14 },
      2: { halign: "right", cellWidth: 34 },
      3: { halign: "right", cellWidth: 29 },
      4: { halign: "right", cellWidth: 31 },
      5: { halign: "right", cellWidth: 32 },
      6: { halign: "right", cellWidth: 30 },
      7: { halign: "right", cellWidth: 27 },
      8: { halign: "right", cellWidth: 22 },
      9: { cellWidth: 38 },
    },
  });

  report.omSummaries.forEach((om) => {
    doc.addPage("a3", "landscape");
    let sectionY = 16;

    doc.setTextColor(6, 46, 102);
    doc.setFontSize(16);
    doc.text(
      `${om.om || om.ugCode} — UG ${om.ugCode || "não informada"}`,
      marginX,
      sectionY,
    );
    sectionY += 6;

    doc.setTextColor(80, 92, 110);
    doc.setFontSize(9);
    const omNameLines = doc.splitTextToSize(
      om.ugName || "Organização Militar sem denominação informada",
      usableWidth,
    );
    doc.text(omNameLines, marginX, sectionY);
    sectionY += omNameLines.length * 4 + 3;

    doc.autoTable({
      ...tableBase,
      startY: sectionY,
      head: [[
        "Requisições",
        "Valor",
        "Já empenhado",
        "Saldo a empenhar",
        "Crédito compatível",
        "Remanescente",
        "Déficit",
        "Cobertura",
        "Situação",
      ]],
      body: [[
        String(om.requestCount),
        money(om.requestValue),
        money(om.committedValue),
        money(om.balanceToCommit),
        money(om.creditAvailable),
        money(om.creditRemaining),
        money(om.deficit),
        percent(om.coveragePercent),
        om.status,
      ]],
      columnStyles: {
        0: { halign: "right", cellWidth: 23 },
        1: { halign: "right", cellWidth: 34 },
        2: { halign: "right", cellWidth: 31 },
        3: { halign: "right", cellWidth: 34 },
        4: { halign: "right", cellWidth: 34 },
        5: { halign: "right", cellWidth: 32 },
        6: { halign: "right", cellWidth: 28 },
        7: { halign: "right", cellWidth: 24 },
        8: { cellWidth: 45 },
      },
    });

    sectionY = doc.lastAutoTable.finalY + 7;
    doc.setTextColor(6, 46, 102);
    doc.setFontSize(12);
    doc.text("Requisições da Organização Militar", marginX, sectionY);

    doc.autoTable({
      ...tableBase,
      startY: sectionY + 3,
      head: [[
        "Requisição",
        "Certame",
        "Ação",
        "PI",
        "Natureza",
        "Vencedor",
        "Validade",
        "Valor da requisição",
        "Já empenhado",
        "Saldo a empenhar",
        "Situação",
      ]],
      body: om.requests.map((request) => [
        request.requestNumber,
        request.certame || "Não informado",
        criterionLabel(request.action, "action"),
        criterionLabel(request.pi, "pi"),
        criterionLabel(request.expenseNature, "expenseNature"),
        request.vendorCode
          ? `${request.vendorCode} — ${request.vendor}`
          : request.vendor || "Não informado",
        formatDate(request.proposalValidityDate),
        money(request.requestValue),
        money(request.committedValue),
        money(request.balanceToCommit),
        requestSituation(request),
      ]),
      styles: { ...tableBase.styles, fontSize: 6.2, cellPadding: 1.35 },
      columnStyles: {
        0: { cellWidth: 29 },
        1: { cellWidth: 20 },
        2: { cellWidth: 25 },
        3: { cellWidth: 24 },
        4: { cellWidth: 23 },
        5: { cellWidth: 51 },
        6: { cellWidth: 22 },
        7: { halign: "right", cellWidth: 31 },
        8: { halign: "right", cellWidth: 28 },
        9: { halign: "right", cellWidth: 30 },
        10: { cellWidth: 49 },
      },
    });

    sectionY = doc.lastAutoTable.finalY + 7;
    if (sectionY > pageHeight - 65) {
      doc.addPage("a3", "landscape");
      sectionY = 16;
    }

    doc.setTextColor(6, 46, 102);
    doc.setFontSize(12);
    doc.text("Composição do crédito compatível", marginX, sectionY);

    doc.autoTable({
      ...tableBase,
      startY: sectionY + 3,
      head: [[
        "Ação solicitada",
        "PI solicitado",
        "Natureza solicitada",
        "Ações encontradas",
        "PIs encontrados",
        "Naturezas encontradas",
        "PTRES",
        "Fontes",
        "Crédito compatível",
        "Remanescente",
        "Déficit",
        "Situação",
      ]],
      body: om.groups.map((group) => [
        criterionLabel(group.action, "action"),
        criterionLabel(group.pi, "pi"),
        criterionLabel(group.expenseNature, "expenseNature"),
        listText(group.matchedActions),
        listText(group.matchedPis),
        listText(group.matchedNatures),
        listText(group.ptres),
        listText(group.fundingSources),
        money(group.creditAvailable),
        money(group.creditRemaining),
        money(group.deficit),
        group.status,
      ]),
      styles: { ...tableBase.styles, fontSize: 5.7, cellPadding: 1.2 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 25 },
        2: { cellWidth: 25 },
        3: { cellWidth: 38 },
        4: { cellWidth: 58 },
        5: { cellWidth: 34 },
        6: { cellWidth: 26 },
        7: { cellWidth: 35 },
        8: { halign: "right", cellWidth: 30 },
        9: { halign: "right", cellWidth: 29 },
        10: { halign: "right", cellWidth: 24 },
        11: { cellWidth: 35 },
      },
    });
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(205, 214, 226);
    doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);
    doc.setTextColor(90, 102, 120);
    doc.setFontSize(7);
    doc.text(`Gerado em ${generatedAt}`, marginX, pageHeight - 6);
    doc.text(
      `Página ${page} de ${pageCount}`,
      pageWidth - marginX,
      pageHeight - 6,
      { align: "right" },
    );
  }

  doc.save("relatorio-detalhado-credito-x-requisicoes-04092026.pdf");

  const status = document.getElementById("crossStatus");
  if (status) {
    status.textContent =
      `Relatório detalhado gerado: ${report.totals.requestCount} requisições ` +
      `de ${report.omSummaries.length} Organizações Militares.`;
    status.dataset.status = "success";
  }
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
