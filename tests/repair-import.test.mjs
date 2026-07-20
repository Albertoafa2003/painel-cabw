import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeNullable, normalizeIdentifier, normalizeEvaluationFee, calculateTdrStatus,
  mapVisualStage, stableKeySource, sha256Hex, importedDataEqual, addDaysIso
} from '../assets/js/repair-import-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '../assets/data/repair-processes-current.json');
const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

test('normalização elimina espaços e valores nulos textuais', () => {
  assert.equal(normalizeNullable('  ABC  '), 'ABC');
  assert.equal(normalizeNullable('none'), null);
  assert.equal(normalizeNullable(' N/A '), null);
});

test('identificadores preservam zeros e caracteres', () => {
  assert.equal(normalizeIdentifier(' 001-AB '), '001-AB');
  assert.equal(stableKeySource(' 01T0001 ', 'REQ01', '000PN', '000SN'), '01T0001|REQ01|000PN|000SN');
});

test('TTE calculada por LEFT é descartada e taxa real é mantida', () => {
  assert.deepEqual(normalizeEvaluationFee({ po: '24T001234', rawValue: '24', formula: 'LEFT(A2,2)' }), { value: null, raw: '24', discardedReason: 'formula-year' });
  assert.deepEqual(normalizeEvaluationFee({ po: '24T001234', rawValue: '24', formula: '' }), { value: null, raw: '24', discardedReason: 'year-like' });
  assert.deepEqual(normalizeEvaluationFee({ po: '24T001234', rawValue: '1975', formula: '' }), { value: 1975, raw: '1975', discardedReason: null });
});

test('prazo do TDR usa 45 dias corridos', () => {
  assert.equal(addDaysIso('2024-02-05', 45), '2024-03-21');
  const result = calculateTdrStatus('2024-02-05', '2024-08-13', '2026-07-20');
  assert.equal(result.dueDate, '2024-03-21');
  assert.equal(result.code, 'sent-late');
  assert.equal(result.days, 145);
});

test('status real é mapeado sem alterar o valor de origem', () => {
  assert.equal(mapVisualStage('7-Rep Recebido'), 'Oficina reparadora');
  assert.equal(mapVisualStage('STATUS NOVO'), 'Etapa não mapeada');
});

test('chave estável produz o mesmo identificador para reimportação', async () => {
  const keyA = stableKeySource('24T000086', 'LSQR29010SS', '3431323', 'A2396');
  const keyB = stableKeySource(' 24T000086 ', 'LSQR29010SS ', '3431323 ', ' A2396');
  assert.equal(keyA, keyB);
  assert.equal(await sha256Hex(keyA), await sha256Hex(keyB));
});

test('base atual possui 274 registros válidos e sem duplicidade', () => {
  assert.equal(payload.metadata.validRows, 274);
  assert.equal(payload.records.length, 274);
  assert.equal(new Set(payload.records.map(item => item.id)).size, 274);
  assert.equal(payload.rejectedRows.length, 0);
});

test('segunda importação idêntica é classificada sem alteração', () => {
  const existing = new Map(payload.records.map(item => [item.id, item]));
  let newCount = 0, changedCount = 0, unchangedCount = 0;
  payload.records.forEach(item => {
    const current = existing.get(item.id);
    if (!current) newCount += 1;
    else if (importedDataEqual(current, item)) unchangedCount += 1;
    else changedCount += 1;
  });
  assert.deepEqual({ newCount, changedCount, unchangedCount }, { newCount: 0, changedCount: 0, unchangedCount: 274 });
});
