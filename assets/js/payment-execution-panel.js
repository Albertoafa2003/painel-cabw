(function () {
  "use strict";

  const DATA_URL = "assets/data/payment-execution-current.json?v=20260901-payments-data-final-r2";
  const MAX_CHART_ITEMS = 15;
  const state = {
    metadata: null,
    records: [],
    filtered: [],
    sortKey: "valor",
    sortDirection: -1
  };

  const byId = id => document.getElementById(id);
  const elements = {};
  const numberFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const integerFormatter = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0
  });

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[character]));
  }

  function normalizeSearch(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .trim();
  }

  function formatValue(value) {
    return numberFormatter.format(Number(value) || 0);
  }

  function formatInteger(value) {
    return integerFormatter.format(Number(value) || 0);
  }

  function favoredLabel(record) {
    return [record.favCod, record.fav].filter(Boolean).join(" - ") || "Não informado";
  }

  function piLabel(record) {
    return [record.piCod, record.pi].filter(Boolean).join(" - ") || "Não informado";
  }

  function actionLabel(record) {
    return [record.acaoCod, record.acao].filter(Boolean).join(" - ") || "Não informado";
  }

  function normalizeRecord(record) {
    return {
      ne: String(record?.ne ?? "").trim(),
      favCod: String(record?.favCod ?? "").trim(),
      fav: String(record?.fav ?? "").trim(),
      acaoCod: String(record?.acaoCod ?? "").trim(),
      acao: String(record?.acao ?? "").trim(),
      piCod: String(record?.piCod ?? "").trim(),
      pi: String(record?.pi ?? "").trim(),
      valor: Number.isFinite(Number(record?.valor)) ? Number(record.valor) : 0
    };
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" })
    );
  }

  function populateSelect(element, values, allLabel) {
    if (!element) return;
    const previous = element.value;
    const options = uniqueSorted(values);
    element.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>`
      + options.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    if (options.includes(previous)) element.value = previous;
  }

  function populateFilters() {
    populateSelect(elements.favoredFilter, state.records.map(record => record.fav), "Todos os favorecidos");
    populateSelect(elements.piFilter, state.records.map(piLabel), "Todos os PIs");
    populateSelect(elements.actionFilter, state.records.map(actionLabel), "Todas as ações");
  }

  function matchesFilters(record) {
    const favored = elements.favoredFilter?.value || "";
    const pi = elements.piFilter?.value || "";
    const action = elements.actionFilter?.value || "";
    const search = normalizeSearch(elements.searchFilter?.value || "");

    if (favored && record.fav !== favored) return false;
    if (pi && piLabel(record) !== pi) return false;
    if (action && actionLabel(record) !== action) return false;
    if (!search) return true;

    return normalizeSearch([
      record.ne,
      record.favCod,
      record.fav,
      record.acaoCod,
      record.acao,
      record.piCod,
      record.pi
    ].join(" ")).includes(search);
  }

  function groupSum(records, labelFunction) {
    const totals = new Map();
    records.forEach(record => {
      const label = labelFunction(record) || "Não informado";
      totals.set(label, (totals.get(label) || 0) + (Number(record.valor) || 0));
    });
    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
  }

  function deadlineFreeFilterSummary() {
    const parts = [];
    if (elements.favoredFilter?.value) parts.push(`Favorecido: ${elements.favoredFilter.value}`);
    if (elements.piFilter?.value) parts.push(`PI: ${elements.piFilter.value}`);
    if (elements.actionFilter?.value) parts.push(`Ação: ${elements.actionFilter.value}`);
    if (elements.searchFilter?.value.trim()) parts.push(`Busca: ${elements.searchFilter.value.trim()}`);
    return parts.length ? parts.join(" | ") : "Sem filtros aplicados";
  }

  function renderMetadata() {
    const metadata = state.metadata || {};
    if (elements.sourceTitle) elements.sourceTitle.textContent = metadata.sourceFileName || "Base incorporada";
    if (elements.sourceInfo) {
      const reference = metadata.accountingReferenceDate
        ? `posição ${metadata.accountingReferenceDate}`
        : "data contábil não informada";
      elements.sourceInfo.textContent = `${formatInteger(metadata.recordCount)} lançamentos · ${formatInteger(metadata.distinctNes)} NEs · ${reference}.`;
    }
    if (elements.qualityInfo) {
      elements.qualityInfo.textContent = `${formatInteger(metadata.zeroValueRows)} lançamento(s) com valor 0,00 foram preservados conforme a fonte. ${metadata.currencyNote || ""}`;
    }
  }

  function renderKpis(records) {
    const total = Math.round(records.reduce((sum, record) => sum + (Number(record.valor) || 0), 0) * 100) / 100;
    const distinctNes = new Set(records.map(record => record.ne).filter(Boolean)).size;
    const distinctFavored = new Set(records.map(record => record.fav).filter(Boolean)).size;
    const distinctPis = new Set(records.map(record => record.piCod).filter(Boolean)).size;
    const distinctActions = new Set(records.map(record => record.acaoCod).filter(Boolean)).size;

    elements.kpiValue.textContent = formatValue(total);
    elements.kpiRows.textContent = formatInteger(records.length);
    elements.kpiNes.textContent = formatInteger(distinctNes);
    elements.kpiFavored.textContent = formatInteger(distinctFavored);
    elements.kpiPis.textContent = formatInteger(distinctPis);
    elements.kpiActions.textContent = formatInteger(distinctActions);
  }

  function plotEmpty(elementId, message) {
    const container = byId(elementId);
    if (!container) return;
    if (window.Plotly) {
      window.Plotly.react(container, [], {
        annotations: [{ text: message, showarrow: false, x: 0.5, y: 0.5, xref: "paper", yref: "paper", font: { color: "#637083", size: 14 } }],
        xaxis: { visible: false },
        yaxis: { visible: false },
        margin: { l: 20, r: 20, t: 20, b: 20 },
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff"
      }, { responsive: true, displaylogo: false, displayModeBar: false });
    } else {
      container.innerHTML = `<div class="pay-exec-chart-empty">${escapeHtml(message)}</div>`;
    }
  }

  function plotHorizontalBars(elementId, items, maxItems = MAX_CHART_ITEMS) {
    const selected = items.slice(0, maxItems).reverse();
    if (!selected.length) {
      plotEmpty(elementId, "Nenhum registro no filtro atual");
      return;
    }
    const container = byId(elementId);
    if (!container) return;
    if (!window.Plotly) {
      container.innerHTML = selected.slice().reverse().map(item => `
        <div class="pay-exec-fallback-bar">
          <span>${escapeHtml(item.label)}</span><strong>${formatValue(item.value)}</strong>
        </div>`).join("");
      return;
    }

    const mobile = window.matchMedia("(max-width: 767.98px)").matches;
    window.Plotly.react(container, [{
      type: "bar",
      orientation: "h",
      y: selected.map(item => item.label),
      x: selected.map(item => item.value),
      text: selected.map(item => formatValue(item.value)),
      textposition: "auto",
      cliponaxis: false,
      marker: { color: "#0a4d91", line: { color: "#003676", width: 0.7 } },
      hovertemplate: "%{y}<br>Valor: %{x:,.2f}<extra></extra>"
    }], {
      margin: { l: mobile ? 140 : 250, r: 32, t: 10, b: 50 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      font: { family: "Montserrat, Arial, sans-serif", color: "#17375e", size: mobile ? 9 : 11 },
      xaxis: { gridcolor: "#e6ecf3", zerolinecolor: "#d4dde7", title: "Valor (moeda não informada)", tickformat: ",.2f" },
      yaxis: { automargin: true },
      bargap: 0.25
    }, { responsive: true, displaylogo: false, displayModeBar: false, locale: "pt-BR" });
  }

  function renderCharts(records) {
    plotHorizontalBars("payExecFavoredChart", groupSum(records, favoredLabel), 15);
    plotHorizontalBars("payExecPiChart", groupSum(records, piLabel), 15);
    plotHorizontalBars("payExecActionChart", groupSum(records, actionLabel), 30);
  }

  function compareRecords(a, b) {
    const direction = state.sortDirection;
    const key = state.sortKey;
    if (key === "valor") return ((Number(a.valor) || 0) - (Number(b.valor) || 0)) * direction;
    const left = key === "fav" ? favoredLabel(a) : key === "acao" ? actionLabel(a) : key === "pi" ? piLabel(a) : String(a[key] || "");
    const right = key === "fav" ? favoredLabel(b) : key === "acao" ? actionLabel(b) : key === "pi" ? piLabel(b) : String(b[key] || "");
    return left.localeCompare(right, "pt-BR", { sensitivity: "base", numeric: true }) * direction;
  }

  function renderTable(records) {
    const ordered = records.slice().sort(compareRecords);
    elements.tableBody.innerHTML = ordered.map(record => `
      <tr class="${Number(record.valor) === 0 ? "pay-exec-row--zero" : ""}">
        <td class="pay-nowrap">${escapeHtml(record.ne)}</td>
        <td><strong>${escapeHtml(favoredLabel(record))}</strong></td>
        <td>${escapeHtml(actionLabel(record))}</td>
        <td>${escapeHtml(piLabel(record))}</td>
        <td class="text-right pay-tabular">${formatValue(record.valor)}</td>
      </tr>`).join("");
    elements.tableInfo.textContent = `${formatInteger(ordered.length)} lançamento(s) exibido(s) · ${deadlineFreeFilterSummary()}.`;
  }

  function render() {
    state.filtered = state.records.filter(matchesFilters);
    renderKpis(state.filtered);
    renderCharts(state.filtered);
    renderTable(state.filtered);
  }

  function clearFilters() {
    elements.favoredFilter.value = "";
    elements.piFilter.value = "";
    elements.actionFilter.value = "";
    elements.searchFilter.value = "";
    render();
  }

  function sortFromHeader(header) {
    const key = header?.dataset?.key;
    if (!key) return;
    if (state.sortKey === key) state.sortDirection *= -1;
    else {
      state.sortKey = key;
      state.sortDirection = key === "valor" ? -1 : 1;
    }
    elements.table.querySelectorAll("th[data-key]").forEach(cell => cell.removeAttribute("aria-sort"));
    header.setAttribute("aria-sort", state.sortDirection === 1 ? "ascending" : "descending");
    renderTable(state.filtered);
  }

  function ensurePdf() {
    const jsPdf = window.jspdf?.jsPDF;
    if (!jsPdf || typeof jsPdf !== "function") throw new Error("Biblioteca de PDF indisponível.");
    return jsPdf;
  }

  function addPdfHeader(doc, title, subtitle) {
    doc.setFillColor(0, 54, 118);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 25, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(title, 14, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(subtitle, 14, 18);
    doc.setTextColor(24, 50, 86);
  }

  function generateManagementPdf() {
    try {
      const JsPdf = ensurePdf();
      const doc = new JsPdf({ orientation: "landscape", unit: "mm", format: "a4" });
      const metadata = state.metadata || {};
      const records = state.filtered;
      const total = Math.round(records.reduce((sum, record) => sum + (Number(record.valor) || 0), 0) * 100) / 100;
      const filters = deadlineFreeFilterSummary();
      addPdfHeader(doc, "Painel CABW — Pagamentos consolidados", `Fonte: ${metadata.sourceFileName || "pagamentos.html"} | Gerado em ${new Date().toLocaleString("pt-BR")}`);

      doc.setFontSize(9);
      doc.text(`Filtros: ${filters}`, 14, 33);
      doc.setFontSize(8);
      doc.setTextColor(80, 91, 108);
      doc.text(metadata.currencyNote || "Moeda não informada na fonte.", 14, 38);
      doc.setTextColor(24, 50, 86);

      doc.autoTable({
        startY: 43,
        head: [["Valor total", "Lançamentos", "Notas de empenho", "Favorecidos", "PIs", "Ações"]],
        body: [[
          formatValue(total),
          formatInteger(records.length),
          formatInteger(new Set(records.map(record => record.ne).filter(Boolean)).size),
          formatInteger(new Set(records.map(record => record.fav).filter(Boolean)).size),
          formatInteger(new Set(records.map(record => record.piCod).filter(Boolean)).size),
          formatInteger(new Set(records.map(record => record.acaoCod).filter(Boolean)).size)
        ]],
        theme: "grid",
        styles: { fontSize: 8, halign: "center" },
        headStyles: { fillColor: [0, 54, 118], textColor: 255 },
        bodyStyles: { textColor: [24, 50, 86], fontStyle: "bold" }
      });

      const favoredRows = groupSum(records, favoredLabel).slice(0, 15).map((item, index) => [index + 1, item.label, formatValue(item.value)]);
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 8,
        head: [["#", "Favorecido", "Valor"]],
        body: favoredRows,
        theme: "striped",
        styles: { fontSize: 7.2 },
        headStyles: { fillColor: [10, 77, 145], textColor: 255 },
        columnStyles: { 0: { halign: "center", cellWidth: 12 }, 2: { halign: "right", cellWidth: 38 } },
        margin: { left: 14, right: 155 }
      });

      const actionRows = groupSum(records, actionLabel).map((item, index) => [index + 1, item.label, formatValue(item.value)]);
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 8,
        head: [["#", "Ação de Governo", "Valor"]],
        body: actionRows,
        theme: "striped",
        styles: { fontSize: 7.2 },
        headStyles: { fillColor: [10, 77, 145], textColor: 255 },
        columnStyles: { 0: { halign: "center", cellWidth: 12 }, 2: { halign: "right", cellWidth: 38 } },
        margin: { left: 155, right: 14 }
      });

      const fileName = `pagamentos-consolidados-gerencial-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
      if (elements.reportMessage) {
        elements.reportMessage.textContent = "Relatório gerencial gerado com os filtros atuais.";
        elements.reportMessage.className = "pay-form-message is-visible pay-form-message--success";
      }
    } catch (error) {
      if (elements.reportMessage) {
        elements.reportMessage.textContent = `Não foi possível gerar o PDF: ${error.message}`;
        elements.reportMessage.className = "pay-form-message is-visible pay-form-message--error";
      }
      console.error(error);
    }
  }

  function generateDetailedPdf() {
    try {
      const JsPdf = ensurePdf();
      const doc = new JsPdf({ orientation: "landscape", unit: "mm", format: "a3" });
      const metadata = state.metadata || {};
      const records = state.filtered.slice().sort(compareRecords);
      addPdfHeader(doc, "Painel CABW — Detalhamento dos pagamentos consolidados", `Fonte: ${metadata.sourceFileName || "pagamentos.html"} | ${formatInteger(records.length)} lançamento(s) | Gerado em ${new Date().toLocaleString("pt-BR")}`);
      doc.setFontSize(8.5);
      doc.text(`Filtros: ${deadlineFreeFilterSummary()}`, 14, 33);
      doc.setFontSize(7.5);
      doc.setTextColor(80, 91, 108);
      doc.text(metadata.currencyNote || "Moeda não informada na fonte.", 14, 38);
      doc.setTextColor(24, 50, 86);

      doc.autoTable({
        startY: 43,
        head: [["NE", "Favorecido", "Ação de Governo", "Plano Interno (PI)", "Valor"]],
        body: records.map(record => [
          record.ne,
          favoredLabel(record),
          actionLabel(record),
          piLabel(record),
          formatValue(record.valor)
        ]),
        theme: "grid",
        styles: { fontSize: 6.3, cellPadding: 1.5, overflow: "linebreak", valign: "middle" },
        headStyles: { fillColor: [0, 54, 118], textColor: 255, fontSize: 6.7 },
        columnStyles: {
          0: { cellWidth: 43 },
          1: { cellWidth: 96 },
          2: { cellWidth: 103 },
          3: { cellWidth: 103 },
          4: { cellWidth: 34, halign: "right" }
        },
        didDrawPage: data => {
          const pageCount = doc.internal.getNumberOfPages();
          doc.setFontSize(7);
          doc.setTextColor(90, 98, 112);
          doc.text(`Página ${pageCount}`, doc.internal.pageSize.getWidth() - 26, doc.internal.pageSize.getHeight() - 8);
        }
      });

      const fileName = `pagamentos-consolidados-detalhado-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
      if (elements.reportMessage) {
        elements.reportMessage.textContent = "Relatório detalhado gerado com todos os registros filtrados.";
        elements.reportMessage.className = "pay-form-message is-visible pay-form-message--success";
      }
    } catch (error) {
      if (elements.reportMessage) {
        elements.reportMessage.textContent = `Não foi possível gerar o PDF: ${error.message}`;
        elements.reportMessage.className = "pay-form-message is-visible pay-form-message--error";
      }
      console.error(error);
    }
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCsv() {
    const rows = state.filtered.slice().sort(compareRecords);
    const lines = [
      ["NE", "Código do favorecido", "Favorecido", "Código da Ação", "Ação de Governo", "Código do PI", "Plano Interno", "Valor"],
      ...rows.map(record => [record.ne, record.favCod, record.fav, record.acaoCod, record.acao, record.piCod, record.pi, String(record.valor).replace(".", ",")])
    ].map(row => row.map(csvCell).join(";"));
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pagamentos-consolidados-filtrados-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function bindElements() {
    Object.assign(elements, {
      sourceTitle: byId("payExecSourceTitle"),
      sourceInfo: byId("payExecSourceInfo"),
      qualityInfo: byId("payExecQualityInfo"),
      favoredFilter: byId("payExecFavoredFilter"),
      piFilter: byId("payExecPiFilter"),
      actionFilter: byId("payExecActionFilter"),
      searchFilter: byId("payExecSearchFilter"),
      clearButton: byId("payExecClearFilters"),
      managementPdf: byId("payExecManagementPdf"),
      detailedPdf: byId("payExecDetailedPdf"),
      exportCsv: byId("payExecExportCsv"),
      reportMessage: byId("payExecReportMessage"),
      kpiValue: byId("payExecKpiValue"),
      kpiRows: byId("payExecKpiRows"),
      kpiNes: byId("payExecKpiNes"),
      kpiFavored: byId("payExecKpiFavored"),
      kpiPis: byId("payExecKpiPis"),
      kpiActions: byId("payExecKpiActions"),
      table: byId("payExecTable"),
      tableBody: byId("payExecDetailBody"),
      tableInfo: byId("payExecRowsInfo"),
      loading: byId("payExecLoading")
    });
  }

  function bindEvents() {
    [elements.favoredFilter, elements.piFilter, elements.actionFilter].forEach(element => element?.addEventListener("change", render));
    elements.searchFilter?.addEventListener("input", render);
    elements.clearButton?.addEventListener("click", clearFilters);
    elements.managementPdf?.addEventListener("click", generateManagementPdf);
    elements.detailedPdf?.addEventListener("click", generateDetailedPdf);
    elements.exportCsv?.addEventListener("click", exportCsv);
    elements.table?.querySelectorAll("th[data-key]").forEach(header => header.addEventListener("click", () => sortFromHeader(header)));
    window.addEventListener("resize", () => renderCharts(state.filtered));
  }

  async function init() {
    bindElements();
    bindEvents();
    try {
      const response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`Falha ao carregar a base (${response.status}).`);
      const payload = await response.json();
      if (!Array.isArray(payload?.records)) throw new Error("Estrutura de dados inválida.");
      state.metadata = payload.metadata || {};
      state.records = payload.records.map(normalizeRecord);
      populateFilters();
      renderMetadata();
      render();
      if (elements.loading) elements.loading.hidden = true;
    } catch (error) {
      if (elements.loading) {
        elements.loading.hidden = false;
        elements.loading.innerHTML = `<i class="bi bi-exclamation-triangle"></i><span>Não foi possível carregar a base consolidada: ${escapeHtml(error.message)}</span>`;
      }
      console.error(error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
