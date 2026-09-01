import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), "..");
const payload = JSON.parse(fs.readFileSync(path.join(root, "assets/data/payment-execution-current.json"), "utf8"));
const records = payload.records;
const metadata = payload.metadata;

function rounded(value) { return Math.round(value * 100) / 100; }

test("a base consolidada contém 756 lançamentos", () => {
  assert.equal(records.length, 756);
  assert.equal(metadata.recordCount, 756);
});

test("o total da base é 34.747.706,13", () => {
  assert.equal(rounded(records.reduce((sum, record) => sum + Number(record.valor || 0), 0)), 34747706.13);
  assert.equal(metadata.totalValue, 34747706.13);
});

test("os quantitativos consolidados conferem", () => {
  assert.equal(new Set(records.map(record => record.ne).filter(Boolean)).size, 617);
  assert.equal(new Set(records.map(record => record.fav).filter(Boolean)).size, 143);
  assert.equal(new Set(records.map(record => record.piCod).filter(Boolean)).size, 49);
  assert.equal(new Set(records.map(record => record.acaoCod).filter(Boolean)).size, 16);
});

test("os 104 lançamentos de valor zero foram preservados", () => {
  assert.equal(records.filter(record => Number(record.valor) === 0).length, 104);
  assert.equal(metadata.zeroValueRows, 104);
});

test("não existem valores negativos nem duplicidades exatas", () => {
  assert.equal(records.filter(record => Number(record.valor) < 0).length, 0);
  const fingerprints = records.map(record => JSON.stringify(record, Object.keys(record).sort()));
  assert.equal(new Set(fingerprints).size, records.length);
  assert.equal(metadata.exactDuplicateRows, 0);
});

test("a página integra a visão consolidada sem remover o acompanhamento operacional", () => {
  const html = fs.readFileSync(path.join(root, "pagamentos.html"), "utf8");
  assert.match(html, /id="payExecutionSection"/);
  assert.match(html, /id="payOperationalSection"/);
  assert.match(html, /payment-execution-panel\.js/);
  assert.match(html, /payment-tracking-panel\.js/);
  assert.match(html, /Valores por favorecido/);
});
