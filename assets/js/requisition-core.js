export const ANY = "*";

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

export function isWildcard(value) {
  const normalized = normalizeUpper(value);
  return !normalized ||
    normalized === ANY ||
    normalized === "QUALQUER" ||
    normalized.startsWith("QUALQUER AÇÃO") ||
    normalized.startsWith("QUALQUER ACAO") ||
    normalized.startsWith("QUALQUER PI") ||
    normalized.startsWith("QUALQUER PLANO INTERNO") ||
    normalized.startsWith("QUALQUER NATUREZA");
}

export function normalizeRequisitionCriterion(value, normalizer) {
  return isWildcard(value) ? ANY : normalizer(value);
}

export function criterionLabel(value, kind = "") {
  if (value !== ANY) return normalizeText(value);
  if (kind === "action") return "Qualquer Ação";
  if (kind === "pi") return "Qualquer PI";
  if (kind === "expenseNature") return "Qualquer Natureza";
  return "Qualquer";
}

/** Exact key used by credit records. All dimensions are mandatory. */
export function buildMatchKey(record) {
  const ug = normalizeUgCode(record?.ugCode ?? record?.ug ?? record?.omCode);
  const action = normalizeAction(record?.action);
  const pi = normalizePi(record?.pi);
  const nature = normalizeExpenseNature(record?.expenseNature ?? record?.nature);
  if (!ug || !action || !pi || !nature) return "";
  return [ug, action, pi, nature].join("|");
}

/** Requisition key. Ação, PI and Natureza may be wildcards; OM/UG is mandatory. */
export function buildRequisitionMatchKey(record) {
  const ug = normalizeUgCode(record?.ugCode ?? record?.ug ?? record?.omCode);
  const action = normalizeRequisitionCriterion(record?.action, normalizeAction);
  const pi = normalizeRequisitionCriterion(record?.pi, normalizePi);
  const nature = normalizeRequisitionCriterion(
    record?.expenseNature ?? record?.nature,
    normalizeExpenseNature,
  );
  if (!ug) return "";
  return [ug, action, pi, nature].join("|");
}

export function toMoney(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number)
    ? Math.round((number + Number.EPSILON) * 100) / 100
    : 0;
}

export function deriveBalanceToCommit(record) {
  if (Number.isFinite(Number(record?.balanceToCommit))) {
    return toMoney(Number(record.balanceToCommit));
  }
  return toMoney(
    Number(record?.requestValue ?? 0) - Number(record?.committedValue ?? 0),
  );
}

export function normalizeRequisition(record, index = 0) {
  const requestValue = toMoney(record?.requestValue);
  const committedValue = toMoney(record?.committedValue);
  const balanceToCommit = deriveBalanceToCommit({
    ...record,
    requestValue,
    committedValue,
  });

  const normalized = {
    id: normalizeText(record?.id) || `req-${index + 1}`,
    requestNumber: normalizeUpper(record?.requestNumber ?? record?.requisition),
    certame: normalizeText(record?.certame),
    ugCode: normalizeUgCode(record?.ugCode ?? record?.ug ?? record?.omCode),
    om: normalizeText(record?.om ?? record?.omName ?? record?.ugName),
    omSource: normalizeText(record?.omSource),
    ugName: normalizeText(record?.ugName),
    action: normalizeRequisitionCriterion(record?.action, normalizeAction),
    pi: normalizeRequisitionCriterion(record?.pi, normalizePi),
    expenseNature: normalizeRequisitionCriterion(
      record?.expenseNature ?? record?.nature,
      normalizeExpenseNature,
    ),
    vendor: normalizeText(record?.vendor),
    vendorCode: normalizeText(record?.vendorCode),
    proposalValidityDate: normalizeText(record?.proposalValidityDate),
    requestValue,
    committedValue,
    balanceToCommit,
    status:
      normalizeText(record?.status) ||
      (balanceToCommit > 0
        ? "Disponível para empenho"
        : "Integralmente empenhada"),
    sourceRow: record?.sourceRow ?? null,
  };

  normalized.matchKey = buildRequisitionMatchKey(normalized);
  normalized.classificationComplete = Boolean(normalized.matchKey);
  normalized.specificity = ["action", "pi", "expenseNature"].filter(
    (field) => normalized[field] !== ANY,
  ).length;
  normalized.wildcards = {
    action: normalized.action === ANY,
    pi: normalized.pi === ANY,
    expenseNature: normalized.expenseNature === ANY,
  };

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
        sourceLines: new Set(),
      });
    }

    const group = groups.get(key);
    group.creditAvailable = toMoney(
      group.creditAvailable + Number(record.creditAvailable ?? 0),
    );
    group.launches += Number(record.launches ?? 1) || 1;

    (Array.isArray(record.ptres) ? record.ptres : [record.ptres])
      .filter(Boolean)
      .forEach((value) => group.ptres.add(String(value)));

    (
      Array.isArray(record.fundingSources)
        ? record.fundingSources
        : [record.fundingSource]
    )
      .filter(Boolean)
      .forEach((value) => group.fundingSources.add(String(value)));

    (Array.isArray(record.sourceLines) ? record.sourceLines : [record.sourceLine])
      .filter((value) => value !== null && value !== undefined && value !== "")
      .forEach((value) => group.sourceLines.add(Number(value)));
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    ptres: Array.from(group.ptres).sort(),
    fundingSources: Array.from(group.fundingSources).sort(),
    sourceLines: Array.from(group.sourceLines).sort((a, b) => a - b),
  }));
}

export function groupRequisitions(records = []) {
  const groups = new Map();

  records.map(normalizeRequisition).forEach((record, sourceIndex) => {
    const key = record.matchKey || `INCOMPLETE|${record.id}`;

    if (!groups.has(key)) {
      groups.set(key, {
        matchKey: record.matchKey,
        classificationComplete: record.classificationComplete,
        specificity: record.specificity,
        order: sourceIndex,
        ugCode: record.ugCode,
        om: record.om,
        ugName: record.ugName,
        action: record.action,
        pi: record.pi,
        expenseNature: record.expenseNature,
        requestCount: 0,
        requestValue: 0,
        committedValue: 0,
        balanceToCommit: 0,
        requestNumbers: [],
        certames: new Set(),
        vendors: new Set(),
        proposalValidityDates: new Set(),
        sourceRows: [],
      });
    }

    const group = groups.get(key);
    group.requestCount += 1;
    group.requestValue = toMoney(group.requestValue + record.requestValue);
    group.committedValue = toMoney(
      group.committedValue + record.committedValue,
    );
    group.balanceToCommit = toMoney(
      group.balanceToCommit + record.balanceToCommit,
    );

    if (record.requestNumber) group.requestNumbers.push(record.requestNumber);
    if (record.certame) group.certames.add(record.certame);
    if (record.vendor) {
      group.vendors.add(
        record.vendorCode
          ? `${record.vendorCode} - ${record.vendor}`
          : record.vendor,
      );
    }
    if (record.proposalValidityDate) {
      group.proposalValidityDates.add(record.proposalValidityDate);
    }
    if (record.sourceRow !== null && record.sourceRow !== undefined) {
      group.sourceRows.push(record.sourceRow);
    }
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    certames: Array.from(group.certames).sort(),
    vendors: Array.from(group.vendors).sort(),
    proposalValidityDates: Array.from(group.proposalValidityDates).sort(),
    sourceRows: group.sourceRows.sort((a, b) => Number(a) - Number(b)),
  }));
}

export function requisitionMatchesCredit(request, credit) {
  if (!request?.classificationComplete) return false;
  if (normalizeUgCode(request.ugCode) !== normalizeUgCode(credit.ugCode)) {
    return false;
  }

  const dimensions = [
    ["action", normalizeAction],
    ["pi", normalizePi],
    ["expenseNature", normalizeExpenseNature],
  ];

  return dimensions.every(([field, normalizer]) => {
    const requested = request[field];
    if (requested === ANY) return true;
    return normalizer(requested) === normalizer(credit[field]);
  });
}

function attachCreditMetadata(request, credit) {
  credit.ptres.forEach((value) => request._ptres.add(value));
  credit.fundingSources.forEach((value) => request._fundingSources.add(value));
  credit.sourceLines.forEach((value) => request._creditSourceLines.add(value));
  request._matchedActions.add(credit.action);
  request._matchedPis.add(credit.pi);
  request._matchedNatures.add(credit.expenseNature);
}

/**
 * Crosses requisitions and credit without double counting.
 *
 * Allocation policy:
 * 1. More specific requisition groups are covered first.
 * 2. Each credit amount is consumed only once.
 * 3. Remaining compatible credit is assigned to the broadest matching group,
 *    so displayed credit totals remain non-overlapping.
 */
export function crossCreditAndRequisitions(
  creditRecords = [],
  requisitionRecords = [],
) {
  const credits = groupCredit(creditRecords).map((credit, index) => ({
    ...credit,
    _index: index,
    remaining: toMoney(credit.creditAvailable),
  }));

  const requests = groupRequisitions(requisitionRecords).map(
    (request, index) => ({
      ...request,
      _index: index,
      creditAvailable: 0,
      hasCompatibleCredit: false,
      _ptres: new Set(),
      _fundingSources: new Set(),
      _creditSourceLines: new Set(),
      _matchedActions: new Set(),
      _matchedPis: new Set(),
      _matchedNatures: new Set(),
    }),
  );

  const requestsByUg = new Map();
  requests
    .filter((request) => request.classificationComplete)
    .forEach((request) => {
      if (!requestsByUg.has(request.ugCode)) {
        requestsByUg.set(request.ugCode, []);
      }
      requestsByUg.get(request.ugCode).push(request);
    });

  requestsByUg.forEach((ugRequests, ugCode) => {
    const ugCredits = credits.filter((credit) => credit.ugCode === ugCode);

    ugRequests.forEach((request) => {
      request.hasCompatibleCredit = ugCredits.some((credit) =>
        requisitionMatchesCredit(request, credit),
      );
    });

    const orderedRequests = [...ugRequests].sort(
      (a, b) => b.specificity - a.specificity || a.order - b.order,
    );

    // First pass: reserve only what is needed to cover each demand.
    orderedRequests.forEach((request) => {
      let remainingDemand = toMoney(request.balanceToCommit);
      const compatibleCredits = ugCredits
        .filter(
          (credit) =>
            credit.remaining > 0 &&
            requisitionMatchesCredit(request, credit),
        )
        .sort(
          (a, b) =>
            b.remaining - a.remaining ||
            a.matchKey.localeCompare(b.matchKey, "pt-BR"),
        );

      compatibleCredits.forEach((credit) => {
        if (remainingDemand <= 0) return;
        const amount = toMoney(Math.min(credit.remaining, remainingDemand));
        if (amount <= 0) return;

        request.creditAvailable = toMoney(
          request.creditAvailable + amount,
        );
        credit.remaining = toMoney(credit.remaining - amount);
        remainingDemand = toMoney(remainingDemand - amount);
        attachCreditMetadata(request, credit);
      });
    });

    // Second pass: assign the still-unconsumed credit to the broadest
    // compatible group, preserving a non-overlapping total.
    ugCredits
      .filter((credit) => credit.remaining > 0)
      .forEach((credit) => {
        const candidates = ugRequests
          .filter((request) => requisitionMatchesCredit(request, credit))
          .sort(
            (a, b) =>
              a.specificity - b.specificity ||
              a.order - b.order,
          );

        const target = candidates[0];
        if (!target) return;

        target.creditAvailable = toMoney(
          target.creditAvailable + credit.remaining,
        );
        attachCreditMetadata(target, credit);
        credit.remaining = 0;
      });
  });

  return requests.map((request) => {
    const creditAvailable = toMoney(request.creditAvailable);
    const demand = toMoney(request.balanceToCommit);
    const creditRemaining = toMoney(Math.max(creditAvailable - demand, 0));
    const deficit = toMoney(Math.max(demand - creditAvailable, 0));
    const coveragePercent = demand > 0 ? (creditAvailable / demand) * 100 : 100;

    let status = "Crédito suficiente";
    if (!request.classificationComplete) {
      status = "Sem correspondência orçamentária";
    } else if (!request.hasCompatibleCredit) {
      status = "Sem crédito compatível";
    } else if (creditAvailable < demand) {
      status = "Crédito insuficiente";
    }

    return {
      ...request,
      actionDescription:
        request.action === ANY
          ? "Qualquer Ação da Organização Militar"
          : "Classificação informada na requisição",
      creditAvailable,
      creditRemaining,
      deficit,
      coveragePercent,
      status,
      ptres: Array.from(request._ptres).sort(),
      fundingSources: Array.from(request._fundingSources).sort(),
      creditSourceLines: Array.from(request._creditSourceLines).sort(
        (a, b) => a - b,
      ),
      matchedActions: Array.from(request._matchedActions).sort(),
      matchedPis: Array.from(request._matchedPis).sort(),
      matchedNatures: Array.from(request._matchedNatures).sort(),
    };
  });
}
