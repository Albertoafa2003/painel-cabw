import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeRequisition, crossCreditAndRequisitions, buildDetailedCrossReportData} from '../assets/js/requisition-core.js';
const load = p=>JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url),'utf8'));
const req=load('assets/data/requisitions-available-current.json');
const hist=load('assets/data/requisitions-available-14092026.json');
const credit=load('assets/data/credit-budget-detailed-current.json');
const audit=load('assets/data/requisitions-available-update-audit-25092026.json');
const cents=v=>Math.round(Number(v)*100);
const sum=(rows,field)=>rows.reduce((n,r)=>n+cents(r[field]),0);
const rows=crossCreditAndRequisitions(credit.records,req.records);
const report=buildDetailedCrossReportData(rows,req.records);
const expected=[["120049", "449052", 7, 57401.57, 133726.65, 76325.08, 0], ["120026", "339030", 34, 1044740.63, 706560.31, 0, 338180.32], ["120026", "449052", 1, 16256, 27861.76, 11605.76, 0], ["120047", "339030", 5, 1535677.7, 58926.04, 0, 1476751.66], ["120068", "339039", 5, 73508.62, 13718.08, 0, 59790.54], ["120068", "339030", 1, 33152, 444677.85, 411525.85, 0]];
const protectedHashes={"assets/data/credit-current.json": "77ea08e3bb0f066d746257453ce10dc7f85630fcb6fbc9de25508d1f15b448d7", "assets/data/credit-budget-detailed-current.json": "1f86d0fcc9512806218650e9927f1b0142fb1eaa6ffdd50f6cdb81be110eec78", "assets/js/contracts-data.js": "88626c3911aa9fc69a60f296ffe8d556971fcf325d3aa6ca79ae446c63a8a42a", "assets/js/contract-monitoring-data.js": "a7165fd6b994f09e163c41fc44f39ebe106401e12a33da2bbe2ccce058c28017", "assets/data/repair-processes-current.json": "d7b7865708cf7900d3a7ba7f7c3c3cb0c48f960382caa3188bf9efe2967c62c0", "assets/js/repair-processes-current-data.js": "c74fe75f1a0dcbb9b18f8185508580c3b38da58814fa2905ff8a1790b2455c54", "assets/data/ptax-patrimonial-reference.json": "033b2ab4e12938df7fb040897916823c3e9f7aadbb7ad9457e37052162483ae9", "assets/js/patrimonial-reference.js": "ae16441169d54afea39f9399778bd22cd49a7a5e5c970fa39630d7a37e52934f", "assets/js/repair-patrimonial-panel.js": "0572006813913de944f3770b2f5e94ef839623e6692aa28f350df4fbd032df4a", "assets/js/repair-patrimonial-core.js": "6122eb49ac383a5a972c6acd1acf51541df8fbc42020ee5c23d7aba6d5eda286", "assets/js/repair-patrimonial-firestore.js": "0f86ab334e5298c43a8540239518e5cbafad5fa07403baeedcc22612af99b5b8", "governanca-reparaveis-patrimonio.html": "3f3d066e794c46a67358b1ff297aeef1f980cdd9d9dfefc5379c8450ff081810", "assets/data/rp-summary.json": "b9831586fa8d3bcd80370d2e07381735d4d839f53af8bcd0b202b2822c6ed9b2", "assets/js/rp-data.js": "3bee3596d5629b537bb77f7a0fe9430547344d87c724d9ae04178dd5200d57dd", "assets/js/accountability-panel.js": "75825ecc6f8834382cb81d8abdb73ebe01ed36c507ed7967b1ca9d57ca3d11a4", "assets/js/auth.js": "af59391f872fe27532bf2378abd795b54f84259cb5a4b439a65b7e03d80300fb"};
const corrected=["PBT055004CP", "PBT055006CP", "PBT056005CP", "PBT056013CP", "PBT056014CP"];

test('25/09 active snapshot has 53 unique BAC and stable IDs, all PN and original USD values',()=>{
  assert.deepEqual(req,load('assets/data/requisitions-available-25092026.json'));
  assert.equal(req.metadata.position,'25/09/2026');
  assert.equal(req.metadata.currency,'USD');
  assert.equal(req.records.length,53);
  assert.equal(new Set(req.records.map(r=>r.requestNumber)).size,53);
  assert.equal(new Set(req.records.map(r=>r.id)).size,53);
  assert.equal(req.metadata.partNumberRecordCount,53);
  assert.equal(new Set(req.records.map(r=>r.partNumber)).size,51);
  assert.ok(req.records.every(r=>typeof r.partNumber==='string'&&r.partNumber.length));
  assert.equal(new Set(req.records.map(r=>r.ugCode)).size,4);
  assert.equal(sum(req.records,'requestValue'),276073652);
  assert.equal(sum(req.records,'committedValue'),0);
  assert.equal(sum(req.records,'balanceToCommit'),276073652);
  assert.ok(req.records.every(r=>r.committedValueSource===0&&r.balanceToCommit===r.requestValue));
});
test('exactly the five authorized PAMB corrections are applied, with original values kept for audit',()=>{
  const affected=req.records.filter(r=>r.expenseNatureCorrection);
  assert.deepEqual(affected.map(r=>r.requestNumber).sort(),corrected);
  assert.equal(audit.confirmedCorrections.length,5);
  for(const r of affected){
    assert.equal(r.ugCode,'120047');
    assert.equal(r.om,'PAMB-RJ');
    assert.equal(r.expenseNatureSource,'349030');
    assert.equal(r.expenseNature,'339030');
    assert.ok(r.expenseNatureCorrection.includes('confirmação expressa'));
  }
  assert.equal(req.records.some(r=>r.expenseNature==='349030'),false);
  assert.equal(sum(affected,'requestValue'),153567770);
});
test('specific nature and wildcard Ação/PI stay inside each OM',()=>{
  assert.ok(req.records.every(r=>r.action==='*'&&r.pi==='*'));
  assert.ok(req.records.every(r=>/^\d{6}$/.test(r.expenseNature)));
  const count={};
  req.records.forEach(r=>{count[r.expenseNature]=(count[r.expenseNature]||0)+1;});
  assert.deepEqual(count,{'339030':40,'339039':5,'449052':8});
  for(const g of rows){
    const raw=credit.records.filter(c=>c.ugCode===g.ugCode&&c.expenseNature===g.expenseNature);
    assert.equal(cents(g.creditAvailable),sum(raw,'creditAvailable'));
  }
});
test('replacement reconciles 90 old records into 37 retained + 16 added, without treating absence as a payment',()=>{
  const previous=new Map(hist.records.map(r=>[r.requestNumber,r]));
  const current=new Map(req.records.map(r=>[r.requestNumber,r]));
  assert.equal(req.records.filter(r=>previous.has(r.requestNumber)).length,37);
  assert.equal(req.records.filter(r=>!previous.has(r.requestNumber)).length,16);
  assert.equal(hist.records.filter(r=>!current.has(r.requestNumber)).length,53);
  for(const r of req.records)if(previous.has(r.requestNumber))assert.equal(r.id,previous.get(r.requestNumber).id);
  assert.equal(req.records.some(r=>r.requestNumber==='GLT099002R2'),false);
  assert.equal(req.records.find(r=>r.requestNumber==='GLS045004P3').proposalValidityDate,'2026-10-25');
});
for(const [ug,nd,count,demand,amount,remaining,deficit] of expected){
  test(`25/09 requests x 22/09 credit: ${ug}/${nd}`,()=>{
    const g=rows.find(r=>r.ugCode===ug&&r.expenseNature===nd);
    assert.ok(g); assert.equal(g.requestCount,count);
    assert.equal(cents(g.balanceToCommit),cents(demand));
    assert.equal(cents(g.creditAvailable),cents(amount));
    assert.equal(cents(g.creditRemaining),cents(remaining));
    assert.equal(cents(g.deficit),cents(deficit));
    assert.equal(g.status,deficit?'Crédito insuficiente':'Crédito suficiente');
  });
}
test('total deficit does not borrow surplus from another OM/nature or count the same credit twice',()=>{
  assert.equal(credit.metadata.position,'22/09/2026');
  assert.equal(rows.length,6);
  assert.equal(report.totals.requestCount,53);
  assert.equal(cents(report.totals.creditAvailable),138547069);
  assert.equal(cents(report.totals.creditRemaining),49945669);
  assert.equal(cents(report.totals.deficit),187472252);
  assert.equal(cents(report.totals.balanceToCommit),276073652);
  assert.equal(cents(report.totals.creditAvailable)+cents(report.totals.deficit),
    cents(report.totals.balanceToCommit)+cents(report.totals.creditRemaining));
  assert.equal(rows.filter(r=>r.status==='Crédito insuficiente').length,3);
  const used=rows.flatMap(r=>r.creditSourceLines);
  assert.equal(used.length,new Set(used).size);
  const grouped=crossCreditAndRequisitions(credit.groupedByMatchKey,req.records);
  const project=r=>r.map(g=>[g.matchKey,g.creditAvailable,g.deficit,g.creditRemaining]).sort();
  assert.deepEqual(project(rows),project(grouped));
});
test('detailed report lists exactly 53 BAC/PN under four OMs, and PAMB filter contains only five requests',()=>{
  assert.equal(report.requests.length,53);
  assert.equal(report.omSummaries.length,4);
  assert.equal(new Set(report.requests.map(r=>r.requestNumber)).size,53);
  for(const r of report.requests){
    const original=req.records.find(o=>o.requestNumber===r.requestNumber);
    assert.equal(r.partNumber,original.partNumber);
    assert.equal(r.expenseNature,original.expenseNature);
  }
  const pamb=buildDetailedCrossReportData(rows.filter(r=>r.ugCode==='120047'),req.records);
  assert.equal(pamb.requests.length,5);
  assert.equal(cents(pamb.totals.creditAvailable),5892604);
  assert.equal(cents(pamb.totals.deficit),147675166);
  assert.ok(pamb.requests.every(r=>r.expenseNature==='339030'));
});
test('unrelated active bases and the full patrimonial panel remain byte-identical',()=>{
  for(const [name,hash] of Object.entries(protectedHashes)){
    const actual=createHash('sha256').update(fs.readFileSync(new URL(`../${name}`,import.meta.url))).digest('hex');
    assert.equal(actual,hash,name);
  }
});
test('menu, panels, download filenames and cache versions point to the updated portfolio',()=>{
  for(const name of ['requisicoes.html','requisicoes-disponiveis-empenho.html','requisicoes-cruzamento-credito.html']){
    const html=fs.readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
    assert.ok(html.includes('25/09/2026'));
    assert.ok(!html.includes('as 90 requisições'));
    assert.ok(!html.includes('Nos 23 registros'));
  }
  const js=fs.readFileSync(new URL('../assets/js/requisitions-available-panel.js',import.meta.url),'utf8');
  assert.ok(js.includes('20260925-requisitions-r1'));
  assert.ok(js.includes('${exportPositionTag()}.pdf'));
  assert.ok(js.includes('${exportPositionTag()}.csv'));
  const crossJs=fs.readFileSync(new URL('../assets/js/requisition-credit-cross-panel.js',import.meta.url),'utf8');
  assert.ok(crossJs.includes('20260925-requisitions-r1'));
  assert.ok(crossJs.includes('Part Number (PN)'));
});
