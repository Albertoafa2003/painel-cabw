import { contractLifecycle, formatMoney, normalizeUnit, todayIso } from "./accountability-core.js?v=20260903-accountability-r1";

const contracts = Array.isArray(window.CABW_CONTRACTS_DATA) ? window.CABW_CONTRACTS_DATA : [];
const reference = todayIso();

function summarize(records) {
  const status = { active: 0, ended: 0, noDate: 0 };
  const currencies = new Map();
  records.forEach(contract => {
    const lifecycle = contractLifecycle(contract, reference);
    if (lifecycle.code === "active") status.active += 1;
    else if (lifecycle.code === "ended") status.ended += 1;
    else status.noDate += 1;
    const currency = contract.moeda || "N/I";
    currencies.set(currency, (currencies.get(currency) || 0) + Number(contract.totalEmpenhado || 0));
  });
  return { status, currencies };
}

function currencyText(map) {
  return [...map.entries()].map(([currency, value]) => formatMoney(value, currency)).join(" · ") || "Sem valores";
}

function apply(prefix, summary) {
  const current = summary.status.active + summary.status.noDate;
  const set = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  set(`${prefix}Current`, String(current));
  set(`${prefix}Active`, String(summary.status.active));
  set(`${prefix}NoDate`, String(summary.status.noDate));
  set(`${prefix}Ended`, String(summary.status.ended));
  set(`${prefix}Committed`, currencyText(summary.currencies));
}

document.addEventListener("DOMContentLoaded", () => {
  const cabw = contracts.filter(contract => normalizeUnit(contract.unidade) === "CABW");
  const supported = contracts.filter(contract => normalizeUnit(contract.unidade) !== "CABW");
  apply("accCabw", summarize(cabw));
  apply("accSupported", summarize(supported));
  const date = document.getElementById("accReferenceDate");
  if (date) date.textContent = new Intl.DateTimeFormat("pt-BR").format(new Date(`${reference}T12:00:00`));
});
