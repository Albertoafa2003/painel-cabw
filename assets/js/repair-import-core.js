export const NULL_TOKENS = new Set(["", "none", "null", "n/a", "-", "nan", "undefined"]);

export const STATUS_STAGE_MAP = Object.freeze({
  "1-Empenho Aprovado": "Brasil / OM requisitante",
  "3-Rep chegou CTLA": "Brasil / CTLA",
  "6-Rep Exp ao Reparador": "Trânsito à oficina",
  "7-Rep Recebido": "CABW / CABE (retorno)"
});

export const DEPRECATED_REAL_STATUSES = new Set(["8-Rep Embarcado", "10-Encerrado"]);
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
  "poIssueDate", "realStatus", "realStatusSource", "realStatusDiscardReason", "visualStage", "requisition", "originOm", "originDerived",
  "partNumber", "serialNumber", "condition", "conditionSource", "conditionDiscardReason", "receivedAtRepairerDate", "trackingToRepairer",
  "tdrDueDate", "tdrDeliveryRaw", "tdrDeliveryIndicator", "tdrSentDate", "tdrDelivered",
  "subprocessRaw", "fichaRaw", "fichaDate", "documentaryStatusCode", "documentaryStatusLabel",
  "serviceDecision", "serviceAuthorizationOrAsIsDate", "serviceDateLabel", "repairDeliveryDays", "dpeFinalDate", "dpeFinalIndicator",
  "returnTrackingVolume", "returnMaterialDate", "repairerCage", "repairerName", "importKey", "archivedOutOfScope", "outOfScopeReason"
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

function normalizeStatusToken(value) { return String(value || "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " "); }

export function normalizeRealStatus(value) {
  const raw = normalizeNullable(value);
  const deprecated = raw && Array.from(DEPRECATED_REAL_STATUSES).some(status => normalizeStatusToken(status) === normalizeStatusToken(raw));
  if (deprecated) return { value: null, raw, discardedReason: "status-not-used" };
  const canonical = raw && Object.keys(STATUS_STAGE_MAP).find(status => normalizeStatusToken(status) === normalizeStatusToken(raw));
  return { value: canonical || raw, raw, discardedReason: null };
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
  return normalized ? (STATUS_STAGE_MAP[normalized] || "Etapa não mapeada") : "Etapa não mapeada";
}

export function deriveOriginOm(rawOm, requisition) {
  const om = normalizeNullable(rawOm); if (om) return { value: om, derived: false };
  const req = normalizeIdentifier(requisition); const derived = req && req.length >= 2 ? req.slice(0, 2) : null;
  return { value: derived, derived: Boolean(derived) };
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
  const deliveredText = String(record.dpeFinalIndicator || "").toUpperCase() === "ENTREGUE";
  if (!record.dpeFinalDate) return deliveredText ? { code: "delivered-indicator", label: "DPE indica ENTREGUE; validar status", days: null } : { code: "no-date", label: "Sem DPE informado", days: null };
  const remaining = daysBetweenIso(referenceDateIso, record.dpeFinalDate);
  if (remaining < 0) return { code: "overdue", label: `Retorno atrasado (${Math.abs(remaining)} dia(s))`, days: remaining };
  if (remaining <= 30) return { code: "due-30", label: `Retorno em até 30 dias (${remaining} dia(s))`, days: remaining };
  return { code: "on-time", label: `Retorno no prazo (${remaining} dia(s))`, days: remaining };
}

function formatIsoDate(value) { const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || ""); }

export function stableKeySource(po, requisition, pn, sn) { return [po, requisition, pn, sn].map(value => (normalizeIdentifier(value) || "").toUpperCase()).join("|"); }
export async function sha256Hex(text) { const bytes = new TextEncoder().encode(String(text)); const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, "0")).join(""); }
export function comparableImportedData(record) { const output = {}; IMPORTED_FIELDS.forEach(field => { output[field] = record?.[field] ?? null; }); return output; }
export function importedDataEqual(a, b) { return JSON.stringify(comparableImportedData(a)) === JSON.stringify(comparableImportedData(b)); }
export function contextualServiceDateLabel(decision) { const value = normalizeNullable(decision); if (value === "SIM") return "Data de autorização do serviço"; if (value === "AS IS") return "Data de solicitação de retorno AS IS"; return "Data de autorização / retorno"; }
export function moneyDisplay(value, currency) { if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "Não informado"; if (!currency) return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} — Moeda não informada`; try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)).replace(/\u00a0/g, " "); } catch { return `${currency} ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`; } }
export function textDisplay(value) { return normalizeNullable(value) || "Não informado"; }
