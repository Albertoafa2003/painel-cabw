import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { getFirestore, onSnapshot, collection, doc } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { AUTHORIZED_EMAILS } from './authorized-emails.js';
import { mergeValuation } from './repair-patrimonial-core.js?v=20260922-patrimonial-r1';
const config={apiKey:'AIzaSyDZehcWZwnwlGG5LR6y7_hKAVErHiHDhXM',authDomain:'painel-cabw.firebaseapp.com',projectId:'painel-cabw',appId:'1:6881251447:web:b497f601fb005d65d13672'};
export function subscribeValuations(bundle,onData){
  const app=getApps().length?getApp():initializeApp(config),auth=getAuth(app),db=getFirestore(app);
  let unsub=[],rows=null,cfg=null;
  const local=new Map(bundle.records.map(r=>[r.id,r]));
  const eligible=r=>r.po&&r.requisition&&r.partNumber&&r.serialNumber&&!r.archivedOutOfScope&&!/^24T/.test(r.po);
  function rebuild(){
    if(!rows)return;
    const current=rows.filter(r=>eligible(r)&&(!cfg?.activeBatchId||r.lastSeenBatchId===cfg.activeBatchId||r.manualOnly));
    if(current.length&&String(cfg?.referenceDate||'')>String(bundle.metadata.referenceDate||'')){
      onData(current.map(r=>mergeValuation(r,local.get(r.id))),`Operações Firestore: ${cfg.referenceDate} · Valores: fonte individual registrada no detalhe`);
    }else{
      const cloud=new Map(current.map(r=>[r.id,r]));
      const next=bundle.records.filter(eligible).map(r=>{
        const c=cloud.get(r.id);let v={...r};
        if(c){ for(const f of ['processNumber','description','manualNotes'])if(c[f]!=null)v[f]=c[f];
          if(String(c.patrimonialReferenceDate||'')>String(r.patrimonialReferenceDate||''))v=mergeValuation(v,c); }
        return v;
      });
      current.filter(r=>r.manualOnly&&!local.has(r.id)).forEach(r=>next.push(r));
      onData(next,'Operações: retrato 21/09/2026 · Avaliações: 22/09/2026, com complementos posteriores do Firestore quando disponíveis');
    }
  }
  onAuthStateChanged(auth,user=>{
    unsub.forEach(fn=>fn());unsub=[];
    if(!user?.emailVerified||!AUTHORIZED_EMAILS.has(String(user.email||'').toLowerCase()))return;
    const fail=()=>{const e=document.getElementById('pvCloud');if(e)e.textContent='Leitura do Firestore indisponível; mantida a base datada incluída no pacote.';};
    unsub.push(onSnapshot(doc(db,'repairProcessesConfig','current'),snap=>{cfg=snap.data()||{};rebuild();},fail));
    unsub.push(onSnapshot(collection(db,'repairProcesses'),snap=>{rows=snap.docs.map(d=>({id:d.id,...d.data()}));rebuild();},fail));
  });
}
