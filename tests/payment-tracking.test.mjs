import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStatus,
  stageForStatus,
  normalizeCurrency,
  parseFlexibleNumber,
  parseDateToIso,
  classifyPaymentDeadline,
  buildHeaderMap,
  normalizeImportedPayment,
  stablePaymentKeySource,
  sha256Hex,
  importedPaymentEqual,
  aggregateByCurrency,
  formatMoney
} from "../assets/js/payment-tracking-core.js";

test("normaliza variações de status", () => {
  assert.equal(normalizeStatus("Pagamento efetuado"), "Pago");
  assert.equal(normalizeStatus("aguardando liquidacao"), "Aguardando liquidação");
  assert.equal(normalizeStatus("pendência documental"), "Pendência documental");
});

test("correlaciona status com etapa gerencial", () => {
  assert.equal(stageForStatus("Fatura recebida"), "Documentação");
  assert.equal(stageForStatus("Pagamento programado"), "Programação financeira");
  assert.equal(stageForStatus("Pago"), "Pagamento");
});

test("normaliza moedas usuais", () => {
  assert.equal(normalizeCurrency("US$"), "USD");
  assert.equal(normalizeCurrency("R$"), "BRL");
  assert.equal(normalizeCurrency("euro"), "EUR");
});

test("interpreta números em padrões brasileiro e internacional", () => {
  assert.equal(parseFlexibleNumber("US$ 1.234,56"), 1234.56);
  assert.equal(parseFlexibleNumber("1,234.56"), 1234.56);
  assert.equal(parseFlexibleNumber(42.5), 42.5);
});

test("interpreta datas em formatos comuns", () => {
  assert.equal(parseDateToIso("31/08/2026"), "2026-08-31");
  assert.equal(parseDateToIso("2026-09-01"), "2026-09-01");
  assert.equal(parseDateToIso("none"), null);
});

test("classifica pagamento vencido e não pago", () => {
  const result = classifyPaymentDeadline({ dueDate: "2026-08-20", status: "Aguardando liquidação" }, "2026-09-01");
  assert.equal(result.code, "overdue");
  assert.equal(result.days, -12);
});

test("classifica pagamentos realizados no prazo e com atraso", () => {
  assert.equal(classifyPaymentDeadline({ dueDate: "2026-08-20", paidDate: "2026-08-19", status: "Pago" }, "2026-09-01").code, "paid-on-time");
  assert.equal(classifyPaymentDeadline({ dueDate: "2026-08-20", paidDate: "2026-08-23", status: "Pago" }, "2026-09-01").code, "paid-late");
});

test("não classifica registro sem vencimento como atraso", () => {
  assert.equal(classifyPaymentDeadline({ dueDate: null, status: "Aguardando atesto" }, "2026-09-01").code, "no-due-date");
});

test("identifica cabeçalhos equivalentes", () => {
  const map = buildHeaderMap(["Empresa", "Processo", "Invoice", "Valor a Pagar", "Vencimento", "Situação"]);
  assert.equal(map.supplier, 0);
  assert.equal(map.nup, 1);
  assert.equal(map.invoiceNumber, 2);
  assert.equal(map.netAmount, 3);
  assert.equal(map.dueDate, 4);
  assert.equal(map.status, 5);
});

test("normaliza linha importada e calcula valor líquido", async () => {
  const headers = ["Fornecedor", "NUP", "Fatura", "Moeda", "Valor Bruto", "Retenções", "Status", "Vencimento"];
  const map = buildHeaderMap(headers);
  const result = await normalizeImportedPayment(
    ["Example Supplier", "67102.000001/2026-00", "INV-1", "USD", "1000,00", "50,00", "Em liquidação", "15/09/2026"],
    map,
    { fileName: "teste.xlsx", sheetName: "Pagamentos", sourceRow: 2, referenceDate: "2026-09-01" }
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.payment.netAmount, 950);
  assert.equal(result.payment.status, "Aguardando liquidação");
  assert.equal(result.payment.stage, "Liquidação");
  assert.equal(result.payment.dueDate, "2026-09-15");
});

test("gera chave e hash determinísticos", async () => {
  const record = { supplier: "A", nup: "NUP-1", invoiceNumber: "INV-1", dueDate: "2026-09-10", netAmount: 10 };
  const source = stablePaymentKeySource(record);
  assert.equal(source, stablePaymentKeySource({ ...record }));
  assert.equal(await sha256Hex(source), await sha256Hex(source));
});

test("compara campos importados e consolida por moeda", () => {
  const a = { supplier: "A", status: "Pago", stage: "Pagamento", netAmount: 10, currency: "USD" };
  const b = { ...a };
  assert.equal(importedPaymentEqual(a, b), true);
  assert.deepEqual(aggregateByCurrency([a, { ...a, netAmount: 5 }, { ...a, currency: "EUR", netAmount: 8 }]), [
    { currency: "EUR", value: 8 },
    { currency: "USD", value: 15 }
  ]);
});


test("não apresenta valor ausente como zero", () => {
  assert.equal(formatMoney(null, "USD"), "Não informado");
});
