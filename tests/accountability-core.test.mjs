import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  amendmentDeadline,
  buildContractAliasIndex,
  contractLifecycle,
  contractPaymentSummary,
  coverageEstimate,
  resolveContractForPayment,
  monitoringTypeMap,
  normalizeContractIdentifier,
  normalizeUnit
} from "../assets/js/accountability-core.js";

function readWindowArray(file, variable) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window[variable];
}

const contracts = readWindowArray("../assets/js/contracts-data.js", "CABW_CONTRACTS_DATA");
const monitoring = readWindowArray("../assets/js/contract-monitoring-data.js", "CONTRACT_MONITORING_DATA");

test("base contratual preserva 135 contratos", () => {
  assert.equal(contracts.length, 135);
});

test("situação em 03/09/2026 resulta em 111 vigentes, 22 encerrados e 2 sem data", () => {
  const counts = { active: 0, ended: 0, "no-date": 0 };
  contracts.forEach(contract => { counts[contractLifecycle(contract, "2026-09-03").code] += 1; });
  assert.deepEqual(counts, { active: 111, ended: 22, "no-date": 2 });
});

test("separação CABW e OMs apoiadas usa Unidade igual a CABW", () => {
  const cabw = contracts.filter(contract => normalizeUnit(contract.unidade) === "CABW");
  const supported = contracts.filter(contract => normalizeUnit(contract.unidade) !== "CABW");
  assert.equal(cabw.length, 28);
  assert.equal(supported.length, 107);
});

test("prazo para termo aditivo é 120 dias antes do término", () => {
  const contract = { dataFinal: { iso: "2026-12-31" } };
  const result = amendmentDeadline(contract, "2026-08-01");
  assert.equal(result.date, "2026-09-02");
});

test("somente 11 contratos são expressamente continuados", () => {
  const map = monitoringTypeMap(monitoring);
  const count = contracts.filter(contract => map.get(normalizeContractIdentifier(contract.numero)) === "CONTINUADO").length;
  assert.equal(count, 11);
});

test("pagamento é vinculado por número do contrato normalizado", () => {
  const index = buildContractAliasIndex(contracts);
  const contract = resolveContractForPayment({ contractPag: "Contrato nº 015/CABW/2021" }, index);
  assert.equal(contract.numero, "015/CABW/2021");
});

test("valor pago usa valor bruto e média exclui mês corrente", () => {
  const summary = contractPaymentSummary([
    { contractPag: "X", status: "Pago", currency: "USD", grossAmount: 100, paidDate: "2026-06-10" },
    { contractPag: "X", status: "Pago", currency: "USD", grossAmount: 200, paidDate: "2026-07-10" },
    { contractPag: "X", status: "Pago", currency: "USD", grossAmount: 300, paidDate: "2026-08-10" },
    { contractPag: "X", status: "Pago", currency: "USD", grossAmount: 1000, paidDate: "2026-09-01" },
    { contractPag: "X", status: "Pago", currency: "EUR", grossAmount: 50, paidDate: "2026-08-11" }
  ], "USD", "2026-09-03");
  assert.equal(summary.primaryPaid, 1600);
  assert.equal(summary.averageLastThree, 200);
  assert.equal(summary.averageMonthCount, 3);
  assert.equal(summary.otherCurrencies[0].currency, "EUR");
});

test("cobertura é saldo empenhado dividido pela média mensal", () => {
  const result = coverageEstimate(120000, 60000, 10000);
  assert.equal(result.available, 60000);
  assert.equal(result.months, 6);
});
