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
    partNumber: normalizeText(record?.partNumber ?? record?.pn),
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
        partNumbers: new Set(),
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
    if (record.partNumber) group.partNumbers.add(record.partNumber);
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
    partNumbers: Array.from(group.partNumbers).sort((a, b) =>
      String(a).localeCompare(String(b), "pt-BR", { numeric: true }),
    ),
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

/**
 * Builds the non-overlapping data structure used by the detailed PDF report.
 * Credit, remaining balance and deficit stay at budget-group / OM level; the
 * individual requisitions are listed beneath the corresponding OM without
 * repeating the same credit as if it belonged independently to each BAC#.
 */
export function buildDetailedCrossReportData(
  crossRows = [],
  requisitionRecords = [],
) {
  const rows = Array.isArray(crossRows) ? crossRows : [];
  const normalizedRequests = (Array.isArray(requisitionRecords)
    ? requisitionRecords
    : []
  ).map(normalizeRequisition);

  const rowByRequestNumber = new Map();
  rows.forEach((row) => {
    (Array.isArray(row.requestNumbers) ? row.requestNumbers : []).forEach(
      (requestNumber) => {
        const normalizedNumber = normalizeUpper(requestNumber);
        if (normalizedNumber) rowByRequestNumber.set(normalizedNumber, row);
      },
    );
  });

  const omMap = new Map();
  const ensureOm = (row) => {
    const key = normalizeUgCode(row?.ugCode) || normalizeText(row?.om) || "SEM-OM";
    if (!omMap.has(key)) {
      omMap.set(key, {
        key,
        ugCode: normalizeUgCode(row?.ugCode),
        om: normalizeText(row?.om),
        ugName: normalizeText(row?.ugName),
        requestCount: 0,
        requestValue: 0,
        committedValue: 0,
        balanceToCommit: 0,
        creditAvailable: 0,
        creditRemaining: 0,
        deficit: 0,
        coveragePercent: 0,
        status: "Crédito suficiente",
        statuses: new Set(),
        groups: [],
        requests: [],
      });
    }
    return omMap.get(key);
  };

  rows.forEach((row) => {
    const om = ensureOm(row);
    om.requestCount += Number(row.requestCount || 0);
    om.requestValue = toMoney(om.requestValue + Number(row.requestValue || 0));
    om.committedValue = toMoney(
      om.committedValue + Number(row.committedValue || 0),
    );
    om.balanceToCommit = toMoney(
      om.balanceToCommit + Number(row.balanceToCommit || 0),
    );
    om.creditAvailable = toMoney(
      om.creditAvailable + Number(row.creditAvailable || 0),
    );
    om.creditRemaining = toMoney(
      om.creditRemaining + Number(row.creditRemaining || 0),
    );
    om.deficit = toMoney(om.deficit + Number(row.deficit || 0));
    if (row.status) om.statuses.add(row.status);
    om.groups.push(row);
  });

  const detailedRequests = normalizedRequests
    .filter((record) => rowByRequestNumber.has(record.requestNumber))
    .map((record) => {
      const group = rowByRequestNumber.get(record.requestNumber);
      const om = ensureOm(group);
      const detail = {
        ...record,
        crossMatchKey: group.matchKey,
        crossStatus: group.status,
        groupCreditAvailable: toMoney(group.creditAvailable),
        groupCreditRemaining: toMoney(group.creditRemaining),
        groupDeficit: toMoney(group.deficit),
        groupCoveragePercent: Number(group.coveragePercent || 0),
      };
      om.requests.push(detail);
      return detail;
    });

  const aggregateStatus = (om) => {
    if (om.statuses.has("Sem correspondência orçamentária")) {
      return "Sem correspondência orçamentária";
    }
    if (om.deficit > 0 && om.creditAvailable <= 0) {
      return "Sem crédito compatível";
    }
    if (om.deficit > 0) return "Crédito insuficiente";
    return "Crédito suficiente";
  };

  const omSummaries = Array.from(omMap.values())
    .map((om) => ({
      ...om,
      coveragePercent:
        om.balanceToCommit > 0
          ? (om.creditAvailable / om.balanceToCommit) * 100
          : 100,
      status: aggregateStatus(om),
      statuses: Array.from(om.statuses).sort(),
      groups: [...om.groups].sort(
        (a, b) =>
          String(a.action).localeCompare(String(b.action), "pt-BR", {
            numeric: true,
          }) ||
          String(a.pi).localeCompare(String(b.pi), "pt-BR", {
            numeric: true,
          }) ||
          String(a.expenseNature).localeCompare(
            String(b.expenseNature),
            "pt-BR",
            { numeric: true },
          ),
      ),
      requests: [...om.requests].sort((a, b) =>
        a.requestNumber.localeCompare(b.requestNumber, "pt-BR", {
          numeric: true,
        }),
      ),
    }))
    .sort(
      (a, b) =>
        String(a.om || a.ugCode).localeCompare(
          String(b.om || b.ugCode),
          "pt-BR",
          { numeric: true },
        ),
    );

  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.requestCount += Number(row.requestCount || 0);
      accumulator.requestValue = toMoney(
        accumulator.requestValue + Number(row.requestValue || 0),
      );
      accumulator.committedValue = toMoney(
        accumulator.committedValue + Number(row.committedValue || 0),
      );
      accumulator.balanceToCommit = toMoney(
        accumulator.balanceToCommit + Number(row.balanceToCommit || 0),
      );
      accumulator.creditAvailable = toMoney(
        accumulator.creditAvailable + Number(row.creditAvailable || 0),
      );
      accumulator.creditRemaining = toMoney(
        accumulator.creditRemaining + Number(row.creditRemaining || 0),
      );
      accumulator.deficit = toMoney(
        accumulator.deficit + Number(row.deficit || 0),
      );
      return accumulator;
    },
    {
      requestCount: 0,
      requestValue: 0,
      committedValue: 0,
      balanceToCommit: 0,
      creditAvailable: 0,
      creditRemaining: 0,
      deficit: 0,
    },
  );
  totals.coveragePercent =
    totals.balanceToCommit > 0
      ? (totals.creditAvailable / totals.balanceToCommit) * 100
      : 100;

  return {
    totals,
    omSummaries,
    groups: rows,
    requests: detailedRequests,
  };
}

