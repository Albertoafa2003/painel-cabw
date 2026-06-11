
(function () {
  'use strict';

  const DATA = Array.isArray(window.RP_DATA) ? window.RP_DATA : [];
  const METADATA = window.RP_METADATA || {};
  const MAX_DETAIL_ROWS = 300;

  const state = {
    filtered: DATA.slice(),
    summaries: {},
  };

  const els = {};

  const moneyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const numberFormatter = new Intl.NumberFormat('pt-BR');

  function $(id) {
    return document.getElementById(id);
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function formatMoney(value) {
    return moneyFormatter.format(Number(value || 0)).replace(/\u00a0/g, ' ');
  }

  function formatNumber(value) {
    return numberFormatter.format(Number(value || 0));
  }

  function uniqueSorted(field, numeric) {
    const values = Array.from(new Set(DATA.map(item => item[field]).filter(Boolean)));
    if (numeric) {
      return values.sort((a, b) => Number(a) - Number(b));
    }
    return values.sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  }

  function fillSelect(select, values, placeholder) {
    if (!select) return;
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);
    values.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function cacheElements() {
    [
      'rpYearFilter', 'rpOmFilter', 'rpContractFilter', 'rpEmpenhoFilter', 'rpSearchFilter',
      'rpClearFilters', 'rpGeneratePdf', 'rpRowsInfo', 'rpSourceInfo',
      'rpKpiSaldo', 'rpKpiOms', 'rpKpiContratos', 'rpKpiAnos', 'rpKpiEmpenhos',
      'rpOmChart', 'rpContractChart', 'rpYearChart',
      'rpOmSummaryBody', 'rpContractSummaryBody', 'rpYearSummaryBody', 'rpDetailBody'
    ].forEach(id => { els[id] = $(id); });
  }

  function getFilters() {
    return {
      ano: els.rpYearFilter ? els.rpYearFilter.value : '',
      om: els.rpOmFilter ? els.rpOmFilter.value : '',
      contrato: els.rpContractFilter ? els.rpContractFilter.value : '',
      empenho: normalize(els.rpEmpenhoFilter ? els.rpEmpenhoFilter.value : ''),
      search: normalize(els.rpSearchFilter ? els.rpSearchFilter.value : ''),
    };
  }

  function rowMatches(row, filters) {
    if (filters.ano && row.anoRp !== filters.ano) return false;
    if (filters.om && row.om !== filters.om) return false;
    if (filters.contrato && row.contratoPag !== filters.contrato) return false;
    if (filters.empenho && !normalize(row.empenho).includes(filters.empenho)) return false;
    if (filters.search) {
      const haystack = normalize([
        row.anoRp, row.om, row.omCodigo, row.contratoPag, row.empenho,
        row.credor, row.credorCodigo, row.objeto, row.descricao, row.acao,
        row.programa, row.natureza, row.fonte, row.tipo, row.statusDpe,
        row.contratoDescricao, row.fiscal, row.situacaoAtual
      ].join(' '));
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  }

  function groupBy(rows, field) {
    const map = new Map();
    rows.forEach(row => {
      const key = row[field] || 'Não informado';
      if (!map.has(key)) {
        map.set(key, { label: key, saldoUsd: 0, registros: 0, empenhos: new Set(), contratos: new Set(), oms: new Set() });
      }
      const item = map.get(key);
      item.saldoUsd += Number(row.saldoUsd || 0);
      item.registros += 1;
      item.empenhos.add(row.empenho);
      item.contratos.add(row.contratoPag);
      item.oms.add(row.om);
    });
    return Array.from(map.values())
      .map(item => ({
        label: item.label,
        saldoUsd: Number(item.saldoUsd.toFixed(2)),
        registros: item.registros,
        empenhos: item.empenhos.size,
        contratos: item.contratos.size,
        oms: item.oms.size,
      }))
      .sort((a, b) => b.saldoUsd - a.saldoUsd || String(a.label).localeCompare(String(b.label), 'pt-BR'));
  }

  function calculateSummaries(rows) {
    return {
      totalSaldo: rows.reduce((sum, row) => sum + Number(row.saldoUsd || 0), 0),
      oms: new Set(rows.map(row => row.om)).size,
      contratos: new Set(rows.map(row => row.contratoPag)).size,
      anos: new Set(rows.map(row => row.anoRp)).size,
      empenhos: new Set(rows.map(row => row.empenho)).size,
      byOm: groupBy(rows, 'om'),
      byContract: groupBy(rows, 'contratoPag'),
      byYear: groupBy(rows, 'anoRp').sort((a, b) => Number(a.label) - Number(b.label)),
    };
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function renderKpis(rows, summaries) {
    setText(els.rpKpiSaldo, formatMoney(summaries.totalSaldo));
    setText(els.rpKpiOms, formatNumber(summaries.oms));
    setText(els.rpKpiContratos, formatNumber(summaries.contratos));
    setText(els.rpKpiAnos, formatNumber(summaries.anos));
    setText(els.rpKpiEmpenhos, formatNumber(summaries.empenhos));
    setText(els.rpRowsInfo, `Mostrando ${formatNumber(Math.min(rows.length, MAX_DETAIL_ROWS))} de ${formatNumber(rows.length)} registros filtrados.`);
  }

  function renderPlot(target, rows, title, orientation) {
    if (!target || typeof Plotly === 'undefined') return;
    const source = rows.slice(0, 12);
    const labels = source.map(item => item.label);
    const values = source.map(item => item.saldoUsd);
    const data = orientation === 'h'
      ? [{ type: 'bar', orientation: 'h', y: labels.reverse(), x: values.reverse(), marker: { color: '#1f4f97' }, hovertemplate: '%{y}<br>%{x:,.2f}<extra></extra>' }]
      : [{ type: 'bar', x: labels, y: values, marker: { color: '#1f4f97' }, hovertemplate: '%{x}<br>%{y:,.2f}<extra></extra>' }];
    Plotly.newPlot(target, data, {
      title: { text: title, x: 0.02, font: { size: 15, color: '#08265b' } },
      margin: { l: orientation === 'h' ? 210 : 50, r: 24, t: 52, b: 58 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: '#edf2f9',
      font: { family: 'Montserrat, Arial, sans-serif', color: '#102452' },
      xaxis: { title: 'Saldo RP (US$)', gridcolor: '#ffffff' },
      yaxis: { gridcolor: '#ffffff', automargin: true },
      bargap: 0.28,
    }, { responsive: true, displayModeBar: false });
  }

  function renderSummaryTable(tbody, rows, columns) {
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${columns.length}" class="text-center text-muted py-4">Nenhum registro encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(row => {
      return `<tr>${columns.map(col => {
        const value = col.format ? col.format(row[col.key], row) : row[col.key];
        return `<td class="${col.className || ''}">${escapeHtml(value)}</td>`;
      }).join('')}</tr>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderTables(rows, summaries) {
    renderSummaryTable(els.rpOmSummaryBody, summaries.byOm, [
      { key: 'label' },
      { key: 'saldoUsd', format: formatMoney, className: 'text-right tabular-number' },
      { key: 'contratos', format: formatNumber, className: 'text-center tabular-number' },
      { key: 'empenhos', format: formatNumber, className: 'text-center tabular-number' },
    ]);

    renderSummaryTable(els.rpContractSummaryBody, summaries.byContract, [
      { key: 'label' },
      { key: 'saldoUsd', format: formatMoney, className: 'text-right tabular-number' },
      { key: 'oms', format: formatNumber, className: 'text-center tabular-number' },
      { key: 'empenhos', format: formatNumber, className: 'text-center tabular-number' },
    ]);

    renderSummaryTable(els.rpYearSummaryBody, summaries.byYear, [
      { key: 'label' },
      { key: 'saldoUsd', format: formatMoney, className: 'text-right tabular-number' },
      { key: 'oms', format: formatNumber, className: 'text-center tabular-number' },
      { key: 'contratos', format: formatNumber, className: 'text-center tabular-number' },
      { key: 'empenhos', format: formatNumber, className: 'text-center tabular-number' },
    ]);

    if (els.rpDetailBody) {
      const detailRows = rows.slice(0, MAX_DETAIL_ROWS);
      els.rpDetailBody.innerHTML = detailRows.length ? detailRows.map(row => `
        <tr>
          <td>${escapeHtml(row.anoRp)}</td>
          <td>${escapeHtml(row.om)}</td>
          <td>${escapeHtml(row.contratoPag)}</td>
          <td>${escapeHtml(row.empenho)}</td>
          <td>${escapeHtml(row.credor || '—')}</td>
          <td>${escapeHtml(row.objeto || row.descricao || '—')}</td>
          <td class="text-right tabular-number">${escapeHtml(formatMoney(row.saldoUsd))}</td>
        </tr>
      `).join('') : `<tr><td colspan="7" class="text-center text-muted py-4">Nenhum registro encontrado.</td></tr>`;
    }
  }

  function renderCharts(summaries) {
    renderPlot(els.rpOmChart, summaries.byOm, 'Saldo de RP por OM', 'h');
    renderPlot(els.rpContractChart, summaries.byContract, 'Saldo de RP por Contrato/PAG', 'h');
    renderPlot(els.rpYearChart, summaries.byYear, 'Saldo de RP por Ano', 'v');
  }

  function applyFilters() {
    const filters = getFilters();
    const rows = DATA.filter(row => rowMatches(row, filters));
    const summaries = calculateSummaries(rows);
    state.filtered = rows;
    state.summaries = summaries;
    renderKpis(rows, summaries);
    renderCharts(summaries);
    renderTables(rows, summaries);
  }

  function clearFilters() {
    ['rpYearFilter', 'rpOmFilter', 'rpContractFilter', 'rpEmpenhoFilter', 'rpSearchFilter'].forEach(id => {
      const el = els[id];
      if (el) el.value = '';
    });
    applyFilters();
  }

  function activeFilterLabels() {
    const filters = getFilters();
    const labels = [];
    if (filters.ano) labels.push(['Ano do RP', filters.ano]);
    if (filters.om) labels.push(['OM', filters.om]);
    if (filters.contrato) labels.push(['Contrato/PAG', filters.contrato]);
    if (filters.empenho) labels.push(['Empenho contém', els.rpEmpenhoFilter.value]);
    if (filters.search) labels.push(['Busca geral', els.rpSearchFilter.value]);
    return labels.length ? labels : [['Filtros', 'Todos os registros']];
  }

  function autoTable(doc, options) {
    if (typeof doc.autoTable !== 'function') {
      alert('Biblioteca de PDF indisponível. Verifique sua conexão e tente novamente.');
      return false;
    }
    doc.autoTable(options);
    return true;
  }

  function generatePdf() {
    if (!state.filtered.length) {
      alert('Não há registros para gerar o relatório. Ajuste os filtros e tente novamente.');
      return;
    }
    if (state.filtered.length > 1500 && !confirm(`O relatório incluirá ${state.filtered.length} registros detalhados e poderá demorar alguns segundos. Deseja continuar?`)) {
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('Biblioteca de PDF indisponível. Verifique sua conexão e tente novamente.');
      return;
    }

    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const now = new Date();
    const fileDate = now.toISOString().slice(0, 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(8, 38, 91);
    doc.text('Painel CABW - Relatório de Restos a Pagar', 40, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(55, 62, 82);
    doc.text(`Gerado em ${now.toLocaleString('pt-BR')}`, 40, 60);
    doc.text(`Fonte: ${METADATA.sourceFile || 'PAINEL CABW - RP.xlsx'}`, pageWidth - 40, 60, { align: 'right' });

    autoTable(doc, {
      startY: 78,
      head: [['Filtro', 'Valor']],
      body: activeFilterLabels(),
      theme: 'grid',
      headStyles: { fillColor: [0, 47, 108], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold' } },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 12,
      head: [['Indicador', 'Valor']],
      body: [
        ['Saldo de RP filtrado', formatMoney(state.summaries.totalSaldo)],
        ['Registros', formatNumber(state.filtered.length)],
        ['Empenhos', formatNumber(state.summaries.empenhos)],
        ['OMs', formatNumber(state.summaries.oms)],
        ['Contratos/PAG', formatNumber(state.summaries.contratos)],
        ['Anos de RP', formatNumber(state.summaries.anos)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [0, 47, 108], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 150, fontStyle: 'bold' } },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 14,
      head: [['Ano do RP', 'Saldo RP', 'OMs', 'Contratos/PAG', 'Empenhos']],
      body: state.summaries.byYear.map(item => [item.label, formatMoney(item.saldoUsd), formatNumber(item.oms), formatNumber(item.contratos), formatNumber(item.empenhos)]),
      theme: 'grid',
      headStyles: { fillColor: [0, 47, 108], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 4 },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 14,
      head: [['OM', 'Saldo RP', 'Contratos/PAG', 'Empenhos']],
      body: state.summaries.byOm.map(item => [item.label, formatMoney(item.saldoUsd), formatNumber(item.contratos), formatNumber(item.empenhos)]),
      theme: 'grid',
      headStyles: { fillColor: [0, 47, 108], textColor: 255 },
      styles: { fontSize: 7.4, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 340 }, 1: { halign: 'right' } },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 14,
      head: [['Contrato/PAG', 'Saldo RP', 'OMs', 'Empenhos']],
      body: state.summaries.byContract.map(item => [item.label, formatMoney(item.saldoUsd), formatNumber(item.oms), formatNumber(item.empenhos)]),
      theme: 'grid',
      headStyles: { fillColor: [0, 47, 108], textColor: 255 },
      styles: { fontSize: 7.2, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 260 }, 1: { halign: 'right' } },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 14,
      head: [['Ano', 'OM', 'Contrato/PAG', 'Empenho', 'Credor', 'Objeto/Descrição', 'Saldo RP']],
      body: state.filtered.map(row => [
        row.anoRp,
        row.om,
        row.contratoPag,
        row.empenho,
        row.credor || '—',
        row.objeto || row.descricao || '—',
        formatMoney(row.saldoUsd),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [0, 47, 108], textColor: 255 },
      styles: { fontSize: 6.7, cellPadding: 2.5, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 138 },
        2: { cellWidth: 76 },
        3: { cellWidth: 78 },
        4: { cellWidth: 130 },
        5: { cellWidth: 240 },
        6: { cellWidth: 74, halign: 'right' },
      },
      didDrawPage: function () {
        const page = doc.internal.getNumberOfPages();
        doc.setFontSize(7);
        doc.setTextColor(90);
        doc.text(`Página ${page}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 18, { align: 'right' });
      },
    });

    const suffix = activeFilterLabels().map(pair => normalize(pair[1]).replace(/[^a-z0-9]+/g, '-')).join('-').slice(0, 60) || 'todos';
    doc.save(`relatorio-rp-${fileDate}-${suffix}.pdf`);
  }

  function init() {
    cacheElements();
    if (!DATA.length) {
      if (els.rpRowsInfo) els.rpRowsInfo.textContent = 'Nenhum dado de RP carregado.';
      return;
    }
    fillSelect(els.rpYearFilter, uniqueSorted('anoRp', true), 'Todos os anos');
    fillSelect(els.rpOmFilter, uniqueSorted('om'), 'Todas as OMs');
    fillSelect(els.rpContractFilter, uniqueSorted('contratoPag'), 'Todos os contratos/PAG');

    ['rpYearFilter', 'rpOmFilter', 'rpContractFilter'].forEach(id => {
      if (els[id]) els[id].addEventListener('change', applyFilters);
    });
    ['rpEmpenhoFilter', 'rpSearchFilter'].forEach(id => {
      if (els[id]) els[id].addEventListener('input', applyFilters);
    });
    if (els.rpClearFilters) els.rpClearFilters.addEventListener('click', clearFilters);
    if (els.rpGeneratePdf) els.rpGeneratePdf.addEventListener('click', generatePdf);

    setText(els.rpSourceInfo, `Fonte: ${METADATA.sourceFile || 'PAINEL CABW - RP.xlsx'} · ${formatNumber(DATA.length)} registros · saldo total ${formatMoney(METADATA.totalSaldoUsd || 0)}`);
    applyFilters();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
