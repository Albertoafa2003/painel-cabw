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

test("current requisition file contains 59 unique BAC numbers and expected totals", () => {
  const data = JSON.parse(
    fs.readFileSync(
      new URL(
        "../assets/data/requisitions-available-current.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(data.records.length, 59);
  assert.equal(new Set(data.records.map((row) => row.requestNumber)).size, 59);
  assert.equal(data.metadata.requestValueTotal, 834465.59);
  assert.equal(data.metadata.committedValueTotal, 0);
  assert.equal(data.metadata.balanceToCommitTotal, 834465.59);
  assert.equal(data.records.every((row) => row.action === ANY), true);
  assert.equal(data.records.every((row) => row.pi === ANY), true);
  assert.equal(data.records.every((row) => row.expenseNature === ANY), true);
});

test("current crossing groups the 59 requests by three OMs and uses each OM credit once", () => {
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
  assert.equal(result.length, 3);
  assert.equal(
    result.reduce((sum, row) => sum + row.requestCount, 0),
    59,
  );
  assert.equal(
    Math.round(
      result.reduce((sum, row) => sum + row.balanceToCommit, 0) * 100,
    ) / 100,
    834465.59,
  );
  assert.equal(
    Math.round(
      result.reduce((sum, row) => sum + row.creditAvailable, 0) * 100,
    ) / 100,
    3753217.78,
  );
  assert.equal(result.every((row) => row.status === "Crédito suficiente"), true);
  assert.equal(
    Math.round(
      result.reduce((sum, row) => sum + row.creditRemaining, 0) * 100,
    ) / 100,
    2918752.19,
  );
});
