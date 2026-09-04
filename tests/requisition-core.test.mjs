import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ANY,
  buildMatchKey,
  buildRequisitionMatchKey,
  criterionLabel,
  deriveBalanceToCommit,
  normalizeRequisition,
  groupCredit,
  groupRequisitions,
  requisitionMatchesCredit,
  crossCreditAndRequisitions,
  buildDetailedCrossReportData,
} from "../assets/js/requisition-core.js";

test("buildMatchKey uses exact UG, action, PI and full nature", () => {
  assert.equal(
    buildMatchKey({
      ugCode: "120026",
      action: "2048",
      pi: "CA0802TRNSP",
      expenseNature: "339030",
    }),
    "120026|2048|CA0802TRNSP|339030",
  );
  assert.notEqual(
    buildMatchKey({
      ugCode: "120026",
      action: "2048",
      pi: "CA0802TRNSP",
      expenseNature: "339039",
    }),
    "120026|2048|CA0802TRNSP|339030",
  );
});

test("blank requisition criteria are normalized as wildcards", () => {
  const record = normalizeRequisition({
    requestNumber: "BAC-1",
    ugCode: "120026",
    om: "PAMA-LS",
    action: "",
    pi: null,
    expenseNature: "",
    requestValue: 100,
    committedValue: 0,
  });
  assert.equal(record.action, ANY);
  assert.equal(record.pi, ANY);
  assert.equal(record.expenseNature, ANY);
  assert.equal(record.matchKey, "120026|*|*|*");
  assert.equal(record.classificationComplete, true);
  assert.equal(criterionLabel(record.action, "action"), "Qualquer Ação");
  assert.equal(
    buildRequisitionMatchKey(record),
    "120026|*|*|*",
  );
});

test("balance to commit equals request value less committed value", () => {
  assert.equal(
    deriveBalanceToCommit({ requestValue: 100000, committedValue: 40000 }),
    60000,
  );
});

test("same exact matching key is grouped before crossing and credit is not duplicated", () => {
  const credit = [
    {
      ugCode: "120026",
      action: "2048",
      pi: "CA0802TRNSP",
      expenseNature: "339030",
      creditAvailable: 100,
      ptres: "229177",
    },
  ];
  const requests = [
    {
      requestNumber: "R1",
      ugCode: "120026",
      action: "2048",
      pi: "CA0802TRNSP",
      expenseNature: "339030",
      requestValue: 70,
      committedValue: 20,
    },
    {
      requestNumber: "R2",
      ugCode: "120026",
      action: "2048",
      pi: "CA0802TRNSP",
      expenseNature: "339030",
      requestValue: 40,
      committedValue: 10,
    },
  ];
  const result = crossCreditAndRequisitions(credit, requests);
  assert.equal(result.length, 1);
  assert.equal(result[0].balanceToCommit, 80);
  assert.equal(result[0].creditAvailable, 100);
  assert.equal(result[0].creditRemaining, 20);
  assert.equal(result[0].status, "Crédito suficiente");
});

test("wildcard criteria match every credit classification only inside the same UG", () => {
  const request = normalizeRequisition({
    requestNumber: "R1",
    ugCode: "120026",
    action: "",
    pi: "",
    expenseNature: "",
    requestValue: 50,
  });
  assert.equal(
    requisitionMatchesCredit(request, {
      ugCode: "120026",
      action: "2048",
      pi: "PI1",
      expenseNature: "339030",
    }),
    true,
  );
  assert.equal(
    requisitionMatchesCredit(request, {
      ugCode: "120049",
      action: "2048",
      pi: "PI1",
      expenseNature: "339030",
    }),
    false,
  );
});

test("specific and wildcard groups partition credit without double counting", () => {
  const credit = [
    {
      ugCode: "120026",
      action: "2048",
      pi: "PI1",
      expenseNature: "339030",
      creditAvailable: 100,
    },
    {
      ugCode: "120026",
      action: "2048",
      pi: "PI2",
      expenseNature: "339030",
      creditAvailable: 100,
    },
  ];
  const requests = [
    {
      requestNumber: "EXACT",
      ugCode: "120026",
      action: "2048",
      pi: "PI1",
      expenseNature: "339030",
      requestValue: 60,
      committedValue: 0,
    },
    {
      requestNumber: "ANY",
      ugCode: "120026",
      action: "",
      pi: "",
      expenseNature: "",
      requestValue: 80,
      committedValue: 0,
    },
  ];
  const result = crossCreditAndRequisitions(credit, requests);
  assert.equal(result.length, 2);
  assert.equal(
    result.reduce((sum, row) => sum + row.creditAvailable, 0),
    200,
  );
  assert.equal(
    result.reduce((sum, row) => sum + row.deficit, 0),
    0,
  );
});

test("insufficient and missing credit are classified", () => {
  const credit = [
    {
      ugCode: "120026",
      action: "2048",
      pi: "PI1",
      expenseNature: "339030",
      creditAvailable: 50,
    },
  ];
  const insufficient = crossCreditAndRequisitions(credit, [
    {
      requestNumber: "R1",
      ugCode: "120026",
      action: "2048",
      pi: "PI1",
      expenseNature: "339030",
      requestValue: 100,
      committedValue: 0,
    },
  ])[0];
  assert.equal(insufficient.status, "Crédito insuficiente");
  assert.equal(insufficient.deficit, 50);

  const missing = crossCreditAndRequisitions(credit, [
    {
      requestNumber: "R2",
      ugCode: "120026",
      action: "2048",
      pi: "PI2",
      expenseNature: "339030",
      requestValue: 10,
      committedValue: 0,
    },
  ])[0];
  assert.equal(missing.status, "Sem crédito compatível");
});

test("missing OM remains without budget correspondence", () => {
  const result = crossCreditAndRequisitions([], [
    {
      requestNumber: "R1",
      ugCode: "",
      action: "",
      pi: "",
      expenseNature: "",
      requestValue: 10,
      committedValue: 0,
    },
  ])[0];
  assert.equal(result.status, "Sem correspondência orçamentária");
});

test("normalizeRequisition preserves the Part Number", () => {
  const record = normalizeRequisition({
    requestNumber: "BAC-PN",
    partNumber: "PN-123/A",
    ugCode: "120026",
    expenseNature: "339030",
    requestValue: 10,
  });
  assert.equal(record.partNumber, "PN-123/A");
});

test("current requisition file contains 67 unique BAC numbers, Part Numbers, specific natures and expected totals", () => {
  const data = JSON.parse(
    fs.readFileSync(
      new URL(
        "../assets/data/requisitions-available-current.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(data.records.length, 67);
  assert.equal(new Set(data.records.map((row) => row.requestNumber)).size, 67);
  assert.equal(data.metadata.position, "04/09/2026");
  assert.equal(data.metadata.requestValueTotal, 1316467.79);
  assert.equal(data.metadata.committedValueTotal, 0);
  assert.equal(data.metadata.balanceToCommitTotal, 1316467.79);
  assert.equal(data.records.every((row) => row.partNumber), true);
  assert.equal(new Set(data.records.map((row) => row.partNumber)).size, 61);
  assert.equal(data.records.every((row) => row.action === ANY), true);
  assert.equal(data.records.every((row) => row.pi === ANY), true);
  assert.equal(data.records.every((row) => row.expenseNature !== ANY), true);
  assert.equal(
    data.records.every((row) => /^\d{6}$/.test(row.expenseNature)),
    true,
  );

  const natureCounts = data.records.reduce((acc, row) => {
    acc[row.expenseNature] = (acc[row.expenseNature] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(natureCounts, {
    "339030": 36,
    "339039": 12,
    "449052": 19,
  });

  const corrected = data.records.find(
    (row) => row.requestNumber === "GLT099002R2",
  );
  assert.equal(corrected.expenseNatureSource, "459052");
  assert.equal(corrected.expenseNature, "449052");
  assert.match(corrected.expenseNatureCorrection, /corrigida de 459052 para 449052/);
  assert.equal(corrected.partNumber, "ADA145M612");

  const first = data.records.find(
    (row) => row.requestNumber === "GLS045004P3",
  );
  assert.equal(first.proposalValidityDate, "2026-10-04");
  assert.equal(first.partNumber, "59J6185");

  assert.equal(data.records.some((row) => row.requestNumber === "GLT100004R2"), true);
  assert.equal(data.records.some((row) => row.requestNumber === "LST025004T9"), false);
});

test("current crossing groups the 67 requests by OM and Natureza without double counting", () => {
  const requests = JSON.parse(
    fs.readFileSync(
      new URL(
        "../assets/data/requisitions-available-current.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const credit = JSON.parse(
    fs.readFileSync(
      new URL(
        "../assets/data/credit-budget-detailed-current.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const result = crossCreditAndRequisitions(
    credit.groupedByMatchKey,
    requests.records,
  );
  assert.equal(result.length, 6);
  assert.equal(
    result.reduce((sum, row) => sum + row.requestCount, 0),
    67,
  );
  assert.equal(
    Math.round(result.reduce((sum, row) => sum + row.balanceToCommit, 0) * 100) / 100,
    1316467.79,
  );
  assert.equal(
    Math.round(result.reduce((sum, row) => sum + row.creditAvailable, 0) * 100) / 100,
    2111185.77,
  );
  assert.equal(
    Math.round(result.reduce((sum, row) => sum + row.creditRemaining, 0) * 100) / 100,
    1040509.39,
  );
  assert.equal(
    Math.round(result.reduce((sum, row) => sum + row.deficit, 0) * 100) / 100,
    245791.41,
  );
  assert.equal(result.filter((row) => row.status === "Crédito suficiente").length, 4);
  assert.equal(result.filter((row) => row.status === "Crédito insuficiente").length, 2);

  const glEquipment = result.find(
    (row) => row.ugCode === "120049" && row.expenseNature === "449052",
  );
  assert.equal(glEquipment.requestCount, 18);
  assert.equal(glEquipment.balanceToCommit, 339045.35);
  assert.equal(glEquipment.creditAvailable, 171589.38);
  assert.equal(glEquipment.deficit, 167455.97);
  assert.equal(glEquipment.status, "Crédito insuficiente");

  const lsMaterial = result.find(
    (row) => row.ugCode === "120026" && row.expenseNature === "339030",
  );
  assert.equal(lsMaterial.requestCount, 16);
  assert.equal(lsMaterial.balanceToCommit, 511822.48);
  assert.equal(lsMaterial.creditAvailable, 433487.04);
  assert.equal(lsMaterial.deficit, 78335.44);
  assert.equal(lsMaterial.status, "Crédito insuficiente");

  const lsEquipment = result.find(
    (row) => row.ugCode === "120026" && row.expenseNature === "449052",
  );
  assert.equal(lsEquipment.requestCount, 1);
  assert.equal(lsEquipment.balanceToCommit, 16256);
  assert.equal(lsEquipment.creditAvailable, 27861.76);
  assert.equal(lsEquipment.creditRemaining, 11605.76);
  assert.equal(lsEquipment.status, "Crédito suficiente");
});

test("detailed report data groups requisitions by OM without repeating credit", () => {
  const credit = [
    {
      ugCode: "120026",
      om: "PAMA-LS",
      action: "2048",
      pi: "PI1",
      expenseNature: "339030",
      creditAvailable: 150,
      ptres: "229177",
      fundingSource: "1000000000",
    },
  ];
  const requisitions = [
    {
      requestNumber: "R1",
      ugCode: "120026",
      om: "PAMA-LS",
      action: "",
      pi: "",
      expenseNature: "",
      requestValue: 70,
      committedValue: 0,
    },
    {
      requestNumber: "R2",
      ugCode: "120026",
      om: "PAMA-LS",
      action: "",
      pi: "",
      expenseNature: "",
      requestValue: 30,
      committedValue: 0,
    },
  ];
  const crossing = crossCreditAndRequisitions(credit, requisitions);
  const report = buildDetailedCrossReportData(crossing, requisitions);

  assert.equal(report.omSummaries.length, 1);
  assert.equal(report.requests.length, 2);
  assert.equal(report.totals.requestValue, 100);
  assert.equal(report.totals.balanceToCommit, 100);
  assert.equal(report.totals.creditAvailable, 150);
  assert.equal(report.totals.creditRemaining, 50);
  assert.equal(report.totals.deficit, 0);
  assert.equal(report.omSummaries[0].requests.length, 2);
  assert.equal(report.omSummaries[0].status, "Crédito suficiente");
});

test("current detailed report contains 67 requisitions with Part Numbers organized into three OMs", () => {
  const requests = JSON.parse(
    fs.readFileSync(
      new URL(
        "../assets/data/requisitions-available-current.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const credit = JSON.parse(
    fs.readFileSync(
      new URL(
        "../assets/data/credit-budget-detailed-current.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const crossing = crossCreditAndRequisitions(
    credit.groupedByMatchKey,
    requests.records,
  );
  const report = buildDetailedCrossReportData(crossing, requests.records);

  assert.equal(report.omSummaries.length, 3);
  assert.equal(report.requests.length, 67);
  assert.equal(report.totals.requestCount, 67);
  assert.equal(report.totals.requestValue, 1316467.79);
  assert.equal(report.totals.balanceToCommit, 1316467.79);
  assert.equal(report.totals.creditAvailable, 2111185.77);
  assert.equal(report.totals.creditRemaining, 1040509.39);
  assert.equal(report.totals.deficit, 245791.41);
  assert.equal(report.requests.every((request) => request.partNumber), true);
  assert.equal(
    report.requests.find((request) => request.requestNumber === "LST167001A2").partNumber,
    "ADA120-612",
  );
  assert.equal(
    report.omSummaries.reduce((sum, om) => sum + om.requests.length, 0),
    67,
  );
});
