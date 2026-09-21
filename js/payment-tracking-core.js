export const PAYMENT_STATUSES = Object.freeze([
  "Fatura recebida",
  "Em conferência documental",
  "Pendência documental",
  "Aguardando atesto",
  "Aguardando liquidação",
  "Aguardando autorização de pagamento",
  "Pagamento programado",
  "Pago",
  "Suspenso",
  "Cancelado"
]);

export const PAYMENT_STAGES = Object.freeze([
  "Documentação",
  "Atestação",
  "Liquidação",
  "Programação financeira",
  "Pagamento",
  "Pendência",
  "Encerrado sem pagamento"
]);

export const STATUS_STAGE_MAP = Object.freeze({
  "Fatura recebida": "Documentação",
  "Em conferência documental": "Documentação",
  "Pendência documental": "Pendência",
  "Aguardando atesto": "Atestação",
  "Aguardando liquidação": "Liquidação",
  "Aguardando autorização de pagamento": "Programação financeira",
  "Pagamento programado": "Programação financeira",
  "Pago": "Pagamento",
  "Suspenso": "Pendência",
  "Cancelado": "Encerrado sem pagamento",
  "Não informado": "Pendência"
});

export const PAYMENT_IMPORT_HEADERS = Object.freeze([
  "ID PAGAMENTO",
  "FORNECEDOR",
  "NUP",
  "CONTRATO OU PAG",
  "EMPENHO OU PO",
  "FATURA OU INVOICE",
  "TIPO DO DOCUMENTO",
  "MOEDA",
  "VALOR BRUTO",
  "RETENCOES OU DESCONTOS",
  "VALOR LIQUIDO",
  "DATA DE EMISSAO",
  "DATA DE RECEBIMENTO",
  "DATA DE VENCIMENTO",
  "PREVISAO DE PAGAMENTO",
  "DATA DO PAGAMENTO",
  "STATUS",
  "UNIDADE DEMANDANTE",
  "RESPONSAVEL",
  "REFERENCIA DO PAGAMENTO",
  "OBSERVACOES"
]);

export const IMPORTED_PAYMENT_FIELDS = Object.freeze([
  "supplier",
  "nup",
  "contractPag",
  "commitmentPo",
  "invoiceNumber",
  "documentType",
  "currency",
  "grossAmount",
  "deductions",
  "netAmount",
  "issueDate",
  "receivedDate",
  "dueDate",
  "scheduledDate",
  "paidDate",
  "status",
  "stage",
  "requestingUnit",
  "responsible",
  "paymentReference",
  "observations"
]);

const STATUS_ALIASES = Object.freeze({
  "FATURA RECEBIDA": "Fatura recebida",
  "RECEBIDA": "Fatura recebida",
  "RECEBIDO": "Fatura recebida",
  "DOCUMENTO RECEBIDO": "Fatura recebida",
  "EM CONFERENCIA": "Em conferência documental",
  "CONFERENCIA DOCUMENTAL": "Em conferência documental",
  "EM CONFERENCIA DOCUMENTAL": "Em conferência documental",
  "ANALISE DOCUMENTAL": "Em conferência documental",
  "PENDENCIA": "Pendência documental",
  "PENDENCIA DOCUMENTAL": "Pendência documental",
  "DOCUMENTACAO PENDENTE": "Pendência documental",
  "AGUARDANDO DOCUMENTACAO": "Pendência documental",
  "AGUARDANDO ATESTE": "Aguardando atesto",
  "EM ATESTE": "Aguardando atesto",
  "PARA ATESTE": "Aguardando atesto",
  "AGUARDANDO LIQUIDACAO": "Aguardando liquidação",
  "EM LIQUIDACAO": "Aguardando liquidação",
  "LIQUIDACAO": "Aguardando liquidação",
  "AGUARDANDO AUTORIZACAO": "Aguardando autorização de pagamento",
  "AGUARDANDO AUTORIZACAO DE PAGAMENTO": "Aguardando autorização de pagamento",
  "AUTORIZACAO DE PAGAMENTO": "Aguardando autorização de pagamento",
  "PAGAMENTO AUTORIZADO": "Pagamento programado",
  "PAGAMENTO PROGRAMADO": "Pagamento programado",
  "PROGRAMADO": "Pagamento programado",
  "AGENDADO": "Pagamento programado",
  "PAGO": "Pago",
  "PAGAMENTO EFETUADO": "Pago",
  "QUITADO": "Pago",
  "CONCLUIDO": "Pago",
  "SUSPENSO": "Suspenso",
  "PAGAMENTO SUSPENSO": "Suspenso",
  "CANCELADO": "Cancelado",
  "CANCELADA": "Cancelado"
});

const HEADER_ALIASES = Object.freeze({
  paymentId: ["ID", "ID PAGAMENTO", "CODIGO", "CODIGO DO PAGAMENTO"],
  supplier: ["FORNECEDOR", "EMPRESA", "CREDOR", "NOME DO FORNECEDOR", "RAZAO SOCIAL"],
  nup: ["NUP", "PROCESSO", "NUMERO DO PROCESSO", "N PROCESSO", "PROCESSO NUP"],
  contractPag: ["CONTRATO OU PAG", "CONTRATO/PAG", "CONTRATO", "PAG", "NRO CONTRATO OU PAG", "NUMERO DO CONTRATO"],
  commitmentPo: ["EMPENHO OU PO", "EMPENHO/PO", "EMPENHO", "PO", "NOTA DE EMPENHO", "PURCHASE ORDER"],
  invoiceNumber: ["FATURA OU INVOICE", "FATURA/INVOICE", "FATURA", "INVOICE", "NUMERO DA FATURA", "NOTA FISCAL", "NF"],
  documentType: ["TIPO DO DOCUMENTO", "TIPO DOCUMENTO", "DOCUMENTO", "TIPO DE FATURA"],
  currency: ["MOEDA", "CURRENCY"],
  grossAmount: ["VALOR BRUTO", "TOTAL BRUTO", "GROSS AMOUNT", "VALOR DA FATURA"],
  deductions: ["RETENCOES OU DESCONTOS", "RETENCOES/DESCONTOS", "RETENCOES", "DESCONTOS", "DEDUCTIONS"],
  netAmount: ["VALOR LIQUIDO", "VALOR A PAGAR", "LIQUIDO", "NET AMOUNT", "VALOR"],
  issueDate: ["DATA DE EMISSAO", "EMISSAO", "ISSUE DATE", "DATA DA FATURA"],
  receivedDate: ["DATA DE RECEBIMENTO", "RECEBIMENTO", "RECEBIDO EM", "DATA DE ENTRADA"],
  dueDate: ["DATA DE VENCIMENTO", "VENCIMENTO", "DUE DATE", "PRAZO DE PAGAMENTO"],
  scheduledDate: ["PREVISAO DE PAGAMENTO", "DATA PROGRAMADA", "PAGAMENTO PREVISTO", "SCHEDULED PAYMENT DATE"],
  paidDate: ["DATA DO PAGAMENTO", "PAGO EM", "PAGAMENTO EFETIVO", "PAYMENT DATE"],
  status: ["STATUS", "SITUACAO", "SITUACAO DO PAGAMENTO", "ETAPA ATUAL"],
  requestingUnit: ["UNIDADE DEMANDANTE", "UNIDADE", "OM", "UGR", "NOME UGR", "SETOR"],
  responsible: ["RESPONSAVEL", "FISCAL", "GESTOR", "RESPONSAVEL PELO PAGAMENTO"],
  paymentReference: ["REFERENCIA DO PAGAMENTO", "COMPROVANTE", "NUMERO DO CHEQUE", "CHECK NUMBER", "ACH", "REFERENCIA BANCARIA"],
  observations: ["OBSERVACOES", "OBSERVACAO", "PENDENCIAS", "PROVIDENCIAS", "NOTAS"]
});

export function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/_x000D_|_x000A_|\r|\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeToken(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[º°ª]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function normalizeStatus(value) {
  const raw = normalizeText(value);
  if (!raw) return "Não informado";
  const token = normalizeToken(raw);
  if (STATUS_ALIASES[token]) return STATUS_ALIASES[token];
  const official = PAYMENT_STATUSES.find(item => normalizeToken(item) === token);
  return official || raw;
}

export function stageForStatus(status) {
  const normalized = normalizeStatus(status);
  return STATUS_STAGE_MAP[normalized] || "Pendência";
}

export function normalizeCurrency(value) {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return "";
  if (raw === "$" || raw.includes("US$")) return "USD";
  if (raw === "R$" || raw.includes("BRL")) return "BRL";
  if (raw === "€") return "EUR";
  if (raw === "£") return "GBP";
  const token = normalizeToken(raw).replace(/\s/g, "");
  const aliases = {
    "US": "USD",
    "USD": "USD",
    "DOLAR": "USD",
    "DOLLAR": "USD",
    "EUR": "EUR",
    "EURO": "EUR",
    "GBP": "GBP",
    "LIBRA": "GBP",
    "BRL": "BRL",
    "R": "BRL",
    "REAL": "BRL",
    "CAD": "CAD",
    "JPY": "JPY"
  };
  return aliases[token] || token || "";
}

export function parseFlexibleNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let text = normalizeText(value)
    .replace(/\u00a0/g, "")
    .replace(/[A-Za-z$€£R]/g, "")
    .replace(/\s/g, "");
  if (!text) return null;

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  if (hasComma && hasDot) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = text.split(",");
    text = parts.length === 2 && parts[1].length <= 2
      ? `${parts[0].replace(/\./g, "")}.${parts[1]}`
      : text.replace(/,/g, "");
  } else if (hasDot) {
    const parts = text.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      text = text.replace(/\./g, "");
    }
  }

  text = text.replace(/[^0-9.-]/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDateToIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const millis = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const text = normalizeText(value);
  if (!text || /^NONE$|^NULL$|^N\/A$|^-$|^#REF!$/i.test(text)) return null;

  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const iso = `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  match = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const iso = `${year}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function differenceInDays(fromIso, toIso) {
  if (!isValidIsoDate(fromIso) || !isValidIsoDate(toIso)) return null;
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86400000);
}

export function classifyPaymentDeadline(record, referenceDate = todayIso()) {
  const status = normalizeStatus(record?.status);
  const dueDate = parseDateToIso(record?.dueDate);
  const paidDate = parseDateToIso(record?.paidDate);

  if (status === "Cancelado") {
    return { code: "cancelled", label: "Cancelado", days: null, severity: "muted" };
  }
  if (status === "Suspenso") {
    return { code: "suspended", label: "Suspenso", days: null, severity: "warning" };
  }
  if (paidDate || status === "Pago") {
    if (!paidDate) {
      return { code: "paid-no-date", label: "Pago — data não informada", days: null, severity: "success" };
    }
    if (!dueDate) {
      return { code: "paid-no-due", label: "Pago — sem vencimento informado", days: null, severity: "success" };
    }
    const delay = differenceInDays(dueDate, paidDate);
    if (delay > 0) {
      return { code: "paid-late", label: `Pago com ${delay} dia(s) de atraso`, days: delay, severity: "warning" };
    }
    const early = Math.abs(delay || 0);
    return {
      code: "paid-on-time",
      label: early ? `Pago no prazo — ${early} dia(s) antes` : "Pago no vencimento",
      days: delay,
      severity: "success"
    };
  }
  if (!dueDate) {
    return { code: "no-due-date", label: "Sem vencimento informado", days: null, severity: "muted" };
  }
  const daysRemaining = differenceInDays(referenceDate, dueDate);
  if (daysRemaining < 0) {
    return { code: "overdue", label: `Vencido há ${Math.abs(daysRemaining)} dia(s)`, days: daysRemaining, severity: "danger" };
  }
  if (daysRemaining === 0) {
    return { code: "due-today", label: "Vence hoje", days: 0, severity: "danger" };
  }
  if (daysRemaining <= 7) {
    return { code: "due-7", label: `Vence em ${daysRemaining} dia(s)`, days: daysRemaining, severity: "warning" };
  }
  if (daysRemaining <= 30) {
    return { code: "due-30", label: `Vence em ${daysRemaining} dia(s)`, days: daysRemaining, severity: "attention" };
  }
  return { code: "in-time", label: `No prazo — ${daysRemaining} dia(s)`, days: daysRemaining, severity: "info" };
}

export function buildHeaderMap(headers) {
  const normalizedHeaders = headers.map(normalizeToken);
  const map = {};
  Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
    const aliasTokens = aliases.map(normalizeToken);
    const index = normalizedHeaders.findIndex(header => aliasTokens.includes(header));
    if (index >= 0) map[field] = index;
  });
  return map;
}

export function getMappedCell(row, headerMap, field) {
  const index = headerMap[field];
  return Number.isInteger(index) && index >= 0 ? row[index] : null;
}

export function stablePaymentKeySource(record) {
  const supplier = normalizeToken(record?.supplier);
  const invoice = normalizeToken(record?.invoiceNumber);
  const nup = normalizeToken(record?.nup);
  const contractPag = normalizeToken(record?.contractPag);
  const commitmentPo = normalizeToken(record?.commitmentPo);
  if (invoice) {
    return [supplier, invoice, nup, contractPag, commitmentPo].join("|");
  }
  return [
    supplier,
    nup,
    contractPag,
    commitmentPo,
    normalizeToken(record?.documentType),
    parseDateToIso(record?.issueDate) || ""
  ].join("|");
}

export async function sha256Hex(value) {
  const text = String(value || "");
  if (globalThis.crypto?.subtle) {
    const encoded = new TextEncoder().encode(text);
    const hash = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function normalizeImportedPayment(row, headerMap, context = {}) {
  const supplier = normalizeText(getMappedCell(row, headerMap, "supplier"));
  const nup = normalizeText(getMappedCell(row, headerMap, "nup"));
  const contractPag = normalizeText(getMappedCell(row, headerMap, "contractPag"));
  const commitmentPo = normalizeText(getMappedCell(row, headerMap, "commitmentPo"));
  const invoiceNumber = normalizeText(getMappedCell(row, headerMap, "invoiceNumber"));
  const identifierCount = [nup, contractPag, commitmentPo, invoiceNumber].filter(Boolean).length;
  const warnings = [];
  const errors = [];

  if (!supplier) errors.push("Fornecedor não informado");
  if (!identifierCount) errors.push("Informe ao menos NUP, Contrato/PAG, Empenho/PO ou Fatura/Invoice");

  const grossAmount = parseFlexibleNumber(getMappedCell(row, headerMap, "grossAmount"));
  const deductions = parseFlexibleNumber(getMappedCell(row, headerMap, "deductions"));
  let netAmount = parseFlexibleNumber(getMappedCell(row, headerMap, "netAmount"));
  if (netAmount === null && grossAmount !== null) {
    netAmount = grossAmount - (deductions || 0);
    warnings.push("Valor líquido calculado a partir do valor bruto menos retenções/descontos");
  }
  if (grossAmount === null && netAmount === null) {
    warnings.push("Nenhum valor financeiro informado");
  }

  const currency = normalizeCurrency(getMappedCell(row, headerMap, "currency"));
  if ((grossAmount !== null || netAmount !== null) && !currency) {
    warnings.push("Moeda não informada");
  }

  const issueDate = parseDateToIso(getMappedCell(row, headerMap, "issueDate"));
  const receivedDate = parseDateToIso(getMappedCell(row, headerMap, "receivedDate"));
  const dueDate = parseDateToIso(getMappedCell(row, headerMap, "dueDate"));
  const scheduledDate = parseDateToIso(getMappedCell(row, headerMap, "scheduledDate"));
  const paidDate = parseDateToIso(getMappedCell(row, headerMap, "paidDate"));
  const statusRaw = normalizeText(getMappedCell(row, headerMap, "status"));
  let status = normalizeStatus(statusRaw);
  if (!statusRaw && paidDate) {
    status = "Pago";
    warnings.push("Status definido como Pago porque a data do pagamento foi informada");
  } else if (!statusRaw) {
    warnings.push("Status não informado");
  } else if (paidDate && status !== "Pago") {
    warnings.push("Data do pagamento informada, mas o status não é Pago");
  } else if (!paidDate && status === "Pago") {
    warnings.push("Status Pago sem data efetiva de pagamento");
  }

  const payment = {
    supplier,
    nup: nup || null,
    contractPag: contractPag || null,
    commitmentPo: commitmentPo || null,
    invoiceNumber: invoiceNumber || null,
    documentType: normalizeText(getMappedCell(row, headerMap, "documentType")) || null,
    currency: currency || null,
    grossAmount,
    deductions,
    netAmount,
    issueDate,
    receivedDate,
    dueDate,
    scheduledDate,
    paidDate,
    status,
    stage: paidDate ? "Pagamento" : stageForStatus(status),
    requestingUnit: normalizeText(getMappedCell(row, headerMap, "requestingUnit")) || null,
    responsible: normalizeText(getMappedCell(row, headerMap, "responsible")) || null,
    paymentReference: normalizeText(getMappedCell(row, headerMap, "paymentReference")) || null,
    observations: normalizeText(getMappedCell(row, headerMap, "observations")) || null,
    archived: false,
    sourceFileName: context.fileName || null,
    sourceSheet: context.sheetName || null,
    sourceRow: context.sourceRow || null,
    importReferenceDate: context.referenceDate || null,
    qualityWarnings: warnings
  };

  const explicitId = normalizeText(getMappedCell(row, headerMap, "paymentId"));
  const importKey = explicitId || stablePaymentKeySource(payment);
  payment.importKey = importKey;
  payment.id = await sha256Hex(importKey);

  return { payment, errors, warnings };
}

export function importedPaymentEqual(existing, incoming) {
  return IMPORTED_PAYMENT_FIELDS.every(field => {
    const left = existing?.[field] ?? null;
    const right = incoming?.[field] ?? null;
    if (typeof left === "number" || typeof right === "number") {
      return Number(left ?? 0) === Number(right ?? 0);
    }
    return String(left ?? "") === String(right ?? "");
  });
}

export function aggregateByCurrency(records, field = "netAmount") {
  const totals = new Map();
  (records || []).forEach(record => {
    const amount = Number(record?.[field]);
    if (!Number.isFinite(amount)) return;
    const currency = normalizeCurrency(record?.currency) || "SEM MOEDA";
    totals.set(currency, (totals.get(currency) || 0) + amount);
  });
  return Array.from(totals.entries())
    .map(([currency, value]) => ({ currency, value }))
    .sort((a, b) => a.currency.localeCompare(b.currency, "pt-BR"));
}

export function formatMoney(value, currency = "") {
  if (value === null || value === undefined || value === "") return "Não informado";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Não informado";
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number);
  return currency ? `${currency} ${formatted}` : formatted;
}

export function paymentSearchText(record) {
  return [
    record?.supplier,
    record?.nup,
    record?.contractPag,
    record?.commitmentPo,
    record?.invoiceNumber,
    record?.documentType,
    record?.currency,
    record?.status,
    record?.stage,
    record?.requestingUnit,
    record?.responsible,
    record?.paymentReference,
    record?.observations
  ].map(normalizeText).join(" ").toLowerCase();
}
