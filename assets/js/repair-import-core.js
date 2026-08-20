export const NULL_TOKENS = new Set(["", "none", "null", "n/a", "-", "nan", "undefined"]);

export const ORIGIN_OM_MAP = Object.freeze({
  "EL": "PAME-RJ",
  "GL": "PAMA-GL",
  "PB": "PAMB-RJ",
  "SP": "PAMA-SP"
});

const ORIGIN_OM_ALIASES = Object.freeze({
  "EL": "PAME-RJ", "PAME-RJ": "PAME-RJ",
  "GL": "PAMA-GL", "PAMA-GL": "PAMA-GL",
  "PB": "PAMB-RJ", "PAMB-RJ": "PAMB-RJ",
  "SP": "PAMA-SP", "PAMA-SP": "PAMA-SP"
});

const ORIGIN_OM_SHORT_BY_CANONICAL = Object.freeze(
  Object.fromEntries(Object.entries(ORIGIN_OM_MAP).map(([shortCode, canonical]) => [canonical, shortCode]))
);

export const STATUS_STAGE_MAP = Object.freeze({
  "1-Empenho Aprovado": "Brasil/ OM Requisitante",
  "2-Item Chegou CTLA": "Brasil / CTLA",
  "3-Item Exp CTLA": "Trânsito ao Reparador",
  "4-Item chegou CABW/CABE": "Trânsito ao Reparador",
  "5-Item Exp Reparador": "Trânsito ao Reparador",
  "6-Item no Reparador": "Reparador",
  "7-Item Recebido": "CABW/CABE (retorno)",
  "8-Embarcado": "CABW/CABE (retorno)",
  "9-Recebido Parque": "Brasil/ OM Requisitante",
  "10-Encerrado": "Brasil/ OM Requisitante"
});

export const REAL_STATUS_OPTIONS = Object.freeze(Object.keys(STATUS_STAGE_MAP));

export const VISUAL_STAGE_OPTIONS = Object.freeze([
  "Brasil/ OM Requisitante",
  "Brasil / CTLA",
  "Trânsito ao Reparador",
  "Reparador",
  "CABW/CABE (retorno)",
  "ETAPA NÃO MAPEADA"
]);

const STATUS_ALIAS_MAP = Object.freeze({
  "1-empenho aprovado": "1-Empenho Aprovado",
  "2-item chegou ctla": "2-Item Chegou CTLA",
  "3-item exp ctla": "3-Item Exp CTLA",
  "3-rep chegou ctla": "2-Item Chegou CTLA",
  "4-item chegou cabw/cabe": "4-Item chegou CABW/CABE",
  "4-item chegou cabw/e": "4-Item chegou CABW/CABE",
  "5-item exp reparador": "5-Item Exp Reparador",
  "5-item exp ao reparador": "5-Item Exp Reparador",
  "6-item no reparador": "6-Item no Reparador",
  "6-rep exp ao reparador": "5-Item Exp Reparador",
  "7-item recebido": "7-Item Recebido",
  "7-rep recebido": "7-Item Recebido",
  "8-embarcado": "8-Embarcado",
  "8-rep embarcado": "8-Embarcado",
  "9-recebido parque": "9-Recebido Parque",
  "10-encerrado": "10-Encerrado"
});

export const DEPRECATED_REAL_STATUSES = new Set([]);
export const DEPRECATED_CONDITIONS = new Set(["EXCHANGE"]);

export const REQUIRED_HEADERS = Object.freeze([
  "PO", "TTE", "DATA EMISSÃO PO", "STATUS REAL DO MATERIAL", "REQUISIÇÃO", "PN", "SN", "COND",
  "MAT EXP ou REC REPARADOR", "TRACKING ENVIO REPARADOR", "PRAZO p/ ENVIO TDR p/ REPARADOR",
  "TDR ENV PARQUE", "SUBPROC #", "FICHA RECEBIDA", "SERVIÇO APROVADO?",
  "SVC AUTORIZADO / SOL RETORNO AS IS", "PRAZO ENTREGA (DIAS)", "DPE FINAL",
  "TRACKING/VOLUME RETORNO REPARADOR -> DEPÓSITO", "RETORNO MAT", "CAGE CODE REPARADOR", "NOME REPARADOR"
]);

export const IMPORTED_FIELDS = Object.freeze([
  "po", "evaluationFee", "evaluationFeeCurrency", "evaluationFeeRaw", "evaluationFeeDiscardReason",
  "poIssueDate", "realStatus", "realStatusSource", "realStatusDiscardReason", "visualStage", "requisition", "originOm", "originOmSource", "originOmShortCode", "originOmNormalizationVersion", "originDerived",
  "partNumber", "serialNumber", "condition", "conditionSource", "conditionDiscardReason", "receivedAtRepairerDate", "trackingToRepairer",
  "tdrDueDate", "tdrDeliveryRaw", "tdrDeliveryIndicator", "tdrSentDate", "tdrDelivered",
  "subprocessRaw", "fichaRaw", "fichaDate", "documentaryStatusCode", "documentaryStatusLabel",
  "serviceDecision", "serviceAuthorizationOrAsIsDate", "serviceDateLabel", "repairDeliveryDays", "dpeFinalDate", "dpeFinalIndicator",
  "returnTrackingVolume", "returnMaterialDate", "returnDeadlineCodeAtImport", "returnDeadlineLabelAtImport", "returnDaysAtImport",
  "returnStatusSourceFileName", "returnStatusSourceSheet", "returnStatusSourceRow", "returnStatusReferenceDate", "returnStatusUpdatedAt",
  "repairerCage", "repairerName", "importKey", "archivedOutOfScope", "outOfScopeReason"
]);

export const MANUAL_FIELDS = Object.freeze(["processNumber", "description", "itemValue", "repairValue", "currency", "manualNotes"]);

export function normalizeNullable(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (NULL_TOKENS.has(text.toLowerCase())) return null;
  return text;
}

export function normalizeControlValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function normalizeIdentifier(value) { return normalizeNullable(value); }
export function isPo2024(value) { return /^24T/i.test(String(value || "").trim()); }

function normalizeStatusToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
}

export function normalizeRealStatus(value) {
  const raw = normalizeNullable(value);
  if (!raw) return { value: null, raw, discardedReason: null };
  const normalizedToken = normalizeStatusToken(raw);
  const canonical = STATUS_ALIAS_MAP[normalizedToken]
    || REAL_STATUS_OPTIONS.find(status => normalizeStatusToken(status) === normalizedToken)
    || raw;
  return { value: canonical, raw, discardedReason: null };
}

export function normalizeRepairCondition(value) {
  const raw = normalizeNullable(value);
  if (raw && DEPRECATED_CONDITIONS.has(raw.toUpperCase())) return { value: null, raw, discardedReason: "condition-not-used" };
  return { value: raw, raw, discardedReason: null };
}

export function normalizeHeader(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

export function normalizeSearch(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function parseFlexibleNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let text = normalizeControlValue(value);
  if (text === null) return null;
  text = text.replace(/\s+/g, "");
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  text = text.replace(/[^0-9.+-]/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function excelSerialToIso(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function parseDateToIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  if (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value); if (serial > 20000) return excelSerialToIso(serial);
  }
  const text = normalizeControlValue(value);
  if (!text || text.toLowerCase() === "none") return null;
  let match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function addDaysIso(isoDate, days) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day)); date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function daysBetweenIso(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const toUtc = iso => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86400000);
}

export function mapVisualStage(status) {
  const normalized = normalizeRealStatus(status).value;
  return normalized
    ? (STATUS_STAGE_MAP[normalized] || "ETAPA NÃO MAPEADA")
    : "ETAPA NÃO MAPEADA";
}

function normalizeOriginOmToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[_.\s/]+/g, "-")
    .replace(/-+/g, "-");
}

export function normalizeOriginOm(value) {
  const raw = normalizeNullable(value);
  if (!raw) return { value: null, raw: null, shortCode: null };
  const token = normalizeOriginOmToken(raw);
  const canonical = ORIGIN_OM_ALIASES[token] || raw;
  const shortCode = ORIGIN_OM_MAP[token] ? token : (ORIGIN_OM_SHORT_BY_CANONICAL[canonical] || null);
  return { value: canonical, raw, shortCode };
}

export function deriveOriginOm(rawOm, requisition) {
  const explicit = normalizeOriginOm(rawOm);
  if (explicit.value) return { value: explicit.value, source: explicit.raw, shortCode: explicit.shortCode, derived: false };
  const req = normalizeIdentifier(requisition);
  const derivedCode = req && req.length >= 2 ? req.slice(0, 2).toUpperCase() : null;
  const normalized = normalizeOriginOm(derivedCode);
  return {
    value: normalized.value || derivedCode,
    source: derivedCode,
    shortCode: normalized.shortCode || derivedCode,
    derived: Boolean(derivedCode)
  };
}

export function normalizeEvaluationFee({ po, rawValue, formula }) {
  const rawText = normalizeControlValue(rawValue); const normalizedFormula = String(formula || "").toUpperCase();
  if (normalizedFormula.includes("LEFT(") || normalizedFormula.includes("ESQUERDA(")) return { value: null, raw: rawText, discardedReason: "formula-year" };
  const parsed = parseFlexibleNumber(rawValue); if (parsed === null) return { value: null, raw: rawText, discardedReason: null };
  const poText = normalizeIdentifier(po) || "";
  if (rawText && rawText.length === 2 && rawText === poText.slice(0, 2)) return { value: null, raw: rawText, discardedReason: "year-like" };
  return { value: parsed, raw: rawText, discardedReason: null };
}

export function calculateTdrStatus(dueDate, deliveryRaw, sentDate, referenceDateIso) {
  const raw = normalizeControlValue(deliveryRaw);
  const deliveredWithoutDate = raw && raw.toLowerCase() === "none";
  if (sentDate || deliveredWithoutDate) {
    return { dueDate: dueDate || null, code: "delivered", label: sentDate ? `TDR entregue em ${formatIsoDate(sentDate)}` : "TDR entregue — sem data informada", days: null };
  }
  if (!dueDate) return { dueDate: null, code: "not-calculable", label: "Prazo não informado — coluna M sem data", days: null };
  const remaining = daysBetweenIso(referenceDateIso, dueDate);
  if (remaining < 0) return { dueDate, code: "overdue", label: `TDR atrasado (${Math.abs(remaining)} dia(s))`, days: remaining };
  if (remaining <= 7) return { dueDate, code: "due-soon", label: `TDR próximo do vencimento (${remaining} dia(s))`, days: remaining };
  return { dueDate, code: "pending", label: `TDR pendente no prazo (${remaining} dia(s) restantes)`, days: remaining };
}

export function classifyDocumentaryStatus(subprocessRaw, fichaRaw) {
  const kind = value => {
    const text = normalizeControlValue(value);
    if (!text) return "blank";
    return text.toLowerCase() === "none" ? "none" : "value";
  };
  const key = `${kind(subprocessRaw)}|${kind(fichaRaw)}`;
  const map = {
    "blank|blank": ["tdr-not-received", "TDR ainda não recebido"],
    "none|none": ["not-required", "Subprocesso e ficha não necessários"],
    "none|value": ["ficha-recorded-no-subprocess", "Ficha recebida; subprocesso não necessário"],
    "value|none": ["subprocess-recorded-no-ficha", "Subprocesso registrado; ficha não necessária"],
    "value|value": ["registered", "Subprocesso e ficha registrados"],
    "none|blank": ["subprocess-not-required-ficha-pending", "Subprocesso não necessário; ficha pendente"],
    "blank|none": ["ficha-not-required-subprocess-pending", "Ficha não necessária; subprocesso pendente"],
    "blank|value": ["ficha-recorded-subprocess-pending", "Ficha recebida; subprocesso pendente"],
    "value|blank": ["subprocess-recorded-ficha-pending", "Subprocesso registrado; ficha pendente"]
  };
  const [code, label] = map[key]; return { code, label };
}

export function calculateReturnDeadline(record, referenceDateIso) {
  const authorizationDate = normalizeNullable(record.serviceAuthorizationOrAsIsDate);
  const deliveryDays = Number(record.repairDeliveryDays);
  const hasDeliveryDays = record.repairDeliveryDays !== null
    && record.repairDeliveryDays !== undefined
    && record.repairDeliveryDays !== ""
    && Number.isFinite(deliveryDays);
  const dueDate = normalizeNullable(record.dpeFinalDate);
  const returnedDate = normalizeNullable(record.returnMaterialDate);

  if (!authorizationDate || !hasDeliveryDays || !dueDate) {
    return {
      code: "not-authorized",
      label: "Serviço ainda não autorizado — sem prazo de retorno",
      days: null,
      dueDate: dueDate || null,
      returnedDate: returnedDate || null
    };
  }

  if (returnedDate) {
    const delay = daysBetweenIso(dueDate, returnedDate);
    if (delay > 0) {
      return {
        code: "returned-late",
        label: `Item retornou com atraso (${delay} dia(s))`,
        days: delay,
        dueDate,
        returnedDate
      };
    }
    return {
      code: "returned-on-time",
      label: delay === 0
        ? "Item retornou no prazo"
        : `Item retornou no prazo (${Math.abs(delay)} dia(s) antes)`,
      days: delay,
      dueDate,
      returnedDate
    };
  }

  const remaining = daysBetweenIso(referenceDateIso, dueDate);
  if (remaining < 0) {
    return {
      code: "overdue",
      label: `Retorno atrasado (${Math.abs(remaining)} dia(s)); item ainda não retornou`,
      days: remaining,
      dueDate,
      returnedDate: null
    };
  }
  if (remaining === 0) {
    return {
      code: "due-today",
      label: "Retorno previsto para hoje",
      days: 0,
      dueDate,
      returnedDate: null
    };
  }
  if (remaining <= 30) {
    return {
      code: "due-30",
      label: `Retorno em até 30 dias (${remaining} dia(s))`,
      days: remaining,
      dueDate,
      returnedDate: null
    };
  }
  return {
    code: "on-time",
    label: `Retorno no prazo (${remaining} dia(s) restantes)`,
    days: remaining,
    dueDate,
    returnedDate: null
  };
}

function formatIsoDate(value) { const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || ""); }

export function stableKeySource(po, requisition, pn, sn) { return [po, requisition, pn, sn].map(value => (normalizeIdentifier(value) || "").toUpperCase()).join("|"); }
export async function sha256Hex(text) { const bytes = new TextEncoder().encode(String(text)); const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, "0")).join(""); }
export function comparableImportedData(record) { const output = {}; IMPORTED_FIELDS.forEach(field => { output[field] = record?.[field] ?? null; }); return output; }
export function importedDataEqual(a, b) { return JSON.stringify(comparableImportedData(a)) === JSON.stringify(comparableImportedData(b)); }
export function contextualServiceDateLabel(decision) { const value = normalizeNullable(decision); if (value === "SIM") return "Data de autorização do serviço"; if (value === "AS IS") return "Data de solicitação de retorno AS IS"; return "Data de autorização / retorno"; }
export function moneyDisplay(value, currency) { if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "Não informado"; if (!currency) return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} — Moeda não informada`; try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)).replace(/\u00a0/g, " "); } catch { return `${currency} ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`; } }
export function textDisplay(value) { return normalizeNullable(value) || "Não informado"; }
