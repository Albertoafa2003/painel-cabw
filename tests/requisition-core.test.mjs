import test from "node:test";
import assert from "node:assert/strict";
import { buildMatchKey, deriveBalanceToCommit, normalizeRequisition, groupCredit, groupRequisitions, crossCreditAndRequisitions } from "../assets/js/requisition-core.js";

test("buildMatchKey uses exact UG, action, PI and full nature", () => {
  assert.equal(buildMatchKey({ ugCode: "120026", action: "2048", pi: "CA0802TRNSP", expenseNature: "339030" }), "120026|2048|CA0802TRNSP|339030");
  assert.notEqual(buildMatchKey({ ugCode: "120026", action: "2048", pi: "CA0802TRNSP", expenseNature: "339039" }), "120026|2048|CA0802TRNSP|339030");
});

test("balance to commit equals request value less committed value", () => {
  assert.equal(deriveBalanceToCommit({ requestValue: 100000, committedValue: 40000 }), 60000);
});

test("same matching key is grouped before crossing and credit is not duplicated", () => {
  const credit = [{ ugCode:"120026", action:"2048", pi:"CA0802TRNSP", expenseNature:"339030", creditAvailable:100, ptres:"229177" }];
  const requests = [
    { requestNumber:"R1", ugCode:"120026", action:"2048", pi:"CA0802TRNSP", expenseNature:"339030", requestValue:70, committedValue:20 },
    { requestNumber:"R2", ugCode:"120026", action:"2048", pi:"CA0802TRNSP", expenseNature:"339030", requestValue:40, committedValue:10 },
  ];
  const result = crossCreditAndRequisitions(credit, requests);
  assert.equal(result.length, 1);
  assert.equal(result[0].balanceToCommit, 80);
  assert.equal(result[0].creditAvailable, 100);
  assert.equal(result[0].creditRemaining, 20);
  assert.equal(result[0].status, "Crédito suficiente");
});

test("insufficient and missing credit are classified", () => {
  const credit = [{ ugCode:"120026", action:"2048", pi:"PI1", expenseNature:"339030", creditAvailable:50 }];
  const insufficient = crossCreditAndRequisitions(credit, [{ requestNumber:"R1", ugCode:"120026", action:"2048", pi:"PI1", expenseNature:"339030", requestValue:100, committedValue:0 }])[0];
  assert.equal(insufficient.status, "Crédito insuficiente");
  assert.equal(insufficient.deficit, 50);
  const missing = crossCreditAndRequisitions(credit, [{ requestNumber:"R2", ugCode:"120026", action:"2048", pi:"PI2", expenseNature:"339030", requestValue:10, committedValue:0 }])[0];
  assert.equal(missing.status, "Sem crédito compatível");
});

test("incomplete classification is not matched", () => {
  const result = crossCreditAndRequisitions([], [{ requestNumber:"R1", ugCode:"", action:"2048", pi:"PI1", expenseNature:"339030", requestValue:10, committedValue:0 }])[0];
  assert.equal(result.status, "Sem correspondência orçamentária");
});
