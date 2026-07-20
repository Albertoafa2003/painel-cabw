(function () {
  const fmtNumber = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

  function sum(records, field) {
    return records.reduce((total, item) => total + Number(item[field] || 0), 0);
  }

  function money(value, currency) {
    return `${currency || 'USD'} ${fmtNumber.format(Number(value || 0))}`;
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
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([moeda, total]) => `${moeda} ${fmtNumber.format(total)}`)
      .join(' / ') || '-';
  }

  function setValue(key, value) {
    document.querySelectorAll(`[data-cabw-number="${key}"]`).forEach(el => {
      el.textContent = value;
    });
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

  function safeText(value, fallback) {
    return value == null || value === '' ? (fallback || '-') : String(value);
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Falha ao carregar ${path}`);
    return response.json();
  }

  function getLatestCreditSummary(creditJson) {
    const summary = Array.isArray(creditJson.summary) ? creditJson.summary : [];
    if (!summary.length) return null;
    return summary[summary.length - 1];
  }

  document.addEventListener('DOMContentLoaded', async function () {
    const contracts = window.CABW_CONTRACTS_DATA || [];
    const contractsSource = window.CABW_CONTRACTS_SOURCE || {};

    try {
      const [creditJson, rpSummary, contractsSummary] = await Promise.all([
        loadJson('assets/data/credit-current.json'),
        loadJson('assets/data/rp-summary.json'),
        loadJson('assets/data/contracts-summary.json')
      ]);

      const latestCredit = getLatestCreditSummary(creditJson) || [];
      const vigentes = contracts.filter(item => computeStatus(item) === 'Vigente');
      const counts = contractsSummary.counts || {};

      setValue('contracts-total', fmtInt.format(contracts.length));
      setValue('contracts-total-panel', fmtInt.format(contracts.length));
      setValue('contratos-vigentes', fmtInt.format(vigentes.length));
      setValue('valor-total-contratado', byCurrency(contracts, 'valorContrato'));
      setValue('valor-total-empenhado', moneyUsd(sum(contracts, 'totalEmpenhadoUsd')));
      setValue('contracts-fms', fmtInt.format(Number(counts.fms || 0)));
      setValue('contracts-finalisticos', fmtInt.format(Number(counts.finalisticos || 0)));
      setValue('contracts-administrativos', fmtInt.format(Number(counts.administrativos || 0)));

      setValue('credit-position', safeText(creditJson.position, latestCredit[0] || '-'));
      setValue('credito-posicao-panel', safeText(creditJson.position, latestCredit[0] || '-'));
      setValue('credito-disponivel', safeText(latestCredit[1], '-'));
      setValue('credito-recebido', safeText(latestCredit[2], '-'));
      setValue('credito-percentual', safeText(latestCredit[3], '-'));
      setValue('credito-comprometido', safeText(latestCredit[4], '-'));
      setValue('credito-lancamentos', fmtInt.format(Number((latestCredit[5] || '0').toString().replace(/\D/g, '') || 0)));

      setValue('saldo-rp', moneyUsd(Number(rpSummary.totalSaldoUsd || 0)));
      setValue('rp-registros', fmtInt.format(Number(rpSummary.totalRegistros || 0)));
      setValue('rp-oms', fmtInt.format(Number(rpSummary.totalOms || 0)));
      setValue('rp-contratos', fmtInt.format(Number(rpSummary.totalContratosPag || 0)));
      setValue('rp-anos', fmtInt.format(Number(rpSummary.totalAnosRp || 0)));
      setValue('rp-empenhos', fmtInt.format(Number(rpSummary.totalEmpenhos || 0)));

      setValue('fonte-contratos', safeText(contractsSource.arquivo, 'Base de contratos'));
      setValue('fonte-credito', safeText(creditJson.sourceFile || creditJson.position, 'Relatório de crédito disponível'));
      setValue('fonte-rp', safeText(rpSummary.sourceFile, 'Painel RP'));

      const sourceSummary = document.querySelector('[data-source-summary]');
      if (sourceSummary) {
        const creditRef = safeText(creditJson.position, '-');
        const conorRef = creditJson.references && creditJson.references.conorDataReference
          ? ` · CONOR: ${creditJson.references.conorDataReference}`
          : '';
        const contractRef = safeText(contractsSource.atualizadoEm, 'Base atual');
        const rpRef = safeText(rpSummary.sourceFile, 'Base atual');
        sourceSummary.textContent = `Posição do crédito: ${creditRef}${conorRef} · Contratos: ${contractRef} · RP: ${rpRef}`;
      }
    } catch (error) {
      console.error(error);
      const sourceSummary = document.querySelector('[data-source-summary]');
      if (sourceSummary) {
        sourceSummary.textContent = 'Não foi possível carregar automaticamente todas as bases de dados do painel.';
      }
    }
  });
})();
