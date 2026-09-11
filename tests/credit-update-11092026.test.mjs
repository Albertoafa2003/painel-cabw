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
  ['120026','339030',16,511822.48,836354.31,324531.83,0],
  ['120026','449052',1,16256,27861.76,11605.76,0],
  ['120049','339030',3,21273.60,25906.55,4632.95,0],
  ['120049','449052',18,339045.35,272236.65,0,66808.70],
  ['120068','339030',17,274692.50,826549.75,551857.25,0],
  ['120068','339039',12,153377.86,13718.08,0,139659.78],
];

test('11/09 credit dates, account and totals agree across both active sources',()=>{
  assert.equal(credit.position,'11/09/2026');
  assert.equal(budget.metadata.position,credit.position);
  assert.equal(budget.metadata.sourceGeneratedAt,'11/09/2026 11:27:42');
  assert.equal(credit.references.conorDataReference,'11/09/2026 00:02');
  assert.equal(budget.metadata.account,'622110000');
  assert.equal(budget.metadata.emitterUg,'120090');
  assert.equal(sumCents(budget.records,'creditAvailable'),327944302);
  assert.equal(budget.metadata.totalCreditAvailable,3279443.02);
  assert.equal(parseMoney(credit.executive['Crédito total recebido em 2026']),129266335.74);
  assert.equal(parseMoney(credit.executive['Crédito movimentado/comprometido por diferença']),125986892.72);
});

test('99 distinct credit lines aggregate into 84 unique matching keys',()=>{
  assert.equal(budget.records.length,99);
  assert.equal(new Set(budget.records.map(r=>r.id)).size,99);
  assert.equal(new Set(budget.records.map(r=>r.sourceLine)).size,99);
  const grouped=groupCredit(budget.records);
  assert.equal(grouped.length,84);assert.equal(budget.groupedByMatchKey.length,84);
  assert.equal(sumCents(grouped,'creditAvailable'),327944302);
  assert.equal(sumCents(budget.groupedByMatchKey,'creditAvailable'),327944302);
  assert.equal(new Set(budget.records.map(r=>r.ugCode)).size,16);
  assert.equal(new Set(budget.records.map(r=>r.action)).size,18);
  assert.equal(new Set(budget.records.map(r=>r.pi)).size,44);
  assert.equal(new Set(budget.records.map(r=>r.expenseNature)).size,7);
  assert.equal(new Set(budget.records.map(r=>r.fundingSource)).size,7);
  for(const g of grouped){
    const stored=budget.groupedByMatchKey.find(r=>r.matchKey===g.matchKey);
    assert.equal(cents(stored.creditAvailable),cents(g.creditAvailable));
    assert.deepEqual(stored.sourceLines,g.sourceLines);
    assert.equal(stored.launches,g.launches);
  }
});

test('UG ranking reconciles line by line, including PAME-RJ residual and no old CISCEA balance',()=>{
  assert.equal(credit.ugRanking.length,16);
  assert.equal(sumCents(credit.ugRanking,'Crédito Disponível Número'),327944302);
  for(const ug of credit.ugRanking){
    const rows=budget.records.filter(r=>r.ugCode===ug['Código UG']);
    assert.equal(rows.length,Number(ug['Lanç.']));
    assert.equal(sumCents(rows,'creditAvailable'),cents(ug['Crédito Disponível Número']));
  }
  assert.equal(credit.ugRanking[0]['Sigla'],'PAMA-LS');
  assert.equal(credit.ugRanking.find(r=>r['Código UG']==='120048')['Crédito Disponível Número'],0.04);
  assert.equal(budget.records.some(r=>r.ugCode==='120127'),false);
});

test('41 UG/PTRES groups and 18 action totals agree with the analytical CONRAZAO',()=>{
  assert.equal(credit.detailByUGPTRES.length,41);
  assert.equal(credit.actionByUG.length,41);
  assert.equal(credit.actionRanking.length,18);
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

test('20 receipt actions have complete unambiguous joins and correct difference',()=>{
  const rows=credit.creditReceivedByAction;
  assert.equal(rows.length,20);
  assert.equal(sumCents(rows,'Crédito Recebido Número'),12926633574);
  assert.equal(sumCents(rows,'Crédito Disponível Número'),327944302);
  for(const row of rows){
    const available=credit.actionRanking.find(r=>r['Ação']===row['Ação']);
    assert.equal(cents(row['Crédito Disponível Número']),cents(available?.['Crédito Disponível Número']||0));
    assert.equal(cents(parseMoney(row['Diferença'])),cents(row['Crédito Recebido Número'])-cents(row['Crédito Disponível Número']));
  }
});

test('history retains all 18 old dates and adds 11/09 exactly once',()=>{
  const previous=load('credit-01092026.json');
  assert.equal(credit.summary.length,19);
  assert.deepEqual(credit.summary.slice(0,-1),previous.summary);
  assert.equal(credit.summary.filter(r=>r[0]==='11/09/2026').length,1);
  assert.deepEqual(credit.summary.at(-1),['11/09/2026','US$ 3.279.443,02','US$ 129.266.335,74','2,54%','US$ 125.986.892,72','99']);
});

test('current requisitions remain the 07/09 snapshot with all 67 PN and approved ND correction',()=>{
  assert.deepEqual(req,load('requisitions-available-07092026.json'));
  assert.equal(req.records.length,67);
  assert.equal(req.metadata.position,'07/09/2026');
  assert.equal(req.records.every(r=>r.partNumber && r.action==='*' && r.pi==='*'),true);
  assert.equal(new Set(req.records.map(r=>r.partNumber)).size,61);
  assert.equal(req.records.find(r=>r.requestNumber==='GLT099002R2').expenseNature,'449052');
});

for(const [ug,nd,count,demand,amount,remaining,deficit] of expected){
  test(`11/09 cross ${ug}/${nd}: amount, demand, remaining and deficit reconcile`,()=>{
    const g=cross.find(r=>r.ugCode===ug&&r.expenseNature===nd);
    assert.ok(g);assert.equal(g.requestCount,count);
    assert.equal(cents(g.balanceToCommit),cents(demand));
    assert.equal(cents(g.creditAvailable),cents(amount));
    assert.equal(cents(g.creditRemaining),cents(remaining));
    assert.equal(cents(g.deficit),cents(deficit));
    assert.equal(g.status,deficit?'Crédito insuficiente':'Crédito suficiente');
    const lines=budget.records.filter(r=>g.creditSourceLines.includes(r.sourceLine));
    assert.ok(lines.every(r=>r.ugCode===ug&&r.expenseNature===nd));
    assert.equal(sumCents(lines,'creditAvailable'),cents(amount));
  });
}

test('current crossing never counts the same credit twice or offsets deficits between classifications',()=>{
  assert.equal(cross.length,6);
  assert.equal(report.totals.requestCount,67);
  assert.equal(cents(report.totals.balanceToCommit),131646779);
  assert.equal(cents(report.totals.creditAvailable),200262710);
  assert.equal(cents(report.totals.creditRemaining),89262779);
  assert.equal(cents(report.totals.deficit),20646848);
  assert.equal(cents(report.totals.creditAvailable)+cents(report.totals.deficit)-cents(report.totals.balanceToCommit),cents(report.totals.creditRemaining));
  const lines=cross.flatMap(g=>g.creditSourceLines);
  assert.equal(lines.length,new Set(lines).size);
  assert.equal(cross.filter(g=>g.status==='Crédito insuficiente').length,2);
});

test('the detailed PDF data retains every PN and isolates filtered OM/Natureza without inflated credit',()=>{
  assert.equal(report.omSummaries.length,3);assert.equal(report.requests.length,67);
  assert.ok(report.requests.every(r=>r.partNumber));
  const filtered=cross.filter(g=>g.ugCode==='120068'&&g.expenseNature==='339039');
  const r=buildDetailedCrossReportData(filtered,req.records);
  assert.equal(r.requests.length,12);assert.equal(r.omSummaries.length,1);
  assert.equal(cents(r.totals.creditAvailable),1371808);assert.equal(cents(r.totals.deficit),13965978);
  assert.ok(r.requests.every(r=>r.expenseNature==='339039' && r.ugCode==='120068' && r.partNumber));
});

test('raw lines and grouped credit produce the same crossing',()=>{
  const rawCross=crossCreditAndRequisitions(budget.records,req.records);
  const keyfields=x=>x.map(r=>[r.matchKey,r.creditAvailable,r.balanceToCommit,r.creditRemaining,r.deficit]).sort();
  assert.deepEqual(keyfields(rawCross),keyfields(cross));
});
