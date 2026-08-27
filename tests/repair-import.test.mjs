import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REAL_STATUS_OPTIONS,
  VISUAL_STAGE_OPTIONS,
  ORIGIN_OM_MAP,
  normalizeNullable,
  normalizeControlValue,
  normalizeRealStatus,
  normalizeOriginOm,
  deriveOriginOm,
  normalizeEvaluationFee,
  calculateTdrStatus,
  classifyDocumentaryStatus,
  calculateReturnDeadline,
  mapVisualStage,
  isPo2024,
  stableKeySource,
  sha256Hex,
  importedDataEqual
} from "../assets/js/repair-import-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../assets/data/repair-processes-current.json"),
    "utf8"
  )
);

test("normalização geral e controles none", () => {
  assert.equal(normalizeNullable(" none "), null);
  assert.equal(normalizeControlValue(" none "), "none");
});

test("PO 24T é reconhecida como fora do escopo", () => {
  assert.equal(isPo2024("24T000001"), true);
  assert.equal(isPo2024("25T000001"), false);
});

test("TTE válida é mantida sem moeda", () => {
  assert.deepEqual(
    normalizeEvaluationFee({ po: "25T000026", rawValue: 3500, formula: "" }),
    { value: 3500, raw: "3500", discardedReason: null }
  );
});

test("TDR com none ou data é entregue", () => {
  assert.equal(
    calculateTdrStatus("2026-07-24", "none", null, "2026-08-19").code,
    "delivered"
  );
  assert.equal(
    calculateTdrStatus(
      "2026-07-24",
      "2026-07-20",
      "2026-07-20",
      "2026-08-19"
    ).code,
    "delivered"
  );
});

test("TDR vencido com N vazia é atrasado", () => {
  const result = calculateTdrStatus(
    "2026-07-24",
    null,
    null,
    "2026-08-19"
  );
  assert.equal(result.code, "overdue");
  assert.equal(result.days, -26);
});

test("situação documental segue O e P", () => {
  assert.equal(classifyDocumentaryStatus(null, null).code, "tdr-not-received");
  assert.equal(classifyDocumentaryStatus("none", "none").code, "not-required");
  assert.equal(
    classifyDocumentaryStatus("none", "2025-06-01").code,
    "ficha-recorded-no-subprocess"
  );
  assert.equal(
    classifyDocumentaryStatus("123456", "2025-06-01").code,
    "registered"
  );
});

test("dez Status Reais oficiais estão disponíveis no filtro", () => {
  assert.deepEqual(REAL_STATUS_OPTIONS, [
    "1-Empenho Aprovado",
    "2-Item Chegou CTLA",
    "3-Item Exp CTLA",
    "4-Item chegou CABW/CABE",
    "5-Item Exp Reparador",
    "6-Item no Reparador",
    "7-Item Recebido",
    "8-Embarcado",
    "9-Recebido Parque",
    "10-Encerrado"
  ]);
});

test("seis Etapas Visuais oficiais estão disponíveis no filtro", () => {
  assert.deepEqual(VISUAL_STAGE_OPTIONS, [
    "Brasil/ OM Requisitante",
    "Brasil / CTLA",
    "Trânsito ao Reparador",
    "Reparador",
    "CABW/CABE (retorno)",
    "ETAPA NÃO MAPEADA"
  ]);
});

test("correlação visual agrupa múltiplos status na mesma localização", () => {
  assert.equal(mapVisualStage("1-Empenho Aprovado"), "Brasil/ OM Requisitante");
  assert.equal(mapVisualStage("2-Item Chegou CTLA"), "Brasil / CTLA");
  assert.equal(mapVisualStage("3-Item Exp CTLA"), "Trânsito ao Reparador");
  assert.equal(
    mapVisualStage("4-Item chegou CABW/CABE"),
    "Trânsito ao Reparador"
  );
  assert.equal(mapVisualStage("5-Item Exp Reparador"), "Trânsito ao Reparador");
  assert.equal(mapVisualStage("6-Item no Reparador"), "Reparador");
  assert.equal(mapVisualStage("7-Item Recebido"), "CABW/CABE (retorno)");
  assert.equal(mapVisualStage("8-Embarcado"), "CABW/CABE (retorno)");
  assert.equal(mapVisualStage("9-Recebido Parque"), "Brasil/ OM Requisitante");
  assert.equal(mapVisualStage("10-Encerrado"), "Brasil/ OM Requisitante");
});

test("variações da planilha e nomenclaturas antigas são canonicalizadas", () => {
  assert.equal(
    normalizeRealStatus("2-Item chegou CTLA").value,
    "2-Item Chegou CTLA"
  );
  assert.equal(
    normalizeRealStatus("4-Item chegou CABW/E").value,
    "4-Item chegou CABW/CABE"
  );
  assert.equal(
    normalizeRealStatus("5-Item Exp ao Reparador").value,
    "5-Item Exp Reparador"
  );
  assert.equal(
    normalizeRealStatus("3-Rep chegou CTLA").value,
    "2-Item Chegou CTLA"
  );
  assert.equal(
    normalizeRealStatus("6-Rep Exp ao Reparador").value,
    "5-Item Exp Reparador"
  );
  assert.equal(
    normalizeRealStatus("7-Rep Recebido").value,
    "7-Item Recebido"
  );
});

test("base de status 19/08 possui 113 registros únicos e nenhuma PO 24T", () => {
  assert.equal(payload.metadata.referenceDate, "2026-08-20");
  assert.equal(payload.metadata.statusReferenceDate, "2026-08-19");
  assert.equal(payload.metadata.validRows, 113);
  assert.equal(payload.records.length, 113);
  assert.equal(new Set(payload.records.map(item => item.id)).size, 113);
  assert.equal(payload.records.some(item => /^24T/i.test(item.po)), false);
});

test("todos os registros possuem status e etapa conforme as opções oficiais", () => {
  assert.equal(
    payload.records.every(item => REAL_STATUS_OPTIONS.includes(item.realStatus)),
    true
  );
  assert.equal(
    payload.records.every(item => VISUAL_STAGE_OPTIONS.includes(item.visualStage)),
    true
  );
  assert.equal(
    payload.records.every(
      item =>
        item.statusSourceFileName ===
        "19AGO V3 - CONTROLE REPARO - SGT ROZENDO.xlsx"
    ),
    true
  );
});

test("contagens de status e etapas correspondem à planilha de atualização", () => {
  assert.deepEqual(payload.metadata.statusCounts, {
    "7-Item Recebido": 70,
    "6-Item no Reparador": 16,
    "4-Item chegou CABW/CABE": 4,
    "2-Item Chegou CTLA": 19,
    "1-Empenho Aprovado": 3,
    "5-Item Exp Reparador": 1
  });
  assert.deepEqual(payload.metadata.stageCounts, {
    "CABW/CABE (retorno)": 70,
    "Reparador": 16,
    "Trânsito ao Reparador": 5,
    "Brasil / CTLA": 19,
    "Brasil/ OM Requisitante": 3
  });
});

test("todas as 113 linhas mantêm TTE válida e dados anteriores", () => {
  assert.equal(
    payload.records.filter(item => item.evaluationFee != null).length,
    113
  );
});

test("reimportação idêntica não duplica", () => {
  const current = new Map(payload.records.map(item => [item.id, item]));
  let unchanged = 0;
  payload.records.forEach(item => {
    if (importedDataEqual(current.get(item.id), item)) unchanged += 1;
  });
  assert.equal(unchanged, 113);
});

test("chave estável é determinística", async () => {
  const a = stableKeySource(
    "25T000026",
    "ELRR218044R",
    "G533947-1",
    "134"
  );
  const b = stableKeySource(
    " 25T000026 ",
    "ELRR218044R ",
    "G533947-1 ",
    " 134"
  );
  assert.equal(a, b);
  assert.equal(await sha256Hex(a), await sha256Hex(b));
});


test("retorno sem autorização ou sem prazo não é atrasado", () => {
  assert.equal(
    calculateReturnDeadline({
      serviceAuthorizationOrAsIsDate: null,
      repairDeliveryDays: null,
      dpeFinalDate: null,
      returnMaterialDate: null
    }, "2026-08-20").code,
    "not-authorized"
  );
});

test("retorno efetivo posterior à DPE é classificado como retornado com atraso", () => {
  const result = calculateReturnDeadline({
    serviceAuthorizationOrAsIsDate: "2025-01-01",
    repairDeliveryDays: 30,
    dpeFinalDate: "2025-01-31",
    returnMaterialDate: "2025-02-05"
  }, "2026-08-20");
  assert.equal(result.code, "returned-late");
  assert.equal(result.days, 5);
});

test("item sem retorno após a DPE está atrasado", () => {
  const result = calculateReturnDeadline({
    serviceAuthorizationOrAsIsDate: "2026-06-01",
    repairDeliveryDays: 30,
    dpeFinalDate: "2026-07-01",
    returnMaterialDate: null
  }, "2026-08-20");
  assert.equal(result.code, "overdue");
  assert.equal(result.days, -50);
});

test("retorno igual ou anterior à DPE é classificado no prazo", () => {
  assert.equal(
    calculateReturnDeadline({
      serviceAuthorizationOrAsIsDate: "2025-01-01",
      repairDeliveryDays: 30,
      dpeFinalDate: "2025-01-31",
      returnMaterialDate: "2025-01-25"
    }, "2026-08-20").code,
    "returned-on-time"
  );
});

test("base de retorno 20/08 aplica correções confirmadas", () => {
  assert.equal(payload.metadata.referenceDate, "2026-08-20");
  assert.equal(payload.metadata.returnStatusSourceFileName, "19AGO - CONTROLE REPARO - SGT ROZENDO.xlsx");
  const po160 = payload.records.find(item => item.po === "25T000160");
  assert.equal(po160.serviceAuthorizationOrAsIsDate, "2025-07-13");
  const po800 = payload.records.find(item => item.po === "26T000800" && item.sourceRow === 105);
  assert.equal(po800.dpeFinalDate, null);
  assert.equal(po800.returnDeadlineCodeAtImport, "not-authorized");
});

test("contagens de retorno correspondem à planilha atualizada", () => {
  assert.deepEqual(payload.metadata.returnDeadlineCounts, {
    "returned-on-time": 20,
    "returned-late": 50,
    "not-authorized": 33,
    "overdue": 7,
    "on-time": 3
  });
});


test("Parques e OMs são normalizados para as nomenclaturas institucionais", () => {
  assert.deepEqual(ORIGIN_OM_MAP, {
    EL: "PAME-RJ",
    GL: "PAMA-GL",
    PB: "PAMB-RJ",
    SP: "PAMA-SP"
  });
  assert.equal(normalizeOriginOm("EL").value, "PAME-RJ");
  assert.equal(normalizeOriginOm("GL").value, "PAMA-GL");
  assert.equal(normalizeOriginOm("PB").value, "PAMB-RJ");
  assert.equal(normalizeOriginOm("SP").value, "PAMA-SP");
  assert.equal(normalizeOriginOm("PAME RJ").value, "PAME-RJ");
  assert.equal(deriveOriginOm(null, "ELRR218044R").value, "PAME-RJ");
  assert.equal(deriveOriginOm(null, "GLRR000001").value, "PAMA-GL");
  assert.equal(deriveOriginOm(null, "PBRR000001").value, "PAMB-RJ");
  assert.equal(deriveOriginOm(null, "SPRR000001").value, "PAMA-SP");
});

test("base ativa não contém abreviações antigas no campo Parque / OM", () => {
  const allowed = new Set(["PAME-RJ", "PAMA-GL", "PAMB-RJ", "PAMA-SP"]);
  assert.equal(payload.records.every(item => allowed.has(item.originOm)), true);
  assert.deepEqual(payload.metadata.originOmCounts, {
    "PAME-RJ": 4,
    "PAMA-SP": 76,
    "PAMA-GL": 31,
    "PAMB-RJ": 2
  });
  assert.equal(payload.metadata.originOmChangesApplied, 113);
});


test("todos os dez Status Reais oficiais possuem Etapa Visual mapeada", () => {
  assert.equal(
    REAL_STATUS_OPTIONS.every(status => mapVisualStage(status) !== "ETAPA NÃO MAPEADA"),
    true
  );
});

test("painel separa retornos tardios de itens atrasados ainda sem retorno", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../governanca-reparaveis.html"),
    "utf8"
  );
  const panel = fs.readFileSync(
    path.join(__dirname, "../assets/js/repair-processes-panel.js"),
    "utf8"
  );
  assert.match(html, /id="repKpiReturnedLate"/);
  assert.match(html, /id="repKpiOverdue"/);
  assert.match(html, /Retornaram com atraso/);
  assert.match(html, /Atrasados — sem retorno/);
  assert.match(panel, /item\.deadline\.code === "returned-late"/);
  assert.match(panel, /item\.deadline\.code === "overdue"/);
});

test("metadados registram os dois grupos de atraso separadamente", () => {
  assert.deepEqual(payload.metadata.returnKpiCounts, {
    returnedLate: 50,
    overdueNotReturned: 7
  });
  assert.equal(payload.metadata.returnKpiSplitVersion, 2);
});


test("base ativa possui COTAÇÃO SISCAB e NUP para todos os itens", () => {
  assert.equal(payload.records.length, 113);
  assert.equal(payload.records.every(item => /^\d{6}$/.test(String(item.cotacaoSiscab || ""))), true);
  assert.equal(payload.records.every(item => /^67102\.\d{6}\/\d{4}-\d{2}$/.test(String(item.nup || ""))), true);
  assert.equal(new Set(payload.records.map(item => item.po)).size, 60);
});

test("correções confirmadas de COTAÇÃO SISCAB e NUP foram aplicadas", () => {
  const po910 = payload.records.find(item => item.po === "26T000910");
  const po915 = payload.records.find(item => item.po === "26T000915");
  assert.equal(po910.cotacaoSiscab, "260284");
  assert.equal(po910.nup, "67102.260284/2026-61");
  assert.equal(po915.cotacaoSiscab, "260285");
  assert.equal(po915.nup, "67102.260285/2026-14");
});

test("painel inclui filtros e PDF detalhado de COTAÇÃO SISCAB e NUP", () => {
  const html = fs.readFileSync(path.join(__dirname, "../governanca-reparaveis.html"), "utf8");
  const panel = fs.readFileSync(path.join(__dirname, "../assets/js/repair-processes-panel.js"), "utf8");
  assert.match(html, /id="repQuotationFilter"/);
  assert.match(html, /id="repNupFilter"/);
  assert.match(panel, /"COTAÇÃO SISCAB", "NUP"/);
  assert.match(panel, /record\.cotacaoSiscab/);
  assert.match(panel, /record\.nup/);
});
