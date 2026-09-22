/** Gerencial: valor patrimonial não é custo do reparo nem valor de dano apurado. */
export const VALUE_FIELDS = Object.freeze(['patrimonialValueUsd','patrimonialCurrency','patrimonialSourceFile','patrimonialSourceSheet','patrimonialSourceRow','patrimonialReferenceDate','patrimonialValueField']);
export const THRESHOLD_BRL = 120000;
export function itemValuation(record) {
  if (Object.prototype.hasOwnProperty.call(record, 'patrimonialValueUsd')) {
    const raw = record.patrimonialValueUsd;
    return { value: typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null,
      currency: 'USD', source: record.patrimonialSourceFile || '', row: record.patrimonialSourceRow || null };
  }
  const raw = record.itemValue;
  return { value: typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null,
    currency: record.itemValueCurrency || record.currency || null, source: 'Complemento cadastral', row: null };
}
export function mergeValuation(primary, bundled) {
  const result = { ...primary };
  if (!bundled || !Object.prototype.hasOwnProperty.call(bundled,'patrimonialValueUsd')) return result;
  if (!Object.prototype.hasOwnProperty.call(primary,'patrimonialValueUsd') ||
      String(primary.patrimonialReferenceDate || '') < String(bundled.patrimonialReferenceDate || '')) {
    VALUE_FIELDS.forEach(field => { if (bundled[field] !== undefined) result[field] = bundled[field]; });
  }
  return result;
}
export function brlValue(valueUsd, rate) {
  if (typeof valueUsd !== 'number' || !Number.isFinite(valueUsd) || valueUsd <= 0 || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(Math.round(valueUsd * 100) * Math.round(rate * 10000) / 10000) / 100;
}
export function assessValue(record, fx) {
  const valuation = itemValuation(record);
  const brl = valuation.currency === 'USD' ? brlValue(valuation.value,fx?.rate) : null;
  const classification = valuation.value === null ? 'unknown' : brl === null ? 'unconverted' : brl >= THRESHOLD_BRL ? 'alert' : 'below';
  return { ...record, valuation, valueBrl: brl, classification };
}
export const CLASS_LABELS = Object.freeze({
  alert: 'No patamar de referência para TCE',
  below: 'Abaixo do patamar de referência',
  unknown: 'Valor não informado — não classificável',
  unconverted: 'Conversão indisponível — não classificável'
});
export function sortValue(records, order='desc') {
  return [...records].sort((a,b) => {
    if (a.valuation.value === null && b.valuation.value === null) return String(a.po).localeCompare(String(b.po));
    if (a.valuation.value === null) return 1;
    if (b.valuation.value === null) return -1;
    return (order==='asc'?1:-1)*(a.valuation.value-b.valuation.value) || String(a.po).localeCompare(String(b.po)) || String(a.requisition).localeCompare(String(b.requisition));
  });
}
export function summarizeValues(records) {
  const out = { count:records.length, pos:new Set(records.map(r=>r.po)).size, known:0, unknown:0, alert:0, below:0, unconverted:0, sumUsd:0, sumBrl:0, maximumUsd:null };
  let usdCents=0, brlCents=0;
  for (const r of records) {
    out[r.classification]++;
    if (r.valuation.value !== null) out.known++;
    if (r.valuation.value !== null && r.valuation.currency === 'USD') {
      usdCents+=Math.round(r.valuation.value*100);
      out.maximumUsd=Math.max(out.maximumUsd||0,r.valuation.value);
    }
    if (r.valueBrl !== null) brlCents+=Math.round(r.valueBrl*100);
  }
  out.sumUsd=usdCents/100;out.sumBrl=brlCents/100;return out;
}
export function normalizedSearch(v) { return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
export function safeCsv(value) {
  let v=String(value??''); if (/^[\s]*[=+\-@]/.test(v)) v="'"+v;
  return '"'+v.replace(/"/g,'""')+'"';
}
