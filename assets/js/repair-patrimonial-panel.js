import { BUNDLED_REPAIR_DATA } from './repair-processes-current-data.js?v=20260922-patrimonial-r1';
import { PTAX_REFERENCE } from './patrimonial-reference.js?v=20260922-patrimonial-r1';
import { assessValue, sortValue, summarizeValues, normalizedSearch, safeCsv, CLASS_LABELS } from './repair-patrimonial-core.js?v=20260922-patrimonial-r1';
import { calculateReturnDeadline, mapVisualStage, normalizeOriginOm } from './repair-import-core.js?v=20260922-patrimonial-r1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,c='USD')=>v===null||!Number.isFinite(v)?'Não informado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:c}).format(v);
const date=v=>/^\d{4}-\d{2}-\d{2}/.test(v||'')?String(v).slice(0,10).split('-').reverse().join('/'):'Não informada';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let records=BUNDLED_REPAIR_DATA.records.filter(r=>!r.archivedOutOfScope&&!/^24T/.test(r.po)),filtered=[],fx={...PTAX_REFERENCE};
let sourceText='Base operacional: 21/09/2026 · Avaliações incorporadas em 22/09/2026';
let fxText='Cotação de fechamento incluída no pacote; verificando se há fechamento mais recente.';
function loadOptions(){
  for(const [id,field] of [['pvOm','originOm'],['pvStage','visualStage'],['pvRepairer','repairerName'],['pvStatus','realStatus']]){
    const select=$(id),old=select.value;
    const opts=[...new Set(records.map(r=>field==='visualStage'?mapVisualStage(r.realStatus):field==='originOm'?(normalizeOriginOm(r.originOm).value||r.originOm):r[field]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
    select.innerHTML='<option value="">Todos</option>'+opts.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if(opts.includes(old))select.value=old;
  }
}
function classificationBadge(r){return `<span class="pv-badge pv-badge--${r.classification}">${esc(CLASS_LABELS[r.classification])}</span>`;}
function recRows(){
  return records.map(r=>{
    const x=assessValue(r,fx);x.originOm=normalizeOriginOm(r.originOm).value||r.originOm;
    x.visualStage=mapVisualStage(r.realStatus);x.returnInfo=calculateReturnDeadline(r,today());return x;
  });
}
function applyFilters(){
  const q=normalizedSearch($('pvSearch').value.trim());
  filtered=sortValue(recRows().filter(r=>{
    if($('pvOm').value&&r.originOm!==$('pvOm').value)return false;
    if($('pvStage').value&&r.visualStage!==$('pvStage').value)return false;
    if($('pvStatus').value&&r.realStatus!==$('pvStatus').value)return false;
    if($('pvRepairer').value&&r.repairerName!==$('pvRepairer').value)return false;
    if($('pvClassification').value&&r.classification!==$('pvClassification').value)return false;
    if($('pvReturn').value&&r.returnInfo.code!==$('pvReturn').value)return false;
    return !q||normalizedSearch([r.po,r.requisition,r.partNumber,r.serialNumber,r.originOm,r.nup,r.cotacaoSiscab,r.repairerName,r.description].join(' ')).includes(q);
  }),$('pvOrder').value);
  render();
}
function render(){
  const s=summarizeValues(filtered);
  $('pvCount').textContent=s.count;$('pvKnown').textContent=s.known;$('pvAlert').textContent=s.alert;$('pvUnknown').textContent=s.unknown+s.unconverted;
  $('pvTotal').textContent=money(s.sumUsd);$('pvMax').textContent=money(s.maximumUsd);
  $('pvResults').textContent=`${s.count} de ${records.length} itens · ${s.pos} POs · ${s.known} avaliações · ${s.below} abaixo do patamar`;
  $('pvSource').textContent=sourceText;
  $('pvRate').textContent=`PTAX venda · ${date(fx.date)} · US$ 1 = R$ ${Number(fx.rate).toFixed(4).replace('.',',')}`;
  $('pvFxMessage').textContent=fxText;
  const priority=filtered.filter(r=>r.classification==='alert'&&r.returnInfo.code==='overdue');
  $('pvPriority').textContent=`${priority.length} item(ns) no patamar patrimonial e com retorno atualmente atrasado. O valor do item não demonstra, por si só, a ocorrência de perda ou dano.`;
  $('pvBody').innerHTML=filtered.length?filtered.map((r,i)=>`<tr class="${r.classification==='alert'?'pv-row-alert':''}"><td>${i+1}</td><td><strong>${esc(r.originOm)}</strong><br>${esc(r.po)}</td><td>${esc(r.requisition)}<br><small>PN ${esc(r.partNumber)}<br>SN ${esc(r.serialNumber)}</small></td><td class="pv-money">${money(r.valuation.value,r.valuation.currency||'USD')}</td><td class="pv-money">${r.valueBrl===null?'Não classificável':money(r.valueBrl,'BRL')}</td><td>${classificationBadge(r)}</td><td>${esc(r.realStatus)}<br><small>${esc(r.visualStage)}</small></td><td>${esc(r.repairerName||'Não informado')}</td><td>${esc(r.returnInfo.label)}</td><td><button class="pv-link" data-item="${esc(r.id)}">Detalhes</button></td></tr>`).join(''):'<tr><td colspan="10">Nenhum item corresponde aos filtros selecionados.</td></tr>';
  $('pvBody').querySelectorAll('[data-item]').forEach(btn=>btn.addEventListener('click',()=>showDetails(btn.dataset.item)));
}
function showDetails(id){
  const r=recRows().find(r=>r.id===id);if(!r)return;
  $('pvDetailTitle').textContent=`${r.po} · ${r.requisition}`;
  const fields=[['Organização Militar',r.originOm],['Part Number',r.partNumber],['Serial Number',r.serialNumber],['Cotação SISCAB',r.cotacaoSiscab],['NUP',r.nup],['Valor original',money(r.valuation.value,r.valuation.currency||'USD')],['Equivalente em reais',r.valueBrl===null?'Não classificável':money(r.valueBrl,'BRL')],['Classificação patrimonial',CLASS_LABELS[r.classification]],['Cotação',`PTAX venda ${Number(fx.rate).toFixed(4)} — ${date(fx.date)}`],['Status Real',r.realStatus],['Localização / etapa visual',r.visualStage],['Reparador',r.repairerName],['DPE',date(r.dpeFinalDate)],['Retorno registrado',date(r.returnMaterialDate)],['Situação do retorno',r.returnInfo.label],['Fonte do valor',r.valuation.source],['Aba / linha',`${r.patrimonialSourceSheet||'—'} / ${r.valuation.row||'—'}`],['Taxa de avaliação — NÃO é valor do item',r.evaluationFee==null?'Não informada':String(r.evaluationFee)],['Observações',r.manualNotes||r.notes||r.description]];
  $('pvDetailBody').innerHTML=fields.map(([a,b])=>`<div><dt>${esc(a)}</dt><dd>${esc(b??'Não informado')}</dd></div>`).join('');$('pvDialog').showModal();
}
function exportRows(){return filtered.map(r=>[r.originOm,r.po,r.requisition,r.partNumber,r.serialNumber,r.nup||'',r.cotacaoSiscab||'',r.valuation.value??'',r.valuation.currency||'',r.valueBrl??'',fx.rate,fx.date,CLASS_LABELS[r.classification],r.realStatus,r.visualStage,r.repairerName||'',r.dpeFinalDate||'',r.returnMaterialDate||'',r.returnInfo.label,r.valuation.source,r.valuation.row||'']);}
function downloadCsv(){
  const head=['OM','PO','Requisição','PN','SN','NUP','Cotação SISCAB','Valor do item','Moeda original','Valor equivalente BRL','PTAX venda','Data PTAX','Classificação','Status Real','Etapa Visual','Reparador','DPE','Retorno','Situação do retorno','Arquivo fonte','Linha fonte'];
  const text='\uFEFF'+[head,...exportRows()].map(r=>r.map(safeCsv).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download=`reparaveis_patrimonio_${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function reportPdf(){
  if(!window.jspdf?.jsPDF || typeof window.jspdf.jsPDF.API.autoTable !== 'function'){$('pvPrintNote').textContent='Relatório filtrado — '+$('pvRate').textContent+' — gerado em '+new Date().toLocaleString('pt-BR');window.print();return;}
  const pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a3'});
  pdf.setFontSize(18);pdf.text('CABW | Materiais Reparáveis — Valor Patrimonial',12,16);
  pdf.setFontSize(9);const s=summarizeValues(filtered);
  pdf.text(`${filtered.length} itens | ${s.known} com avaliação | ${s.alert} no patamar de alerta | ${s.unknown} sem valor | ${$('pvRate').textContent}`,12,24);
  pdf.text('Alerta gerencial >= R$ 120.000,00. Não constitui determinação de instauração de TCE. TTE e valor de reparo não são valor patrimonial.',12,30);
  pdf.text('Fonte: '+sourceText+' | Emissão: '+new Date().toLocaleString('pt-BR'),12,36);
  pdf.autoTable({startY:42,margin:12,theme:'grid',styles:{fontSize:7,cellPadding:2,overflow:'linebreak'},head:[['OM / PO','Requisição / PN / SN','Valor USD','Equivalente BRL','Classificação','Status / Etapa','Reparador','Retorno / DPE','NUP / Cotação']],body:filtered.map(r=>[`${r.originOm}\n${r.po}`,`${r.requisition}\nPN ${r.partNumber}\nSN ${r.serialNumber}`,money(r.valuation.value),r.valueBrl==null?'Não classificável':money(r.valueBrl,'BRL'),CLASS_LABELS[r.classification],`${r.realStatus}\n${r.visualStage}`,r.repairerName||'—',`${r.returnInfo.label}\nDPE ${date(r.dpeFinalDate)}`,`${r.nup||'—'}\n${r.cotacaoSiscab||'—'}`])});
  for(let i=1;i<=pdf.getNumberOfPages();i++){pdf.setPage(i);pdf.setFontSize(8);pdf.text(`${i} / ${pdf.getNumberOfPages()}`,pdf.internal.pageSize.getWidth()-24,pdf.internal.pageSize.getHeight()-6);}
  pdf.save(`reparaveis_patrimonio_${today()}.pdf`);
}
async function updateFx(){
  $('pvRefreshRate').disabled=true;
  const end=today(),start=new Date(end+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-15);
  const format=d=>`${d.slice(5,7)}-${d.slice(8,10)}-${d.slice(0,4)}`;
  const params=new URLSearchParams({'@moeda':"'USD'",'@dataInicial':`'${format(start.toISOString().slice(0,10))}'`,'@dataFinalCotacao':`'${format(end)}'`,'$format':'json','$filter':"tipoBoletim eq 'Fechamento'",'$orderby':'dataHoraCotacao desc','$top':'1'});
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
  try {
    const response=await fetch('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?'+params,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('BCB indisponível');
    const data=await response.json();const row=(data.value||[]).find(r=>r.tipoBoletim==='Fechamento'&&Number(r.cotacaoVenda)>0&&r.dataHoraCotacao.slice(0,10)<=end);
    if(!row)throw new Error('Fechamento não retornado');
    const ref=row.dataHoraCotacao.slice(0,10);
    if(ref<fx.date)throw new Error('Cotação retornada anterior à referência preservada');
    fx={...fx,rate:Number(row.cotacaoVenda),date:ref,mode:'live'};fxText='Último fechamento disponível consultado no Banco Central. A classificação foi recalculada.';
  }catch{fxText=`Consulta online indisponível. Mantida a PTAX verificada de ${date(fx.date)}; nenhum câmbio foi estimado.`;}
  finally{clearTimeout(timeout);$('pvRefreshRate').disabled=false;applyFilters();}
}
for(const id of ['pvOm','pvStage','pvRepairer','pvStatus','pvClassification','pvReturn','pvOrder'])$(id).addEventListener('change',applyFilters);
$('pvSearch').addEventListener('input',applyFilters);
$('pvClear').addEventListener('click',()=>{document.querySelectorAll('.pv-filters select').forEach(x=>x.value=x.id==='pvOrder'?'desc':'');$('pvSearch').value='';applyFilters();});
$('pvCsv').addEventListener('click',downloadCsv);$('pvPdf').addEventListener('click',reportPdf);$('pvClose').addEventListener('click',()=>$('pvDialog').close());$('pvRefreshRate').addEventListener('click',updateFx);
loadOptions();applyFilters();updateFx();
// Integration is read-only and isolated: a cloud outage cannot hide the dated local snapshot.
import('./repair-patrimonial-firestore.js?v=20260922-patrimonial-r1').then(m=>m.subscribeValuations(BUNDLED_REPAIR_DATA,(next,label)=>{records=next;sourceText=label;loadOptions();applyFilters();})).catch(()=>{$('pvCloud').textContent='Integração online indisponível; exibindo o retrato do pacote, sem alteração no Firestore.';});
