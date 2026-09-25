import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  buildContractAliasIndex, resolveContractForPayment, contractLifecycle,
  amendmentDeadline, monitoringTypeMap, normalizeContractIdentifier
} from '../assets/js/accountability-core.js';
const root = new URL('../', import.meta.url);
const json = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
function globals(path) {
  const context = {window:{}}; vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL(path, root), 'utf8'), context);
  return JSON.parse(JSON.stringify(context.window));
}
const {CABW_CONTRACTS_DATA: data, CABW_CONTRACTS_SOURCE: source} = globals('assets/js/contracts-data.js');
const {CONTRACT_MONITORING_DATA: monitoring, CONTRACT_MONITORING_METADATA: meta} = globals('assets/js/contract-monitoring-data.js');
const by = new Map(data.map(r => [r.numero, r]));
const byMon = new Map(monitoring.map(r => [r.numero,r]));
const summary = json('assets/data/contracts-summary.json');
const audit = json('assets/data/contracts-update-audit-11092026.json');
const cents = value => Math.round(Number(value)*100);
const removed = ['015/CABW/2021','016/CABW/2021','018/CABW-CISCEA/2025','019/CABW-CENIPA/2025'];
const names = ['CT 012-CABW-2026','011/CABW-DECEA/2026','CT 013/CABW/2026','CT 016/CABW/2026','014/CABW-CISCEA/2026','015/CABW-CISCEA/2026'];

test('11/09 contracts: 137 unique numbers and stable unique IDs', () => {
 assert.equal(data.length,137);assert.equal(new Set(data.map(r=>r.numero)).size,137);
 assert.equal(new Set(data.map(r=>r.id)).size,137);
 assert.equal(source.referenceDate,'2026-09-11');
 assert.deepEqual(summary.counts,{fms:52,finalisticos:62,administrativos:23});
});
test('U-TT 004 and IPT 009 retain distinct existing identities and source numbers', () => {
 const utt=by.get('004/CAE-CABW-PAMERJ/2025'),ipt=by.get('009/CABW-PAME-RJ/2026');
 assert.equal(utt.id,90);assert.equal(ipt.id,138);assert.notEqual(utt.id,ipt.id);
 assert.equal(utt.empresa,'U-TT INTERNATIONAL, INC.');assert.match(ipt.empresa,/IPT/);
 assert.equal(utt.valorContrato,11532534.90);assert.equal(ipt.valorContrato,398200.32);
 assert.equal(utt.totalEmpenhado,11513969.17);assert.equal(ipt.totalEmpenhado,398200.32);
 assert.equal(ipt.dataFinal.iso,'2027-08-06');
 assert.ok(!by.has('004/CAE-PAMERJ/2025'));assert.ok(!by.has('CNT 009/CABW-PAME-RJ/2026'));
});
test('reviewed contract aliases resolve to the same individual contract, never to the other vendor', () => {
 const index=buildContractAliasIndex(data);
 for (const [before,after] of Object.entries(audit.matching.reviewedNumberUpdates)) {
  const a=resolveContractForPayment({contractPag:before},index),b=resolveContractForPayment({contractPag:after},index);
  assert.equal(a.id,b.id);assert.equal(b.numero,after);
 }
 assert.notEqual(resolveContractForPayment({contractPag:'004/CAE-PAMERJ/2025'},index).id,resolveContractForPayment({contractPag:'009/CABW-PAME-RJ/2026'},index).id);
});
test('six new source identifiers have one monitoring entry each and no invented internal code', () => {
 for(const n of names){assert.ok(by.has(n));assert.ok(byMon.has(n));assert.equal(by.get(n).contrato,'N/I');assert.equal(by.get(n).cage,'');}
 assert.equal(new Set(names.map(n=>by.get(n).id)).size,6);
});
test('six new institutional classifications follow user confirmation', () => {
 const expected=[
  ['CT 012-CABW-2026','CABW','administrativos','CONTINUADO','COMGAP','2000','CABW'],
  ['011/CABW-DECEA/2026','DECEA','finalisticos','DEMANDA PONTUAL','DECEA','20XV','DECEA'],
  ['CT 013/CABW/2026','CABW','administrativos','CONTINUADO','COMGAP','2000','CABW'],
  ['CT 016/CABW/2026','CABW','administrativos','CONTINUADO','COMGAP','2000','CABW'],
  ['014/CABW-CISCEA/2026','CISCEA','finalisticos','DEMANDA PONTUAL','DECEA','20XV','CISCEA'],
  ['015/CABW-CISCEA/2026','CISCEA','finalisticos','DEMANDA PONTUAL','DECEA','20XV','CISCEA']];
 for (const [n,unit,category,type,command,action,od] of expected){
  const r=by.get(n),m=byMon.get(n);
  assert.deepEqual([r.unidade,r.categoria,m.tipoContrato,r.grandComando,r.acao,r.ordenadorDespesas],[unit,category,type,command,action,od]);
  assert.equal(m.observacao,'');assert.equal(m.statusPlanilha,'');assert.equal(m.monitorado,true);
 }
});
test('four authorized deletions are absent from every live contract inventory and payment matching', () => {
 const index=buildContractAliasIndex(data);
 for(const n of removed){assert.ok(!by.has(n));assert.ok(!byMon.has(n));assert.equal(resolveContractForPayment({contractPag:n},index),null);}
});
test('five source contracts with unknown dates receive no presumed lifecycle or D-120 deadline', () => {
 const numbers=['CT 013/CABW/2026','CT 016/CABW/2026','014/CABW-CISCEA/2026','015/CABW-CISCEA/2026','CNT 099/CAE-CABW-DECEA/2026'];
 for(const n of numbers){const r=by.get(n);assert.equal(r.dataFinal,null);assert.equal(r.dataInicio,null);assert.equal(r.dataAssinatura,null);assert.equal(contractLifecycle(r,'2026-09-11').code,'no-date');assert.equal(amendmentDeadline(r,'2026-09-11').date,null);assert.equal(byMon.get(n).situacaoCode,'sem-data');}
 assert.equal(data.filter(r=>!r.dataFinal).length,5);
});
test('confirmed UHC excess commitment and BR-D-QAU reversed dates are preserved without zero clamping', () => {
 const uhc=by.get('022/CABW/2021');assert.equal(uhc.valorEmpenhar,-121697.15);assert.equal(uhc.totalEmpenhado,11414163.21);assert.equal(uhc.totalFaturado,11029355.10);
 assert.equal(byMon.get(uhc.numero).valorAEmpenhar,-121697.15);assert.ok(uhc.sourceWarnings.length);
 const fms=by.get('BR-D-QAU-USAF');assert.equal(fms.dataFinal.iso,'2024-10-10');assert.equal(fms.dataInicio.iso,'2024-12-12');assert.equal(fms.valorEmpenhar,-967.57);assert.ok(fms.sourceWarnings.length);
});
test('contract and monitoring financial/date fields are synchronized by number', () => {
 const fields={'valorContrato':'valorContrato','totalEmpenhado':'totalEmpenhado','totalFaturado':'totalFaturado','saldoSilomsExt':'saldoSiloms','valorAEmpenhar':'valorEmpenhar','totalEmpenhadoUsd':'totalEmpenhadoUsd','totalFaturadoUsd':'totalFaturadoUsd','dataAssinatura':'dataAssinatura','dataInicio':'dataInicio','dataFinal':'dataFinal','empresa':'empresa'};
 for(const m of monitoring){const r=by.get(m.numero);assert.ok(r);for(const [mk,rk] of Object.entries(fields)){assert.deepEqual(m[mk],r[rk],m.numero+' '+mk);}}
 assert.equal(monitoring.length,85);assert.equal(meta.totalMonitored,84);assert.equal(meta.excludedRecords,1);
});
test('aggregate financial totals use supplied USD columns and do not convert currencies automatically', () => {
 for(const key of ['totalEmpenhadoUsd','totalFaturadoUsd'])assert.equal(cents(summary[key]),data.reduce((s,r)=>s+cents(r[key]),0));
 for(const [currency,fields] of Object.entries(summary.currencyTotals)){
  for(const [key,val] of Object.entries(fields))assert.equal(cents(val),data.filter(r=>r.moeda===currency).reduce((s,r)=>s+cents(r[key]),0));
 }
 assert.equal(summary.totalEmpenhadoUsd,657754725.91);assert.equal(summary.totalFaturadoUsd,544517182.34);
});
test('existing updated IDs stay stable and every audited source change is reflected', () => {
 assert.equal(audit.existingContractsUpdated,131);
 for(const c of audit.changes){const r=by.get(c.numberAfter);assert.equal(r.id,c.id);for(const [key,change] of Object.entries(c.changedFields))assert.deepEqual(r[key],change.after);}
});
test('monitoring types propagate to accountability; only 12 contracts are expressly continued', () => {
 const map=monitoringTypeMap(monitoring);
 assert.equal(data.filter(r=>map.get(normalizeContractIdentifier(r.numero))==='CONTINUADO').length,12);
});
test('new MILCLEAN and AETNA aliases preserve exact source identifiers for operational payment lookup', () => {
 const index=buildContractAliasIndex(data);
 assert.equal(resolveContractForPayment({contractPag:'012/CABW/2026'},index).numero,'CT 012-CABW-2026');
 assert.equal(resolveContractForPayment({contractPag:'013/CABW/2026'},index).numero,'CT 013/CABW/2026');
 assert.equal(resolveContractForPayment({contractPag:'016/CABW/2026'},index).numero,'CT 016/CABW/2026');
});
test('preserved credit reference and historical request snapshot remain consistent', () => {
 const credit=json('assets/data/credit-current.json');assert.equal(credit.position,'22/09/2026');
 const req=json('assets/data/requisitions-available-14092026.json');assert.equal(req.records.length,90);assert.ok(req.records.every(r=>r.partNumber));
 assert.equal(req.metadata.position,'14/09/2026');assert.equal(req.records.reduce((s,r)=>s+cents(r.balanceToCommit),0),257741771);
});
