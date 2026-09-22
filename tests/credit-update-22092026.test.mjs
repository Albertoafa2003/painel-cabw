import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { groupCredit, crossCreditAndRequisitions, buildDetailedCrossReportData } from '../assets/js/requisition-core.js';
const load = name => JSON.parse(fs.readFileSync(new URL(`../assets/data/${name}`, import.meta.url),'utf8'));
const credit = load('credit-current.json');
const budget = load('credit-budget-detailed-current.json');
const req = load('requisitions-available-current.json');
const cents = v => Math.round(Number(v)*100);
const sumCents = (rows, field) => rows.reduce((total,row)=>total+cents(row[field]),0);
const parseMoney = v => Number(String(v).replace(/US\$\s*/g,'').replace(/\./g,'').replace(',','.'));
const cross = crossCreditAndRequisitions(budget.groupedByMatchKey, req.records);
const report = buildDetailedCrossReportData(cross, req.records);
const expected = [
  ['120026','339030',40,1809381.85,706560.31,0,1102821.54],
  ['120026','449052',1,16256,27861.76,11605.76,0],
  ['120049','339030',3,1691.75,25906.55,24214.80,0],
  ['120049','449052',20,392317.75,133726.65,0,258591.10],
  ['120068','339030',14,204392.50,444677.85,240285.35,0],
  ['120068','339039',12,153377.86,13718.08,0,139659.78],
];

test('22/09 credit dates, account and totals agree across active sources',()=>{
  assert.equal(credit.position,'22/09/2026');
  assert.equal(budget.metadata.position,credit.position);
  assert.equal(budget.metadata.sourceGeneratedAt,'22/09/2026 08:58:49');
  assert.equal(credit.references.conorDataReference,'22/09/2026 00:02');
  assert.equal(budget.metadata.account,'622110000');
  assert.equal(budget.metadata.emitterUg,'120090');
  assert.equal(sumCents(budget.records,'creditAvailable'),236767608);
  assert.equal(cents(budget.metadata.totalCreditAvailable),236767608);
  assert.equal(parseMoney(credit.executive['Crédito total recebido em 2026']),129588112.12);
  assert.equal(parseMoney(credit.executive['Crédito movimentado/comprometido por diferença']),127220436.04);
});

test('102 distinct credit lines aggregate into 88 unique matching keys',()=>{
  assert.equal(budget.records.length,102);
  assert.equal(new Set(budget.records.map(r=>r.id)).size,102);
  assert.equal(new Set(budget.records.map(r=>r.sourceLine)).size,102);
  const grouped=groupCredit(budget.records);
  assert.equal(grouped.length,88); assert.equal(budget.groupedByMatchKey.length,88);
  assert.equal(sumCents(grouped,'creditAvailable'),236767608);
  assert.equal(sumCents(budget.groupedByMatchKey,'creditAvailable'),236767608);
  assert.equal(new Set(budget.records.map(r=>r.ugCode)).size,15);
  assert.equal(new Set(budget.records.map(r=>r.action)).size,17);
  assert.equal(new Set(budget.records.map(r=>r.pi)).size,47);
  assert.equal(new Set(budget.records.map(r=>r.expenseNature)).size,8);
  assert.equal(new Set(budget.records.map(r=>r.fundingSource)).size,7);
});

test('UG ranking reconciles line by line',()=>{
  assert.equal(credit.ugRanking.length,15);
  assert.equal(sumCents(credit.ugRanking,'Crédito Disponível Número'),236767608);
  for(const ug of credit.ugRanking){
    const rows=budget.records.filter(r=>r.ugCode===ug['Código UG']);
    assert.equal(rows.length,Number(ug['Lanç.']));
    assert.equal(sumCents(rows,'creditAvailable'),cents(ug['Crédito Disponível Número']));
  }
  assert.equal(credit.ugRanking[0]['Sigla'],'PAMA-LS');
  assert.equal(credit.ugRanking.find(r=>r['Código UG']==='120048')['Crédito Disponível Número'],0.04);
  assert.equal(credit.ugRanking.some(r=>r['Código UG']==='120106'),false);
});

test('40 UG/PTRES groups and 17 action totals agree with analytical CONRAZAO',()=>{
  assert.equal(credit.detailByUGPTRES.length,40);
  assert.equal(credit.actionByUG.length,40);
  assert.equal(credit.actionRanking.length,17);
  for(const row of credit.detailByUGPTRES){
    const raw=budget.records.filter(r=>r.ugCode===row.UG && r.ptres===row.PTRES);
    assert.equal(raw.length,Number(row['Lanç.']));
    assert.equal(sumCents(raw,'creditAvailable'),cents(row['Crédito Disponível Número']));
    assert.ok(raw.every(r=>r.action===row['Ação']));
  }
  for(const row of credit.actionRanking){
    const raw=budget.records.filter(r=>r.action===row['Ação']);
    assert.equal(raw.length,Number(row['Lanç.']));
    assert.equal(sumCents(raw,'creditAvailable'),cents(row['Crédito Disponível Número']));
  }
});

test('20 receipt actions join to current available totals and differences',()=>{
  const rows=credit.creditReceivedByAction;
  assert.equal(rows.length,20);
  assert.equal(sumCents(rows,'Crédito Recebido Número'),12958811212);
  assert.equal(sumCents(rows,'Crédito Disponível Número'),236767608);
  for(const row of rows){
    const available=credit.actionRanking.find(r=>r['Ação']===row['Ação']);
    assert.equal(cents(row['Crédito Disponível Número']),cents(available?.['Crédito Disponível Número']||0));
    assert.equal(cents(parseMoney(row['Diferença'])),cents(row['Crédito Recebido Número'])-cents(row['Crédito Disponível Número']));
  }
});

test('history keeps 11/09 and adds 22/09 exactly once',()=>{
  const previous=load('credit-11092026.json');
  assert.equal(credit.summary.length,20);
  assert.deepEqual(credit.summary.slice(0,-1),previous.summary);
  assert.equal(credit.summary.filter(r=>r[0]==='22/09/2026').length,1);
  assert.deepEqual(credit.summary.at(-1),['22/09/2026','US$ 2.367.676,08','US$ 129.588.112,12','1,83%','US$ 127.220.436,04','102']);
});

test('requisitions remain the 14/09 snapshot with 90 PN',()=>{
  assert.deepEqual(req,load('requisitions-available-14092026.json'));
  assert.equal(req.records.length,90);
  assert.equal(req.metadata.position,'14/09/2026');
  assert.equal(req.records.every(r=>r.partNumber && r.action==='*' && r.pi==='*'),true);
});

for(const [ug,nd,count,demand,amount,remaining,deficit] of expected){
  test(`22/09 cross ${ug}/${nd} reconciles`,()=>{
    const g=cross.find(r=>r.ugCode===ug&&r.expenseNature===nd);
    assert.ok(g); assert.equal(g.requestCount,count);
    assert.equal(cents(g.balanceToCommit),cents(demand));
    assert.equal(cents(g.creditAvailable),cents(amount));
    assert.equal(cents(g.creditRemaining),cents(remaining));
    assert.equal(cents(g.deficit),cents(deficit));
    assert.equal(g.status,deficit?'Crédito insuficiente':'Crédito suficiente');
  });
}

test('current crossing does not double count credit or offset deficits',()=>{
  assert.equal(cross.length,6);
  assert.equal(report.totals.requestCount,90);
  assert.equal(cents(report.totals.balanceToCommit),257741771);
  assert.equal(cents(report.totals.creditAvailable),135245120);
  assert.equal(cents(report.totals.creditRemaining),27610591);
  assert.equal(cents(report.totals.deficit),150107242);
  assert.equal(cents(report.totals.creditAvailable)+cents(report.totals.deficit)-cents(report.totals.balanceToCommit),cents(report.totals.creditRemaining));
  const lines=cross.flatMap(g=>g.creditSourceLines);
  assert.equal(lines.length,new Set(lines).size);
  assert.equal(cross.filter(g=>g.status==='Crédito insuficiente').length,3);
});

test('detailed report retains PN and current credit position can support PDF',()=>{
  assert.equal(report.omSummaries.length,3); assert.equal(report.requests.length,90);
  assert.ok(report.requests.every(r=>r.partNumber));
  const filtered=cross.filter(g=>g.ugCode==='120049'&&g.expenseNature==='449052');
  const r=buildDetailedCrossReportData(filtered,req.records);
  assert.equal(r.requests.length,20); assert.equal(r.omSummaries.length,1);
  assert.equal(cents(r.totals.creditAvailable),13372665); assert.equal(cents(r.totals.deficit),25859110);
});

test('raw lines and grouped credit produce identical crossing',()=>{
  const rawCross=crossCreditAndRequisitions(budget.records,req.records);
  const keyfields=x=>x.map(r=>[r.matchKey,r.creditAvailable,r.balanceToCommit,r.creditRemaining,r.deficit]).sort();
  assert.deepEqual(keyfields(rawCross),keyfields(cross));
});
