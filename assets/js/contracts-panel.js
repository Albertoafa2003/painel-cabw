
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
      .join(' / ') || '—';
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

  function computeStatus(item) {
    const today = '2026-06-09';
    if (item.dataFinal && item.dataFinal.iso) {
      return item.dataFinal.iso >= today ? 'Vigente' : 'Encerrado';
    }
    return 'Sem data final';
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

    fillSelect(empresa, unique(baseRecords, 'empresa'), 'Todas as empresas');
    fillSelect(unidade, unique(baseRecords, 'unidade'), 'Todas as unidades');
    fillSelect(acao, unique(baseRecords, 'acao'), 'Todas as ações');
    fillSelect(moeda, unique(baseRecords, 'moeda'), 'Todas as moedas');

    function applyFilters() {
      const terms = {
        empresa: empresa ? empresa.value : '',
        unidade: unidade ? unidade.value : '',
        acao: acao ? acao.value : '',
        moeda: moeda ? moeda.value : '',
        status: status ? status.value : '',
        search: normalize(search ? search.value : '')
      };
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
      renderSummary(filtered);
      renderRows(filtered);
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

    [empresa, unidade, acao, moeda, status, search].forEach(input => {
      if (input) input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', applyFilters);
    });
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
