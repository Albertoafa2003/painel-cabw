import fs from 'node:fs';
import assert from 'node:assert/strict';

const json = JSON.parse(fs.readFileSync(new URL('../assets/data/contracts-11092026.json', import.meta.url), 'utf8'));
const records = Array.isArray(json) ? json : json.records;
const target = records.filter(r => r.numero === '001/CABW-PAMASP/2025');
assert.equal(target.length, 1, 'Contrato deve existir exatamente uma vez');
assert.equal(target[0].ordenadorDespesas, 'PAMASP', 'Ordenador deve ser PAMASP');
assert.equal(new Set(records.map(r => r.numero)).size, records.length, 'Não deve haver número de contrato duplicado');
assert.equal(records.length, 137, 'Quantidade de contratos deve permanecer 137');
const correction = (target[0].fieldCorrections || []).find(x => x.field === 'ordenadorDespesas');
assert.ok(correction, 'Correção deve ser auditável');
assert.equal(correction.before, 'CABW');
assert.equal(correction.after, 'PAMASP');
console.log('contracts-field-correction-18092026: ok');
