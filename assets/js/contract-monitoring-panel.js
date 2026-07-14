(function () {
  'use strict';

  const DATA = Array.isArray(window.CONTRACT_MONITORING_DATA) ? window.CONTRACT_MONITORING_DATA : [];
  const META = window.CONTRACT_MONITORING_METADATA || {};
  const MAX_TABLE_ROWS = 250;

  const statusConfig = [
    { code: 'vencido', label: 'Vencido', short: 'Vencidos', icon: 'bi-exclamation-octagon', className: 'danger' },
    { code: 'ate-30', label: 'Até 30 dias', short: 'Até 30 dias', icon: 'bi-alarm', className: 'critical' },
    { code: '31-90', label: '31 a 90 dias', short: '31–90 dias', icon: 'bi-clock-history', className: 'warning' },
    { code: '91-150', label: '91 a 150 dias', short: '91–150 dias', icon: 'bi-calendar2-week', className: 'attention' },
    { code: 'regular', label: 'Acima de 150 dias', short: 'Acima de 150', icon: 'bi-shield-check', className: 'regular' },
    { code: 'sem-data', label: 'Sem data de vigência', short: 'Sem data', icon: 'bi-calendar-x', className: 'neutral' },
    { code: 'desconsiderar', label: 'Desconsiderar', short: 'Desconsiderar', icon: 'bi-slash-circle', className: 'ignored' }
  ];

  const alertCodes = new Set(['vencido', 'ate-30', '31-90', '91-150']);
  const urgentCodes = new Set(['vencido', 'ate-30']);
  const state = {
    filtered: [],
    baseForStatus: [],
    filters: {},
    commandSummary: [],
    currencySummary: []
  };

  const moneyFormatters = {};
  const fmtNumber = new Intl.NumberFormat('pt-BR');
  const fmtPercent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function moneyFormatter(currency) {
    const code = currency || 'USD';
    if (!moneyFormatters[code]) {
      try {
        moneyFormatters[code] = new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: code,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      } catch (error) {
        moneyFormatters[code] = new Intl.NumberFormat('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
    }
    return moneyFormatters[code];
  }

  function formatMoney(value, currency) {
    const formatted = moneyFormatter(currency || 'USD').format(Number(value || 0)).replace(/\u00a0/g, ' ');
    if (formatted.indexOf(currency || 'USD') === -1 && !/[€$]/.test(formatted)) {
      return (currency || 'USD') + ' ' + formatted;
    }
    return formatted;
  }

  function formatUsd(value) {
    return formatMoney(value, 'USD');
  }

  function formatNumber(value) {
    return fmtNumber.format(Number(value || 0));
  }

  function uniqueSorted(field) {
    return Array.from(new Set(DATA.map(function (item) { return item[field]; }).filter(Boolean)))
      .sort(function (a, b) { return String(a).localeCompare(String(b), 'pt-BR'); });
  }

  function fillSelect(select, values, placeholder) {
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">' + escapeHtml(placeholder) + '</option>' + values.map(function (value) {
      return '<option value="' + escapeAttr(value) + '">' + escapeHtml(value) + '</option>';
    }).join('');
    if (values.indexOf(previous) !== -1) select.value = previous;
  }

  function statusInfo(code) {
    return statusConfig.find(function (item) { return item.code === code; }) || statusConfig[5];
  }

  function statusBadge(item) {
    const info = statusInfo(item.situacaoCode);
    return '<span class="cm-status-badge cm-status-badge--' + info.className + '"><i class="bi ' + info.icon + '"></i>' + escapeHtml(info.label) + '</span>';
  }

  function daysLabel(item) {
    if (item.diasParaVencimento == null) return '—';
    if (item.diasParaVencimento < 0) return Math.abs(item.diasParaVencimento) + ' dia(s) vencido';
    if (item.diasParaVencimento === 0) return 'Hoje';
    return item.diasParaVencimento + ' dia(s)';
  }

  function isAlert(item) {
    return alertCodes.has(item.situacaoCode);
  }

  function isUrgent(item) {
    return urgentCodes.has(item.situacaoCode);
  }

  function readFilters() {
    return {
      status: els.status ? els.status.value : '',
      type: els.type ? els.type.value : '',
      unit: els.unit ? els.unit.value : '',
      command: els.command ? els.command.value : '',
      company: els.company ? els.company.value : '',
      currency: els.currency ? els.currency.value : '',
      observation: els.observation ? els.observation.value : '',
      sort: els.sort ? els.sort.value : 'deadline',
      searchText: els.search ? els.search.value.trim() : '',
      search: normalize(els.search ? els.search.value : ''),
      includeIgnored: !!(els.includeIgnored && els.includeIgnored.checked)
    };
  }

  function recordMatches(item, filters, ignoreStatus) {
    if (!filters.includeIgnored && !item.monitorado && filters.status !== 'desconsiderar') return false;
    if (!ignoreStatus && filters.status && item.situacaoCode !== filters.status) return false;
    if (filters.type && item.tipoContrato !== filters.type) return false;
    if (filters.unit && item.unidade !== filters.unit) return false;
    if (filters.command && item.grandeComando !== filters.command) return false;
    if (filters.company && item.empresa !== filters.company) return false;
    if (filters.currency && item.moeda !== filters.currency) return false;
    if (filters.observation === 'with' && !item.observacao) return false;
    if (filters.observation === 'without' && item.observacao) return false;

    if (filters.search) {
      const searchable = normalize([
        item.numero, item.unidade, item.grandeComando, item.empresa, item.objetoResumo,
        item.moeda, item.tipoContrato, item.observacao, item.statusPlanilha,
        item.dataAssinatura && item.dataAssinatura.br,
        item.dataInicio && item.dataInicio.br,
        item.dataFinal && item.dataFinal.br
      ].join(' '));
      if (searchable.indexOf(filters.search) === -1) return false;
    }
    return true;
  }

  function sortRecords(records, sortKey) {
    const copy = records.slice();
    copy.sort(function (a, b) {
      if (sortKey === 'value-desc') return b.valorContrato - a.valorContrato;
      if (sortKey === 'commit-desc') return b.valorAEmpenhar - a.valorAEmpenhar;
      if (sortKey === 'company') return a.empresa.localeCompare(b.empresa, 'pt-BR');
      if (sortKey === 'contract') return a.numero.localeCompare(b.numero, 'pt-BR');
      if (sortKey === 'date') {
        const aDate = a.dataFinal ? a.dataFinal.iso : '9999-12-31';
        const bDate = b.dataFinal ? b.dataFinal.iso : '9999-12-31';
        return aDate.localeCompare(bDate) || a.numero.localeCompare(b.numero, 'pt-BR');
      }
      const aDays = a.diasParaVencimento == null ? 999999 : a.diasParaVencimento;
      const bDays = b.diasParaVencimento == null ? 999999 : b.diasParaVencimento;
      return a.prioridade - b.prioridade || aDays - bDays || a.numero.localeCompare(b.numero, 'pt-BR');
    });
    return copy;
  }

  function aggregateCommands(records) {
    const map = new Map();
    records.forEach(function (item) {
      const key = item.grandeComando || 'Não informado';
      if (!map.has(key)) {
        map.set(key, { command: key, contracts: 0, alerts: 0, committed: 0, billed: 0 });
      }
      const row = map.get(key);
      row.contracts += 1;
      if (isAlert(item)) row.alerts += 1;
      row.committed += Number(item.totalEmpenhadoUsd || 0);
      row.billed += Number(item.totalFaturadoUsd || 0);
    });
    return Array.from(map.values()).sort(function (a, b) {
      return b.alerts - a.alerts || b.contracts - a.contracts || a.command.localeCompare(b.command, 'pt-BR');
    });
  }

  function aggregateCurrencies(records) {
    const map = new Map();
    records.forEach(function (item) {
      const key = item.moeda || 'N/I';
      if (!map.has(key)) {
        map.set(key, { currency: key, value: 0, committed: 0, billed: 0, balance: 0, toCommit: 0 });
      }
      const row = map.get(key);
      row.value += Number(item.valorContrato || 0);
      row.committed += Number(item.totalEmpenhado || 0);
      row.billed += Number(item.totalFaturado || 0);
      row.balance += Number(item.saldoSilomsExt || 0);
      row.toCommit += Number(item.valorAEmpenhar || 0);
    });
    return Array.from(map.values()).sort(function (a, b) { return a.currency.localeCompare(b.currency, 'pt-BR'); });
  }

  function applyFilters() {
    const filters = readFilters();
    state.filters = filters;
    state.baseForStatus = DATA.filter(function (item) { return recordMatches(item, filters, true); });
    state.filtered = sortRecords(DATA.filter(function (item) { return recordMatches(item, filters, false); }), filters.sort);
    state.commandSummary = aggregateCommands(state.filtered);
    state.currencySummary = aggregateCurrencies(state.filtered);
    renderAll();
  }

  function renderSource() {
    if (!els.source) return;
    const reference = META.referenceDate && META.referenceDate.br ? META.referenceDate.br : '—';
    els.source.textContent = 'Fonte financeira e de vigência: ' + (META.sourceFile || 'Relatório de contratos') + (META.monitoringSource ? ' · tipo e providências preservados de ' + META.monitoringSource : '') + ' · posição de ' + reference + ' · ' + formatNumber(META.totalMonitored || 0) + ' contratos monitorados';
  }

  function renderKpis() {
    const records = state.filtered;
    const committed = records.reduce(function (sum, item) { return sum + Number(item.totalEmpenhadoUsd || 0); }, 0);
    const billed = records.reduce(function (sum, item) { return sum + Number(item.totalFaturadoUsd || 0); }, 0);
    const rate = committed ? billed / committed * 100 : 0;

    els.kpiContracts.textContent = formatNumber(records.length);
    els.kpiContractsNote.textContent = (state.filters.includeIgnored ? 'inclui desconsiderados' : 'registros monitorados');
    els.kpiAlerts.textContent = formatNumber(records.filter(isAlert).length);
    els.kpiUrgent.textContent = formatNumber(records.filter(isUrgent).length);
    els.kpiObservations.textContent = formatNumber(records.filter(function (item) { return !!item.observacao; }).length);
    els.kpiCommitted.textContent = formatUsd(committed);
    els.kpiBilled.textContent = formatUsd(billed);
    els.kpiBilledRate.textContent = fmtPercent.format(rate) + '% do empenhado';
    els.financialBalance.textContent = formatUsd(committed - billed) + ' a faturar';
    els.results.textContent = formatNumber(records.length) + ' contrato(s) exibido(s)';
  }

  function renderStatusGrid() {
    const total = state.baseForStatus.length || 1;
    const selected = state.filters.status;
    const visibleConfig = statusConfig.filter(function (info) {
      return info.code !== 'desconsiderar' || state.filters.includeIgnored;
    });

    els.statusGrid.innerHTML = visibleConfig.map(function (info) {
      const count = state.baseForStatus.filter(function (item) { return item.situacaoCode === info.code; }).length;
      const pct = Math.max(0, Math.min(100, count / total * 100));
      return '<button type="button" class="cm-status-card cm-status-card--' + info.className + (selected === info.code ? ' is-active' : '') + '" data-status-code="' + info.code + '">' +
        '<span class="cm-status-card__top"><i class="bi ' + info.icon + '"></i><strong>' + formatNumber(count) + '</strong></span>' +
        '<span class="cm-status-card__label">' + escapeHtml(info.short) + '</span>' +
        '<span class="cm-status-card__bar"><span style="width:' + pct.toFixed(2) + '%"></span></span>' +
        '</button>';
    }).join('');

    els.statusGrid.querySelectorAll('[data-status-code]').forEach(function (button) {
      button.addEventListener('click', function () {
        const code = button.getAttribute('data-status-code');
        els.status.value = els.status.value === code ? '' : code;
        applyFilters();
      });
    });
  }

  function renderDeadlineTable() {
    const priorityRows = state.filtered.filter(function (item) {
      return item.situacaoCode !== 'desconsiderar';
    }).slice().sort(function (a, b) {
      const aDays = a.diasParaVencimento == null ? 999999 : a.diasParaVencimento;
      const bDays = b.diasParaVencimento == null ? 999999 : b.diasParaVencimento;
      return a.prioridade - b.prioridade || aDays - bDays;
    }).slice(0, 12);

    if (!priorityRows.length) {
      els.deadlineBody.innerHTML = '<tr><td colspan="7" class="cm-empty">Nenhum contrato encontrado para os filtros selecionados.</td></tr>';
      return;
    }

    els.deadlineBody.innerHTML = priorityRows.map(function (item) {
      return '<tr>' +
        '<td>' + statusBadge(item) + '</td>' +
        '<td class="text-center cm-nowrap">' + escapeHtml(daysLabel(item)) + '</td>' +
        '<td class="cm-nowrap"><strong>' + escapeHtml(item.numero) + '</strong></td>' +
        '<td>' + escapeHtml(item.unidade || '—') + '</td>' +
        '<td>' + escapeHtml(item.empresa || '—') + '</td>' +
        '<td class="cm-nowrap">' + escapeHtml(item.dataFinal ? item.dataFinal.br : '—') + '</td>' +
        '<td class="cm-observation-cell">' + escapeHtml(item.observacao || 'Sem observação registrada') + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderCommandTable() {
    if (!state.commandSummary.length) {
      els.commandBody.innerHTML = '<tr><td colspan="5" class="cm-empty">Nenhum dado disponível.</td></tr>';
      return;
    }
    els.commandBody.innerHTML = state.commandSummary.map(function (item) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(item.command) + '</strong></td>' +
        '<td class="text-center">' + formatNumber(item.contracts) + '</td>' +
        '<td class="text-center"><span class="cm-alert-count">' + formatNumber(item.alerts) + '</span></td>' +
        '<td class="text-right cm-nowrap">' + formatUsd(item.committed) + '</td>' +
        '<td class="text-right cm-nowrap">' + formatUsd(item.billed) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderCurrencyTable() {
    if (!state.currencySummary.length) {
      els.currencyBody.innerHTML = '<tr><td colspan="6" class="cm-empty">Nenhum dado financeiro disponível.</td></tr>';
      return;
    }
    els.currencyBody.innerHTML = state.currencySummary.map(function (item) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(item.currency) + '</strong></td>' +
        '<td class="text-right cm-nowrap">' + formatMoney(item.value, item.currency) + '</td>' +
        '<td class="text-right cm-nowrap">' + formatMoney(item.committed, item.currency) + '</td>' +
        '<td class="text-right cm-nowrap">' + formatMoney(item.billed, item.currency) + '</td>' +
        '<td class="text-right cm-nowrap">' + formatMoney(item.balance, item.currency) + '</td>' +
        '<td class="text-right cm-nowrap">' + formatMoney(item.toCommit, item.currency) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderDetailTable() {
    const records = state.filtered.slice(0, MAX_TABLE_ROWS);
    els.rowsInfo.textContent = formatNumber(state.filtered.length) + ' registro(s) na consulta' + (state.filtered.length > MAX_TABLE_ROWS ? ' · tabela limitada a ' + MAX_TABLE_ROWS + ' linhas; o PDF inclui todos os registros' : '');

    if (!records.length) {
      els.detailBody.innerHTML = '<tr><td colspan="16" class="cm-empty">Nenhum contrato encontrado para os filtros selecionados.</td></tr>';
      els.mobileList.innerHTML = '<p class="cm-empty-card">Nenhum contrato encontrado para os filtros selecionados.</p>';
      return;
    }

    els.detailBody.innerHTML = records.map(function (item) {
      return '<tr>' +
        '<td>' + statusBadge(item) + '</td>' +
        '<td class="text-center cm-nowrap">' + escapeHtml(daysLabel(item)) + '</td>' +
        '<td class="cm-nowrap"><strong>' + escapeHtml(item.numero) + '</strong></td>' +
        '<td>' + escapeHtml(item.unidade || '—') + '</td>' +
        '<td>' + escapeHtml(item.grandeComando || '—') + '</td>' +
        '<td class="cm-company-cell">' + escapeHtml(item.empresa || '—') + '</td>' +
        '<td class="cm-object-cell">' + escapeHtml(item.objetoResumo || '—') + '</td>' +
        '<td>' + escapeHtml(item.tipoContrato || '—') + '</td>' +
        '<td class="text-center">' + escapeHtml(item.moeda || '—') + '</td>' +
        '<td class="text-right cm-nowrap">' + formatMoney(item.valorContrato, item.moeda) + '</td>' +
        '<td class="text-right cm-nowrap">' + formatMoney(item.totalEmpenhado, item.moeda) + '</td>' +
        '<td class="text-right cm-nowrap">' + formatMoney(item.totalFaturado, item.moeda) + '</td>' +
        '<td class="text-right cm-nowrap">' + formatMoney(item.saldoSilomsExt, item.moeda) + '</td>' +
        '<td class="text-right cm-nowrap">' + formatMoney(item.valorAEmpenhar, item.moeda) + '</td>' +
        '<td class="cm-nowrap">' + escapeHtml(item.dataFinal ? item.dataFinal.br : '—') + '</td>' +
        '<td class="cm-observation-cell">' + escapeHtml(item.observacao || '—') + '</td>' +
        '</tr>';
    }).join('');

    els.mobileList.innerHTML = records.map(function (item) {
      return '<article class="cm-mobile-card">' +
        '<div class="cm-mobile-card__head"><strong>' + escapeHtml(item.numero) + '</strong>' + statusBadge(item) + '</div>' +
        '<h3>' + escapeHtml(item.empresa || '—') + '</h3>' +
        '<p>' + escapeHtml(item.objetoResumo || '—') + '</p>' +
        '<dl>' +
          '<div><dt>Prazo</dt><dd>' + escapeHtml(daysLabel(item)) + '</dd></div>' +
          '<div><dt>Data final</dt><dd>' + escapeHtml(item.dataFinal ? item.dataFinal.br : '—') + '</dd></div>' +
          '<div><dt>Unidade / Comando</dt><dd>' + escapeHtml((item.unidade || '—') + ' / ' + (item.grandeComando || '—')) + '</dd></div>' +
          '<div><dt>Valor</dt><dd>' + formatMoney(item.valorContrato, item.moeda) + '</dd></div>' +
          '<div><dt>Empenhado</dt><dd>' + formatMoney(item.totalEmpenhado, item.moeda) + '</dd></div>' +
          '<div><dt>Faturado</dt><dd>' + formatMoney(item.totalFaturado, item.moeda) + '</dd></div>' +
        '</dl>' +
        (item.observacao ? '<div class="cm-mobile-card__note"><strong>Providência:</strong> ' + escapeHtml(item.observacao) + '</div>' : '') +
        '</article>';
    }).join('');
  }

  function renderAll() {
    renderKpis();
    renderStatusGrid();
    renderDeadlineTable();
    renderCommandTable();
    renderCurrencyTable();
    renderDetailTable();
    const disabled = !state.filtered.length;
    els.managementPdf.disabled = disabled;
    els.detailedPdf.disabled = disabled;
  }

  function filterDescription() {
    const f = state.filters;
    const items = [];
    if (f.status) items.push('Situação: ' + statusInfo(f.status).label);
    if (f.type) items.push('Tipo: ' + f.type);
    if (f.unit) items.push('Unidade: ' + f.unit);
    if (f.command) items.push('Grande Comando: ' + f.command);
    if (f.company) items.push('Empresa: ' + f.company);
    if (f.currency) items.push('Moeda: ' + f.currency);
    if (f.observation === 'with') items.push('Somente com observação');
    if (f.observation === 'without') items.push('Somente sem observação');
    if (f.searchText) items.push('Busca: ' + f.searchText);
    if (f.includeIgnored) items.push('Inclui desconsiderados');
    return items.length ? items.join(' | ') : 'Nenhum filtro adicional aplicado';
  }

  function pdfText(value) {
    return String(value == null ? '' : value)
      .replace(/\u00a0/g, ' ')
      .replace(/[–—]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim() || '-';
  }

  function filePart(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  }

  function addPdfHeader(doc, title, subtitle) {
    doc.setFillColor(0, 45, 107);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, 14, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(subtitle, 14, 17);
    doc.setTextColor(16, 36, 82);
  }

  function addPdfFooters(doc) {
    const pages = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      doc.setDrawColor(220, 226, 236);
      doc.line(12, height - 10, width - 12, height - 10);
      doc.setFontSize(7.5);
      doc.setTextColor(95, 105, 124);
      doc.text('Painel CABW · Monitoramento de Contratos', 12, height - 5.2);
      doc.text('Página ' + page + ' de ' + pages, width - 12, height - 5.2, { align: 'right' });
    }
  }

  function generateManagementPdf() {
    if (!state.filtered.length || !window.jspdf) return;
    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const reference = META.referenceDate && META.referenceDate.br ? META.referenceDate.br : '—';
    addPdfHeader(doc, 'Monitoramento de Contratos - Relatório Gerencial', 'Posição de ' + reference + ' · ' + pdfText(META.sourceFile || 'Planilha de monitoramento'));

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Filtros: ' + pdfText(filterDescription()), 14, 31, { maxWidth: 270 });

    const committed = state.filtered.reduce(function (sum, item) { return sum + Number(item.totalEmpenhadoUsd || 0); }, 0);
    const billed = state.filtered.reduce(function (sum, item) { return sum + Number(item.totalFaturadoUsd || 0); }, 0);
    const alertCount = state.filtered.filter(isAlert).length;
    const urgentCount = state.filtered.filter(isUrgent).length;

    doc.autoTable({
      startY: 36,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.4, textColor: [16, 36, 82] },
      body: [
        ['Contratos na consulta', formatNumber(state.filtered.length), 'Em alerta', formatNumber(alertCount), 'Vencidos / até 30 dias', formatNumber(urgentCount)],
        ['Empenhado USD', formatUsd(committed), 'Faturado USD', formatUsd(billed), 'Saldo a faturar USD', formatUsd(committed - billed)]
      ],
      columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' }, 4: { fontStyle: 'bold' } },
      alternateRowStyles: { fillColor: [245, 248, 252] }
    });

    let y = doc.lastAutoTable.finalY + 6;
    const statusRows = statusConfig.filter(function (info) {
      return info.code !== 'desconsiderar' || state.filters.includeIgnored;
    }).map(function (info) {
      const count = state.baseForStatus.filter(function (item) { return item.situacaoCode === info.code; }).length;
      return [info.label, formatNumber(count), state.baseForStatus.length ? fmtPercent.format(count / state.baseForStatus.length * 100) + '%' : '0,0%'];
    });

    doc.autoTable({
      startY: y,
      head: [['Faixa de prazo', 'Contratos', '% da consulta-base']],
      body: statusRows,
      theme: 'striped',
      headStyles: { fillColor: [0, 54, 118], textColor: 255 },
      styles: { fontSize: 7.5, cellPadding: 2 },
      tableWidth: 88,
      margin: { left: 14 }
    });

    const nextRows = state.filtered.filter(function (item) { return item.situacaoCode !== 'desconsiderar'; })
      .slice().sort(function (a, b) {
        const ad = a.diasParaVencimento == null ? 999999 : a.diasParaVencimento;
        const bd = b.diasParaVencimento == null ? 999999 : b.diasParaVencimento;
        return a.prioridade - b.prioridade || ad - bd;
      }).slice(0, 12).map(function (item) {
        return [item.situacaoGerencial, daysLabel(item), item.numero, item.unidade, item.empresa, item.dataFinal ? item.dataFinal.br : '-', item.observacao || '-'];
      });

    doc.autoTable({
      startY: y,
      head: [['Situação', 'Prazo', 'Contrato', 'Unidade', 'Empresa', 'Data final', 'Providência / observação']],
      body: nextRows,
      theme: 'striped',
      headStyles: { fillColor: [0, 54, 118], textColor: 255 },
      styles: { fontSize: 6.6, cellPadding: 1.7, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 22 }, 1: { cellWidth: 18 }, 2: { cellWidth: 29 }, 3: { cellWidth: 17 },
        4: { cellWidth: 42 }, 5: { cellWidth: 20 }, 6: { cellWidth: 75 }
      },
      margin: { left: 108, right: 10 }
    });

    y = Math.max(doc.lastAutoTable.finalY + 7, 102);
    const commandRows = state.commandSummary.map(function (item) {
      return [item.command, formatNumber(item.contracts), formatNumber(item.alerts), formatUsd(item.committed), formatUsd(item.billed)];
    });
    doc.autoTable({
      startY: y,
      head: [['Grande Comando', 'Contratos', 'Alertas', 'Empenhado USD', 'Faturado USD']],
      body: commandRows,
      theme: 'striped',
      headStyles: { fillColor: [0, 54, 118], textColor: 255 },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 42 }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 14, right: 151 },
      tableWidth: 128
    });

    const currencyRows = state.currencySummary.map(function (item) {
      return [item.currency, formatMoney(item.value, item.currency), formatMoney(item.committed, item.currency), formatMoney(item.billed, item.currency), formatMoney(item.balance, item.currency), formatMoney(item.toCommit, item.currency)];
    });
    doc.autoTable({
      startY: y,
      head: [['Moeda', 'Valor contratado', 'Empenhado', 'Faturado', 'Saldo SILOMS', 'A empenhar']],
      body: currencyRows,
      theme: 'striped',
      headStyles: { fillColor: [0, 54, 118], textColor: 255 },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 17 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 148, right: 10 }
    });

    addPdfFooters(doc);
    doc.save('monitoramento-contratos-gerencial-' + (META.referenceDate ? META.referenceDate.iso : 'atual') + '.pdf');
  }

  function generateDetailedPdf() {
    if (!state.filtered.length || !window.jspdf) return;
    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const reference = META.referenceDate && META.referenceDate.br ? META.referenceDate.br : '—';
    addPdfHeader(doc, 'Monitoramento de Contratos - Relatório Detalhado', 'Posição de ' + reference + ' · ' + pdfText(META.sourceFile || 'Planilha de monitoramento'));
    doc.setFontSize(8.3);
    doc.text('Filtros: ' + pdfText(filterDescription()), 14, 31, { maxWidth: 270 });
    doc.text(formatNumber(state.filtered.length) + ' registro(s) selecionado(s)', 14, 36);

    const rows = state.filtered.map(function (item) {
      return [
        item.situacaoGerencial,
        daysLabel(item),
        item.numero,
        item.unidade,
        item.grandeComando,
        item.empresa,
        item.objetoResumo,
        item.tipoContrato,
        item.moeda,
        formatMoney(item.valorContrato, item.moeda),
        formatMoney(item.totalEmpenhado, item.moeda),
        formatMoney(item.totalFaturado, item.moeda),
        item.dataFinal ? item.dataFinal.br : '-',
        item.observacao || '-'
      ].map(pdfText);
    });

    doc.autoTable({
      startY: 40,
      head: [['Situação', 'Dias', 'Contrato', 'Unid.', 'G. Comando', 'Empresa', 'Objeto resumido', 'Tipo', 'Moeda', 'Valor', 'Empenhado', 'Faturado', 'Final', 'Observação']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [0, 54, 118], textColor: 255, fontSize: 6.2, cellPadding: 1.2 },
      styles: { fontSize: 5.4, cellPadding: 1.1, overflow: 'linebreak', valign: 'middle' },
      alternateRowStyles: { fillColor: [246, 248, 252] },
      columnStyles: {
        0: { cellWidth: 18 }, 1: { cellWidth: 13 }, 2: { cellWidth: 21 }, 3: { cellWidth: 10 },
        4: { cellWidth: 15 }, 5: { cellWidth: 27 }, 6: { cellWidth: 35 }, 7: { cellWidth: 17 },
        8: { cellWidth: 9, halign: 'center' }, 9: { cellWidth: 19, halign: 'right' },
        10: { cellWidth: 19, halign: 'right' }, 11: { cellWidth: 19, halign: 'right' },
        12: { cellWidth: 15 }, 13: { cellWidth: 35 }
      },
      margin: { left: 6, right: 6, top: 10, bottom: 14 },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index === 0) {
          const value = String(data.cell.raw || '');
          if (value === 'Vencido') data.cell.styles.textColor = [158, 22, 45];
          if (value === 'Até 30 dias') data.cell.styles.textColor = [181, 76, 13];
        }
      }
    });

    addPdfFooters(doc);
    const statusPart = state.filters.status ? '-' + filePart(statusInfo(state.filters.status).label) : '';
    doc.save('monitoramento-contratos-detalhado' + statusPart + '-' + (META.referenceDate ? META.referenceDate.iso : 'atual') + '.pdf');
  }

  function clearFilters() {
    els.status.value = '';
    els.type.value = '';
    els.unit.value = '';
    els.command.value = '';
    els.company.value = '';
    els.currency.value = '';
    els.observation.value = '';
    els.sort.value = 'deadline';
    els.search.value = '';
    els.includeIgnored.checked = false;
    applyFilters();
  }

  function cacheElements() {
    els.source = $('cmSourceInfo');
    els.status = $('cmStatusFilter');
    els.type = $('cmTypeFilter');
    els.unit = $('cmUnitFilter');
    els.command = $('cmCommandFilter');
    els.company = $('cmCompanyFilter');
    els.currency = $('cmCurrencyFilter');
    els.observation = $('cmObservationFilter');
    els.sort = $('cmSortFilter');
    els.search = $('cmSearchFilter');
    els.includeIgnored = $('cmIncludeIgnored');
    els.clear = $('cmClearFilters');
    els.managementPdf = $('cmGenerateManagementPdf');
    els.detailedPdf = $('cmGenerateDetailedPdf');
    els.kpiContracts = $('cmKpiContracts');
    els.kpiContractsNote = $('cmKpiContractsNote');
    els.kpiAlerts = $('cmKpiAlerts');
    els.kpiUrgent = $('cmKpiUrgent');
    els.kpiObservations = $('cmKpiObservations');
    els.kpiCommitted = $('cmKpiCommitted');
    els.kpiBilled = $('cmKpiBilled');
    els.kpiBilledRate = $('cmKpiBilledRate');
    els.financialBalance = $('cmFinancialBalance');
    els.results = $('cmResultsInfo');
    els.statusGrid = $('cmStatusGrid');
    els.deadlineBody = $('cmDeadlineBody');
    els.commandBody = $('cmCommandBody');
    els.currencyBody = $('cmCurrencyBody');
    els.rowsInfo = $('cmRowsInfo');
    els.detailBody = $('cmDetailBody');
    els.mobileList = $('cmMobileList');
  }

  function populateFilters() {
    els.status.innerHTML = '<option value="">Todas as situações</option>' + statusConfig.map(function (item) {
      return '<option value="' + item.code + '">' + escapeHtml(item.label) + '</option>';
    }).join('');
    fillSelect(els.type, uniqueSorted('tipoContrato'), 'Todos os tipos');
    fillSelect(els.unit, uniqueSorted('unidade'), 'Todas as unidades');
    fillSelect(els.command, uniqueSorted('grandeComando'), 'Todos os Grandes Comandos');
    fillSelect(els.company, uniqueSorted('empresa'), 'Todas as empresas');
    fillSelect(els.currency, uniqueSorted('moeda'), 'Todas as moedas');
  }

  function bindEvents() {
    [els.status, els.type, els.unit, els.command, els.company, els.currency, els.observation, els.sort, els.includeIgnored].forEach(function (element) {
      if (element) element.addEventListener('change', applyFilters);
    });
    if (els.search) els.search.addEventListener('input', applyFilters);
    if (els.clear) els.clear.addEventListener('click', clearFilters);
    if (els.managementPdf) els.managementPdf.addEventListener('click', generateManagementPdf);
    if (els.detailedPdf) els.detailedPdf.addEventListener('click', generateDetailedPdf);
  }

  function init() {
    cacheElements();
    renderSource();
    populateFilters();
    bindEvents();
    applyFilters();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
