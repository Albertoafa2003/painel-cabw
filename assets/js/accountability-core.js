const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeToken(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function normalizeContractIdentifier(value) {
  let token = normalizeToken(value);
  token = token.replace(/^(?:CONTRATO|CONTRACT|PROCESSO|PAG|NUMERO|NRO|NR|N[º°O]?|CNT)\s*[:#\-]?\s*/i, "");
  return token.replace(/[^A-Z0-9]/g, "");
}

export function validContractAlias(value) {
  const alias = normalizeContractIdentifier(value);
  return alias.length >= 5 && !["NINFORMADO", "INFORMADO", "NENHUM", "NA", "NI"].includes(alias);
}

export function buildContractAliasIndex(contracts = []) {
  const candidates = new Map();
  contracts.forEach(contract => {
    [contract?.numero, contract?.contrato].forEach(source => {
      if (!validContractAlias(source)) return;
      const alias = normalizeContractIdentifier(source);
      const current = candidates.get(alias) || new Set();
      current.add(String(contract.id));
      candidates.set(alias, current);
    });
  });

  const byId = new Map(contracts.map(contract => [String(contract.id), contract]));
  const unique = new Map();
  candidates.forEach((ids, alias) => {
    if (ids.size === 1) unique.set(alias, byId.get([...ids][0]));
  });
  return unique;
}

export function resolveContractForPayment(payment, aliasIndex) {
  const raw = payment?.contractPag;
  const key = normalizeContractIdentifier(raw);
  if (!key) return null;
  if (aliasIndex.has(key)) return aliasIndex.get(key);

  const candidates = new Map();
  aliasIndex.forEach((contract, alias) => {
    if (alias.length >= 7 && (key.endsWith(alias) || key.includes(alias))) {
      candidates.set(String(contract.id), contract);
    }
  });
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

export function parseFlexibleNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let token = normalizeText(value).replace(/[^0-9,.-]/g, "");
  if (!token) return null;
  const comma = token.lastIndexOf(",");
  const dot = token.lastIndexOf(".");
  if (comma > dot) token = token.replace(/\./g, "").replace(",", ".");
  else if (dot > comma && comma >= 0) token = token.replace(/,/g, "");
  else if (comma >= 0) token = token.replace(",", ".");
  const number = Number(token);
  return Number.isFinite(number) ? number : null;
}

export function parseDateToIso(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") value = value.toDate();
  if (typeof value === "object" && Number.isFinite(value?.seconds)) value = new Date(value.seconds * 1000);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const text = normalizeText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function isoToUtcDate(iso) {
  const normalized = parseDateToIso(iso);
  return normalized ? new Date(`${normalized}T00:00:00Z`) : null;
}

export function addCalendarDays(iso, days) {
  const date = isoToUtcDate(iso);
  if (!date || !Number.isFinite(Number(days))) return null;
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

export function diffCalendarDays(fromIso, toIso) {
  const from = isoToUtcDate(fromIso);
  const to = isoToUtcDate(toIso);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function todayIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(iso, fallback = "Não informado") {
  const normalized = parseDateToIso(iso);
  if (!normalized) return fallback;
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

export function formatMoney(value, currency = "") {
  const number = parseFlexibleNumber(value);
  if (number === null) return "Não informado";
  const code = normalizeToken(currency);
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number);
  if (code === "USD") return `US$ ${formatted}`;
  if (code === "EUR") return `EUR ${formatted}`;
  return `${code ? `${code} ` : ""}${formatted}`;
}

export function contractLifecycle(contract, referenceIso = todayIso()) {
  const end = parseDateToIso(contract?.dataFinal?.iso || contract?.dataFinal);
  if (!end) return { code: "no-date", label: "Sem data de vigência", endDate: null, daysToEnd: null };
  const daysToEnd = diffCalendarDays(referenceIso, end);
  if (daysToEnd < 0) return { code: "ended", label: "Encerrado", endDate: end, daysToEnd };
  return { code: "active", label: "Vigente", endDate: end, daysToEnd };
}

export function amendmentDeadline(contract, referenceIso = todayIso()) {
  const end = parseDateToIso(contract?.dataFinal?.iso || contract?.dataFinal);
  if (!end) {
    return { code: "unknown", label: "Prazo não calculável", date: null, days: null };
  }
  const deadline = addCalendarDays(end, -120);
  const days = diffCalendarDays(referenceIso, deadline);
  if (days < 0) return { code: "overdue", label: `Prazo vencido há ${Math.abs(days)} dia(s)`, date: deadline, days };
  if (days === 0) return { code: "today", label: "Prazo vence hoje", date: deadline, days };
  if (days <= 30) return { code: "urgent", label: `Prazo em ${days} dia(s)`, date: deadline, days };
  if (days <= 60) return { code: "attention", label: `Prazo em ${days} dia(s)`, date: deadline, days };
  return { code: "regular", label: `Prazo em ${days} dia(s)`, date: deadline, days };
}

export function normalizePayment(input = {}) {
  const status = normalizeToken(input.status);
  const paidDate = parseDateToIso(input.paidDate);
  return {
    ...input,
    contractPag: normalizeText(input.contractPag),
    invoiceNumber: normalizeText(input.invoiceNumber),
    supplier: normalizeText(input.supplier),
    currency: normalizeToken(input.currency),
    grossAmount: parseFlexibleNumber(input.grossAmount),
    paidDate,
    status,
    archived: input.archived === true
  };
}

export function isPaidPayment(payment) {
  const record = normalizePayment(payment);
  return !record.archived && record.status !== "CANCELADO" && (record.status === "PAGO" || Boolean(record.paidDate));
}

export function monthKey(iso) {
  const normalized = parseDateToIso(iso);
  return normalized ? normalized.slice(0, 7) : null;
}

export function monthLabel(key) {
  if (!/^\d{4}-\d{2}$/.test(String(key || ""))) return "Não informado";
  const [year, month] = key.split("-");
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${year}-${month}-01T00:00:00Z`));
  return label.replace(" de ", "/").replace(".", "");
}

export function completedMonthBefore(month, referenceIso) {
  const currentMonth = monthKey(referenceIso);
  return Boolean(month && currentMonth && month < currentMonth);
}

export function contractPaymentSummary(payments = [], contractCurrency = "", referenceIso = todayIso()) {
  const currency = normalizeToken(contractCurrency);
  const paid = payments.map(normalizePayment).filter(isPaidPayment);
  const byCurrency = new Map();
  const monthly = new Map();
  let withoutAmount = 0;
  let withoutPaidDate = 0;

  paid.forEach(record => {
    if (record.grossAmount === null) {
      withoutAmount += 1;
      return;
    }
    const recordCurrency = record.currency || "NÃO INFORMADA";
    byCurrency.set(recordCurrency, (byCurrency.get(recordCurrency) || 0) + record.grossAmount);
    if (!record.paidDate) {
      withoutPaidDate += 1;
      return;
    }
    if (recordCurrency === currency) {
      const key = monthKey(record.paidDate);
      monthly.set(key, (monthly.get(key) || 0) + record.grossAmount);
    }
  });

  const completedMonthsWithPayment = [...monthly.entries()]
    .filter(([key, amount]) => completedMonthBefore(key, referenceIso) && amount > 0)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 3);
  const averageLastThree = completedMonthsWithPayment.length
    ? completedMonthsWithPayment.reduce((sum, [, amount]) => sum + amount, 0) / completedMonthsWithPayment.length
    : null;

  const primaryPaid = byCurrency.get(currency) || 0;
  const otherCurrencies = [...byCurrency.entries()]
    .filter(([key]) => key !== currency)
    .map(([key, amount]) => ({ currency: key, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    paidRecords: paid,
    paidCount: paid.length,
    primaryCurrency: currency,
    primaryPaid,
    otherCurrencies,
    byCurrency,
    monthly,
    averageLastThree,
    averageMonthCount: completedMonthsWithPayment.length,
    completedMonthsWithPayment,
    withoutAmount,
    withoutPaidDate
  };
}

export function coverageEstimate(committed, invoiced, monthlyAverage) {
  const committedValue = parseFlexibleNumber(committed);
  const invoicedValue = parseFlexibleNumber(invoiced);
  const available = committedValue === null || invoicedValue === null ? null : committedValue - invoicedValue;
  const months = available !== null && monthlyAverage && monthlyAverage > 0
    ? Math.max(0, available) / monthlyAverage
    : null;
  return { available, months };
}

export function calendarMonthSeries(monthlyMap, referenceIso = todayIso(), count = 12) {
  const date = isoToUtcDate(referenceIso);
  if (!date) return [];
  const series = [];
  date.setUTCDate(1);
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const current = new Date(date);
    current.setUTCMonth(current.getUTCMonth() - offset);
    const key = current.toISOString().slice(0, 7);
    series.push({
      key,
      label: monthLabel(key),
      amount: Number(monthlyMap?.get?.(key) || 0),
      partial: key === monthKey(referenceIso)
    });
  }
  return series;
}

export function monitoringTypeMap(records = []) {
  const map = new Map();
  records.forEach(record => {
    const key = normalizeContractIdentifier(record?.numero);
    if (key) map.set(key, normalizeToken(record?.tipoContrato) || "NÃO INFORMADO");
  });
  return map;
}

export function normalizeUnit(value) {
  const token = normalizeToken(value);
  const aliases = {
    PAMASP: "PAMA-SP",
    PAMAGL: "PAMA-GL",
    PAMALS: "PAMA-LS",
    PAME: "PAME-RJ"
  };
  return aliases[token] || normalizeText(value) || "Não informada";
}
