export const NULL_TOKENS = new Set(["", "none", "null", "n/a", "-", "nan", "undefined"]);

export const STATUS_STAGE_MAP = Object.freeze({
  "1-Empenho Aprovado": "Brasil / OM",
  "3-Rep chegou CTLA": "CABW / Washington",
  "6-Rep Exp ao Reparador": "Trânsito à oficina",
  "7-Rep Recebido": "Oficina reparadora",
  "8-Rep Embarcado": "Fluxo de retorno",
  "10-Encerrado": "Entregue à OM"
});

export const REQUIRED_HEADERS = Object.freeze([
  "PO",
  "TTE",
  "DATA EMISSÃO PO",
  "STATUS REAL DO MATERIAL",
  "REQUISIÇÃO",
  "OM",
  "PN",
  "SN",
  "COND",
  "MAT EXP ou REC REPARADOR",
  "TRACKING ENVIO REPARADOR",
  "TDR ENV PARQUE",
  "SERVIÇO APROVADO?",
  "SVC AUTORIZADO / SOL RETORNO AS IS",
  "PRAZO ENTREGA (DIAS)",
  "DPE FINAL",
  "TRACKING/VOLUME RETORNO REPARADOR -> DEPÓSITO",
  "RETORNO MAT",
  "CAGE CODE REPARADOR",
  "NOME REPARADOR"
]);

export const IMPORTED_FIELDS = Object.freeze([
  "po", "evaluationFee", "evaluationFeeCurrency", "evaluationFeeRaw", "evaluationFeeDiscardReason",
  "poIssueDate", "realStatus", "visualStage", "requisition", "originOm", "originDerived",
  "partNumber", "serialNumber", "condition", "receivedAtRepairerDate", "trackingToRepairer",
  "tdrDueDate", "tdrSentDate", "serviceDecision", "serviceAuthorizationOrAsIsDate", "serviceDateLabel",
  "repairDeliveryDays", "dpeFinalDate", "dpeFinalIndicator", "returnTrackingVolume", "returnMaterialDate",
  "repairerCage", "repairerName", "importKey"
]);

export const MANUAL_FIELDS = Object.freeze([
  "processNumber", "description", "itemValue", "repairValue", "currency", "manualNotes"
]);

export function normalizeNullable(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (NULL_TOKENS.has(text.toLowerCase())) return null;
  return text;
}

export function normalizeIdentifier(value) {
  return normalizeNullable(value);
}

export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFlexibleNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let text = normalizeNullable(value);
  if (text === null) return null;
  text = text.replace(/\s+/g, "");
  if (text.includes(",") && text.includes(".")) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  }
  text = text.replace(/[^0-9.+-]/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function excelSerialToIso(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1) return null;
  const wholeDays = Math.floor(serial);
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + wholeDays * 86400000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateToIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value);
    if (serial > 20000) return excelSerialToIso(serial);
  }
  const text = normalizeNullable(value);
  if (!text) return null;
  let match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return null;
}

export function addDaysIso(isoDate, days) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function compareIsoDates(a, b) {
  if (!a || !b) return null;
  return a === b ? 0 : a < b ? -1 : 1;
}

export function daysBetweenIso(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const toUtc = iso => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86400000);
}

export function mapVisualStage(status) {
  return STATUS_STAGE_MAP[normalizeNullable(status)] || "Etapa não mapeada";
}

export function deriveOriginOm(rawOm, requisition) {
  const om = normalizeNullable(rawOm);
  if (om) return { value: om, derived: false };
  const req = normalizeIdentifier(requisition);
  const derived = req && req.length >= 2 ? req.slice(0, 2) : null;
  return { value: derived, derived: Boolean(derived) };
}

export function normalizeEvaluationFee({ po, rawValue, formula }) {
  const rawText = normalizeNullable(rawValue);
  const normalizedFormula = String(formula || "").toUpperCase();
  if (normalizedFormula.includes("LEFT(") || normalizedFormula.includes("ESQUERDA(")) {
    return { value: null, raw: rawText, discardedReason: "formula-year" };
  }
  const parsed = parseFlexibleNumber(rawText);
  if (parsed === null) return { value: null, raw: rawText, discardedReason: null };
  const poText = normalizeIdentifier(po) || "";
  if (rawText && rawText.length === 2 && rawText === poText.slice(0, 2)) {
    return { value: null, raw: rawText, discardedReason: "year-like" };
  }
  return { value: parsed, raw: rawText, discardedReason: null };
}

export function calculateTdrStatus(receivedAtRepairerDate, tdrSentDate, referenceDateIso) {
  if (!receivedAtRepairerDate) {
    return {
      dueDate: null,
      code: "not-calculable",
      label: "Prazo não calculável — recebimento no reparador não informado",
      days: null
    };
  }
  const dueDate = addDaysIso(receivedAtRepairerDate, 45);
  if (tdrSentDate) {
    const difference = daysBetweenIso(dueDate, tdrSentDate);
    if (difference <= 0) return { dueDate, code: "sent-on-time", label: "Enviado no prazo", days: Math.abs(difference) };
    return { dueDate, code: "sent-late", label: `Enviado com atraso (${difference} dia(s))`, days: difference };
  }
  const remaining = daysBetweenIso(referenceDateIso, dueDate);
  if (remaining < 0) return { dueDate, code: "overdue", label: `TDR atrasado (${Math.abs(remaining)} dia(s))`, days: remaining };
  if (remaining <= 7) return { dueDate, code: "due-soon", label: `TDR próximo do vencimento (${remaining} dia(s))`, days: remaining };
  return { dueDate, code: "on-time", label: `TDR no prazo (${remaining} dia(s) restantes)`, days: remaining };
}

export function calculateReturnDeadline(record, referenceDateIso) {
  const status = normalizeNullable(record.realStatus);
  const deliveredText = String(record.dpeFinalIndicator || "").toUpperCase() === "ENTREGUE";
  if (status === "10-Encerrado") return { code: "completed", label: "Concluído / entregue", days: null };
  if (!record.dpeFinalDate) {
    if (deliveredText) return { code: "delivered-indicator", label: "DPE indica ENTREGUE; validar status", days: null };
    return { code: "no-date", label: "Sem DPE informado", days: null };
  }
  const remaining = daysBetweenIso(referenceDateIso, record.dpeFinalDate);
  if (remaining < 0) return { code: "overdue", label: `Retorno atrasado (${Math.abs(remaining)} dia(s))`, days: remaining };
  if (remaining <= 30) return { code: "due-30", label: `Retorno em até 30 dias (${remaining} dia(s))`, days: remaining };
  return { code: "on-time", label: `Retorno no prazo (${remaining} dia(s))`, days: remaining };
}

export function stableKeySource(po, requisition, pn, sn) {
  return [po, requisition, pn, sn]
    .map(value => (normalizeIdentifier(value) || "").toUpperCase())
    .join("|");
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, "0")).join("");
}

export function comparableImportedData(record) {
  const output = {};
  IMPORTED_FIELDS.forEach(field => {
    output[field] = record?.[field] ?? null;
  });
  return output;
}

export function importedDataEqual(a, b) {
  return JSON.stringify(comparableImportedData(a)) === JSON.stringify(comparableImportedData(b));
}

export function contextualServiceDateLabel(decision) {
  const value = normalizeNullable(decision);
  if (value === "SIM") return "Data de autorização do serviço";
  if (value === "AS IS") return "Data de solicitação de retorno AS IS";
  return "Data de autorização / retorno";
}

export function moneyDisplay(value, currency) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "Não informado";
  if (!currency) return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} — Moeda não informada`;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)).replace(/\u00a0/g, " ");
  } catch {
    return `${currency} ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
  }
}

export function textDisplay(value) {
  return normalizeNullable(value) || "Não informado";
}
