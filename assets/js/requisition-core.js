export function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
}

export function normalizeUgCode(value) {
  const digits = normalizeText(value).replace(/\D/g, "");
  return digits.length === 6 ? digits : "";
}

export function normalizeExpenseNature(value) {
  return normalizeText(value).replace(/\D/g, "");
}

export function normalizePi(value) {
  return normalizeUpper(value).replace(/\s/g, "");
}

export function normalizeAction(value) {
  return normalizeUpper(value).replace(/\s/g, "");
}

export function buildMatchKey(record) {
  const ug = normalizeUgCode(record?.ugCode ?? record?.ug ?? record?.omCode);
  const action = normalizeAction(record?.action);
  const pi = normalizePi(record?.pi);
  const nature = normalizeExpenseNature(record?.expenseNature ?? record?.nature);
  if (!ug || !action || !pi || !nature) return "";
  return [ug, action, pi, nature].join("|");
}

export function toMoney(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
}

export function deriveBalanceToCommit(record) {
  if (Number.isFinite(Number(record?.balanceToCommit))) {
    return toMoney(Number(record.balanceToCommit));
  }
  return toMoney(Number(record?.requestValue ?? 0) - Number(record?.committedValue ?? 0));
}

export function normalizeRequisition(record, index = 0) {
  const requestValue = toMoney(record?.requestValue);
  const committedValue = toMoney(record?.committedValue);
  const balanceToCommit = deriveBalanceToCommit({ ...record, requestValue, committedValue });
  const normalized = {
    id: normalizeText(record?.id) || `req-${index + 1}`,
    requestNumber: normalizeUpper(record?.requestNumber ?? record?.requisition),
    ugCode: normalizeUgCode(record?.ugCode ?? record?.ug ?? record?.omCode),
    om: normalizeText(record?.om ?? record?.omName ?? record?.ugName),
    action: normalizeAction(record?.action),
    pi: normalizePi(record?.pi),
    expenseNature: normalizeExpenseNature(record?.expenseNature ?? record?.nature),
    requestValue,
    committedValue,
    balanceToCommit,
    status: normalizeText(record?.status) || (balanceToCommit > 0 ? "Disponível para empenho" : "Integralmente empenhada"),
    sourceRow: record?.sourceRow ?? null,
  };
  normalized.matchKey = buildMatchKey(normalized);
  normalized.classificationComplete = Boolean(normalized.matchKey);
  return normalized;
}

export function groupCredit(records = []) {
  const groups = new Map();
  records.forEach((record) => {
    const key = record?.matchKey || buildMatchKey(record);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, {
        matchKey: key,
        ugCode: normalizeUgCode(record.ugCode),
        om: normalizeText(record.om),
        ugName: normalizeText(record.ugName),
        action: normalizeAction(record.action),
        actionDescription: normalizeText(record.actionDescription),
        pi: normalizePi(record.pi),
        expenseNature: normalizeExpenseNature(record.expenseNature),
        creditAvailable: 0,
        launches: 0,
        ptres: new Set(),
        fundingSources: new Set(),
      });
    }
    const group = groups.get(key);
    group.creditAvailable = toMoney(group.creditAvailable + Number(record.creditAvailable ?? 0));
    group.launches += Number(record.launches ?? 1) || 1;
    (Array.isArray(record.ptres) ? record.ptres : [record.ptres]).filter(Boolean).forEach((value) => group.ptres.add(String(value)));
    (Array.isArray(record.fundingSources) ? record.fundingSources : [record.fundingSource]).filter(Boolean).forEach((value) => group.fundingSources.add(String(value)));
  });
  return Array.from(groups.values()).map((group) => ({
    ...group,
    ptres: Array.from(group.ptres).sort(),
    fundingSources: Array.from(group.fundingSources).sort(),
  }));
}

export function groupRequisitions(records = []) {
  const groups = new Map();
  records.map(normalizeRequisition).forEach((record) => {
    const key = record.matchKey || `INCOMPLETE|${record.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        matchKey: record.matchKey,
        classificationComplete: record.classificationComplete,
        ugCode: record.ugCode,
        om: record.om,
        action: record.action,
        pi: record.pi,
        expenseNature: record.expenseNature,
        requestCount: 0,
        requestValue: 0,
        committedValue: 0,
        balanceToCommit: 0,
        requestNumbers: [],
      });
    }
    const group = groups.get(key);
    group.requestCount += 1;
    group.requestValue = toMoney(group.requestValue + record.requestValue);
    group.committedValue = toMoney(group.committedValue + record.committedValue);
    group.balanceToCommit = toMoney(group.balanceToCommit + record.balanceToCommit);
    if (record.requestNumber) group.requestNumbers.push(record.requestNumber);
  });
  return Array.from(groups.values());
}

export function crossCreditAndRequisitions(creditRecords = [], requisitionRecords = []) {
  const creditGroups = new Map(groupCredit(creditRecords).map((item) => [item.matchKey, item]));
  const requisitionGroups = groupRequisitions(requisitionRecords);
  return requisitionGroups.map((request) => {
    const credit = request.matchKey ? creditGroups.get(request.matchKey) : null;
    const creditAvailable = toMoney(credit?.creditAvailable ?? 0);
    const demand = toMoney(request.balanceToCommit);
    const creditRemaining = toMoney(Math.max(creditAvailable - demand, 0));
    const deficit = toMoney(Math.max(demand - creditAvailable, 0));
    const coveragePercent = demand > 0 ? (creditAvailable / demand) * 100 : 100;
    let status = "Crédito suficiente";
    if (!request.classificationComplete) status = "Sem correspondência orçamentária";
    else if (!credit) status = "Sem crédito compatível";
    else if (creditAvailable < demand) status = "Crédito insuficiente";
    return {
      ...request,
      om: request.om || credit?.om || "",
      ugName: credit?.ugName || "",
      actionDescription: credit?.actionDescription || "",
      creditAvailable,
      creditRemaining,
      deficit,
      coveragePercent,
      status,
      ptres: credit?.ptres ?? [],
      fundingSources: credit?.fundingSources ?? [],
    };
  });
}
