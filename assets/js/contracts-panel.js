(function () {
  const data = window.CABW_CONTRACTS_DATA || [];
  const source = window.CABW_CONTRACTS_SOURCE || {};
  const categoryLabels = {
    administrativos: 'Contratos Administrativos',
    finalisticos: 'Contratos Finalísticos',
    fms: 'FMS (Foreign Military Sales)'
  };

  const fmtNumber = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const fmtDateTime = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  function money(value, currency) {
    const prefix = currency || 'USD';
    return `${prefix} ${fmtNumber.format(Number(value || 0))}`;
  }

  function moneyUsd(value) {
    return money(value, 'USD');
  }

  function byCurrency(records, field) {
    const totals = records.reduce((acc, item) => {
      const moeda = item.moeda || 'USD';
      acc[moeda] = (acc[moeda] || 0) + Number(item[field] || 0);
      return acc;
    }, {});
    return Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moeda, total]) => money(total, moeda))
      .join(' / ') || '-';
  }

  function sum(records, field) {
    return records.reduce((total, item) => total + Number(item[field] || 0), 0);
  }

  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function unique(records, field) {
    return Array.from(new Set(records.map(item => String(item[field] || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function fillSelect(select, values, placeholder) {
    if (!select) return;
    const previous = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>` + values
      .map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`)
      .join('');
    if (values.includes(previous)) select.value = previous;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function computeStatus(item) {
    const today = todayIso();
    if (item.dataFinal && item.dataFinal.iso) {
      return item.dataFinal.iso >= today ? 'Vigente' : 'Encerrado';
    }
    return 'Sem data final';
  }

  function textForPdf(value) {
    return String(value ?? '')
      .replace(/—/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || '-';
  }

  function filenamePart(value) {
    return normalize(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function filterLabel(value, fallback) {
    return value && String(value).trim() ? String(value).trim() : fallback;
  }

  function renderOverview() {
    const overview = document.querySelector('[data-contract-overview]');
    if (!overview) return;

    Object.keys(categoryLabels).forEach(category => {
      const records = data.filter(item => item.categoria === category);
      const card = document.querySelector(`[data-contract-summary="${category}"]`);
      if (!card) return;
      const countEl = card.querySelector('[data-summary-count]');
      const valueEl = card.querySelector('[data-summary-value]');
      const paidEl = card.querySelector('[data-summary-paid]');
      const billedEl = card.querySelector('[data-summary-billed]');
      if (countEl) countEl.textContent = fmtInt.format(records.length);
      if (valueEl) valueEl.textContent = byCurrency(records, 'valorContrato');
      if (paidEl) paidEl.textContent = moneyUsd(sum(records, 'totalEmpenhadoUsd'));
      if (billedEl) billedEl.textContent = moneyUsd(sum(records, 'totalFaturadoUsd'));
    });

    const totalContracts = document.querySelector('[data-all-contracts-count]');
    const totalPaid = document.querySelector('[data-all-contracts-paid]');
    if (totalContracts) totalContracts.textContent = fmtInt.format(data.length);
    if (totalPaid) totalPaid.textContent = moneyUsd(sum(data, 'totalEmpenhadoUsd'));

    const sourceEl = document.querySelector('[data-contract-source]');
    if (sourceEl) {
      sourceEl.textContent = `Fonte: ${source.arquivo || 'Relatório de contratos'} · ${source.atualizadoEm || ''}`;
    }
  }

  function renderPanel() {
    const category = document.body.dataset.contractCategory;
    if (!category) return;
    const baseRecords = data.filter(item => item.categoria === category);
    const tableBody = document.querySelector('#contractsTable tbody');
    const mobileList = document.querySelector('#contractsMobileList');
    const countEl = document.querySelector('[data-kpi="count"]');
    const valueEl = document.querySelector('[data-kpi="value"]');
    const paidEl = document.querySelector('[data-kpi="paidUsd"]');
    const billedEl = document.querySelector('[data-kpi="billedUsd"]');
    const sourceEl = document.querySelector('[data-contract-source]');
    const resultEl = document.querySelector('[data-contract-results]');

    const empresa = document.querySelector('#filterEmpresa');
    const unidade = document.querySelector('#filterUnidade');
    const acao = document.querySelector('#filterAcao');
    const moeda = document.querySelector('#filterMoeda');
    const status = document.querySelector('#filterStatus');
    const search = document.querySelector('#filterContratoSearch');
    const reset = document.querySelector('#resetContractFilters');
    const pdfButton = document.querySelector('#generateContractsPdf');

    let currentRecords = baseRecords.slice();
    let currentTerms = {};

    fillSelect(empresa, unique(baseRecords, 'empresa'), 'Todas as empresas');
    fillSelect(unidade, unique(baseRecords, 'unidade'), 'Todas as unidades');
    fillSelect(acao, unique(baseRecords, 'acao'), 'Todas as ações');
    fillSelect(moeda, unique(baseRecords, 'moeda'), 'Todas as moedas');

    function readTerms() {
      return {
        empresa: empresa ? empresa.value : '',
        unidade: unidade ? unidade.value : '',
        acao: acao ? acao.value : '',
        moeda: moeda ? moeda.value : '',
        status: status ? status.value : '',
        searchText: search ? search.value : '',
        search: normalize(search ? search.value : '')
      };
    }

    function applyFilters() {
      const terms = readTerms();
      const filtered = baseRecords.filter(item => {
        const itemStatus = computeStatus(item);
        const searchable = normalize([
          item.contrato, item.numero, item.unidade, item.empresa, item.objetoResumo,
          item.acao, item.moeda, item.cage, item.grandComando
        ].join(' '));
        return (!terms.empresa || item.empresa === terms.empresa)
          && (!terms.unidade || item.unidade === terms.unidade)
          && (!terms.acao || item.acao === terms.acao)
          && (!terms.moeda || item.moeda === terms.moeda)
          && (!terms.status || itemStatus === terms.status)
          && (!terms.search || searchable.includes(terms.search));
      });
      currentTerms = terms;
      currentRecords = filtered;
      renderSummary(filtered);
      renderRows(filtered);
      if (pdfButton) pdfButton.disabled = !filtered.length;
    }

    function renderSummary(records) {
      if (countEl) countEl.textContent = fmtInt.format(records.length);
      if (valueEl) valueEl.textContent = byCurrency(records, 'valorContrato');
      if (paidEl) paidEl.textContent = moneyUsd(sum(records, 'totalEmpenhadoUsd'));
      if (billedEl) billedEl.textContent = moneyUsd(sum(records, 'totalFaturadoUsd'));
      if (resultEl) resultEl.textContent = `${fmtInt.format(records.length)} contrato(s) exibido(s)`;
      if (sourceEl) sourceEl.textContent = `Fonte: ${source.arquivo || 'Relatório de contratos'} · ${source.atualizadoEm || ''}`;
    }

    function renderRows(records) {
      if (tableBody) {
        if (!records.length) {
          tableBody.innerHTML = '<tr><td colspan="11" class="contracts-empty">Nenhum contrato encontrado para os filtros selecionados.</td></tr>';
        } else {
          tableBody.innerHTML = records.map(item => `
            <tr>
              <td>${escapeHtml(item.contrato)}</td>
              <td>${escapeHtml(item.numero)}</td>
              <td>${escapeHtml(item.unidade || '—')}</td>
              <td>${escapeHtml(item.empresa)}</td>
              <td class="contracts-object-cell">${escapeHtml(item.objetoResumo)}</td>
              <td>${escapeHtml(item.moeda)}</td>
              <td class="text-right">${money(item.valorContrato, item.moeda)}</td>
              <td class="text-right">${moneyUsd(item.totalEmpenhadoUsd)}</td>
              <td class="text-right">${moneyUsd(item.totalFaturadoUsd)}</td>
              <td>${escapeHtml(item.dataFinal && item.dataFinal.br ? item.dataFinal.br : '—')}</td>
              <td><span class="contract-status contract-status--${computeStatus(item).toLowerCase().replace(/\s+/g, '-')}">${computeStatus(item)}</span></td>
            </tr>`).join('');
        }
      }

      if (mobileList) {
        if (!records.length) {
          mobileList.innerHTML = '<div class="contracts-empty-card">Nenhum contrato encontrado para os filtros selecionados.</div>';
        } else {
          mobileList.innerHTML = records.map(item => `
            <article class="contract-mobile-card">
              <div class="contract-mobile-card__head">
                <strong>${escapeHtml(item.contrato)}</strong>
                <span class="contract-status contract-status--${computeStatus(item).toLowerCase().replace(/\s+/g, '-')}">${computeStatus(item)}</span>
              </div>
              <p class="contract-mobile-card__number">${escapeHtml(item.numero)}</p>
              <h3>${escapeHtml(item.empresa)}</h3>
              <p>${escapeHtml(item.objetoResumo)}</p>
              <dl>
                <div><dt>Unidade</dt><dd>${escapeHtml(item.unidade || '—')}</dd></div>
                <div><dt>Ação</dt><dd>${escapeHtml(item.acao || '—')}</dd></div>
                <div><dt>Valor</dt><dd>${money(item.valorContrato, item.moeda)}</dd></div>
                <div><dt>Empenhado USD</dt><dd>${moneyUsd(item.totalEmpenhadoUsd)}</dd></div>
                <div><dt>Data final</dt><dd>${escapeHtml(item.dataFinal && item.dataFinal.br ? item.dataFinal.br : '—')}</dd></div>
              </dl>
            </article>`).join('');
        }
      }
    }

    function buildFilterRows(terms) {
      return [
        ['Painel', categoryLabels[category] || 'Contratos'],
        ['Empresa', filterLabel(terms.empresa, 'Todas')],
        ['Unidade', filterLabel(terms.unidade, 'Todas')],
        ['Ação', filterLabel(terms.acao, 'Todas')],
        ['Moeda', filterLabel(terms.moeda, 'Todas')],
        ['Vigência', filterLabel(terms.status, 'Todas')],
        ['Busca geral', filterLabel(terms.searchText, 'Nenhuma')]
      ];
    }

    function generatePdf(records, terms) {
      if (!records.length) {
        window.alert('Não há contratos para gerar relatório com os filtros selecionados.');
        return;
      }

      const jsPdfConstructor = window.jspdf && window.jspdf.jsPDF;
      if (!jsPdfConstructor) {
        window.alert('A biblioteca de PDF ainda não foi carregada. Verifique a conexão com a internet e tente novamente.');
        return;
      }

      const doc = new jsPdfConstructor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      if (typeof doc.autoTable !== 'function') {
        window.alert('A biblioteca de tabela para PDF ainda não foi carregada. Verifique a conexão com a internet e tente novamente.');
        return;
      }

      const generatedAt = fmtDateTime.format(new Date());
      const title = categoryLabels[category] || 'Contratos';
      const sourceText = `Fonte: ${source.arquivo || 'Relatório de contratos'}${source.atualizadoEm ? ' - ' + source.atualizadoEm : ''}`;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 34;

      doc.setProperties({
        title: `Painel CABW - ${title}`,
        subject: 'Relatório de contratos filtrados',
        author: 'Painel CABW',
        creator: 'Painel CABW'
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.setTextColor(0, 38, 95);
      doc.text('Painel CABW - Relatório de Contratos', marginX, 34);

      doc.setFontSize(12);
      doc.text(textForPdf(title), marginX, 54);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(52, 59, 73);
      doc.text(textForPdf(`Gerado em: ${generatedAt}`), marginX, 70);
      doc.text(textForPdf(sourceText), marginX, 84);

      doc.autoTable({
        startY: 100,
        theme: 'grid',
        margin: { left: marginX, right: marginX },
        head: [['Filtro', 'Valor aplicado']],
        body: buildFilterRows(terms).map(row => row.map(textForPdf)),
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: [6, 38, 91] },
        headStyles: { fillColor: [0, 43, 102], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 90, fontStyle: 'bold' }, 1: { cellWidth: pageWidth - (marginX * 2) - 90 } }
      });

      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 12,
        theme: 'grid',
        margin: { left: marginX, right: marginX },
        head: [['Contratos', 'Valor contratado', 'Total empenhado USD', 'Total faturado USD']],
        body: [[
          fmtInt.format(records.length),
          byCurrency(records, 'valorContrato'),
          moneyUsd(sum(records, 'totalEmpenhadoUsd')),
          moneyUsd(sum(records, 'totalFaturadoUsd'))
        ].map(textForPdf)],
        styles: { font: 'helvetica', fontSize: 8.2, cellPadding: 5, textColor: [6, 38, 91] },
        headStyles: { fillColor: [0, 43, 102], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fontStyle: 'bold' }
      });

      const tableRows = records.map(item => [
        item.contrato,
        item.numero,
        item.unidade || '-',
        item.empresa,
        item.objetoResumo,
        item.moeda,
        money(item.valorContrato, item.moeda),
        moneyUsd(item.totalEmpenhadoUsd),
        moneyUsd(item.totalFaturadoUsd),
        item.dataFinal && item.dataFinal.br ? item.dataFinal.br : '-',
        computeStatus(item)
      ].map(textForPdf));

      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 14,
        margin: { left: marginX, right: marginX, bottom: 30 },
        theme: 'striped',
        head: [[
          'Contrato', 'Número', 'Unidade', 'Empresa', 'Objeto Resumido', 'Moeda',
          'Valor Contrato', 'Empenhado USD', 'Faturado USD', 'Data Final', 'Vigência'
        ]],
        body: tableRows,
        styles: {
          font: 'helvetica',
          fontSize: 6.2,
          cellPadding: 3,
          overflow: 'linebreak',
          valign: 'top',
          textColor: [6, 38, 91],
          lineColor: [226, 232, 240],
          lineWidth: 0.2
        },
        headStyles: { fillColor: [0, 43, 102], textColor: 255, fontStyle: 'bold', fontSize: 6.4 },
        alternateRowStyles: { fillColor: [246, 248, 251] },
        columnStyles: {
          0: { cellWidth: 46 },
          1: { cellWidth: 78 },
          2: { cellWidth: 38 },
          3: { cellWidth: 112 },
          4: { cellWidth: 160 },
          5: { cellWidth: 34, halign: 'center' },
          6: { cellWidth: 74, halign: 'right' },
          7: { cellWidth: 74, halign: 'right' },
          8: { cellWidth: 74, halign: 'right' },
          9: { cellWidth: 52, halign: 'center' },
          10: { cellWidth: 52, halign: 'center' }
        },
        didDrawPage: function () {
          const pageNo = doc.internal.getNumberOfPages();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(89, 98, 117);
          doc.text(textForPdf(`Painel CABW - ${title}`), marginX, pageHeight - 15);
          doc.text(`Página ${pageNo}`, pageWidth - marginX - 40, pageHeight - 15);
        }
      });

      const filename = [
        'relatorio-contratos',
        filenamePart(categoryLabels[category] || category),
        filenamePart(terms.empresa),
        filenamePart(terms.status),
        filenamePart(terms.unidade),
        filenamePart(terms.acao)
      ].filter(Boolean).join('-') || 'relatorio-contratos';

      doc.save(`${filename}.pdf`);
    }

    [empresa, unidade, acao, moeda, status, search].forEach(input => {
      if (input) input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', applyFilters);
    });

    if (pdfButton) {
      pdfButton.addEventListener('click', function () {
        generatePdf(currentRecords, currentTerms);
      });
    }

    if (reset) {
      reset.addEventListener('click', function () {
        [empresa, unidade, acao, moeda, status].forEach(input => { if (input) input.value = ''; });
        if (search) search.value = '';
        applyFilters();
      });
    }
    applyFilters();
  }

  renderOverview();
  renderPanel();
})();
