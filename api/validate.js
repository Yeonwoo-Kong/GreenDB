const schema = require('../extraction/greendb-extraction.schema_v4.json');

function validate(value, rule = schema, path = '$', errors = []) {
  if (rule.$ref) {
    const target = rule.$ref.split('/').slice(1).reduce((part, key) => part?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], schema);
    if (!target) errors.push(`${path}: unknown reference`);
    else validate(value, target, path, errors);
    return errors;
  }
  const types = rule.type ? (Array.isArray(rule.type) ? rule.type : [rule.type]) : [];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (types.length && !types.some(type => type === actual || (type === 'number' && actual === 'integer'))) {
    errors.push(`${path}: expected ${types.join('|')}`);
    return errors;
  }
  if (Object.hasOwn(rule, 'const') && value !== rule.const) errors.push(`${path}: const`);
  if (rule.enum && !rule.enum.includes(value)) errors.push(`${path}: enum`);
  if (typeof value === 'string') {
    if (rule.minLength != null && value.length < rule.minLength) errors.push(`${path}: minLength`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(`${path}: pattern`);
    if (rule.format === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) errors.push(`${path}: date`);
  }
  if (typeof value === 'number') {
    if (rule.minimum != null && value < rule.minimum) errors.push(`${path}: minimum`);
    if (rule.maximum != null && value > rule.maximum) errors.push(`${path}: maximum`);
  }
  if (Array.isArray(value)) {
    if (rule.minItems != null && value.length < rule.minItems) errors.push(`${path}: minItems`);
    if (rule.maxItems != null && value.length > rule.maxItems) errors.push(`${path}: maxItems`);
    if (rule.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) errors.push(`${path}: uniqueItems`);
    value.forEach((item, index) => validate(item, rule.items || {}, `${path}[${index}]`, errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of rule.required || []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required`);
    for (const [key, item] of Object.entries(value)) {
      if (rule.properties?.[key]) validate(item, rule.properties[key], `${path}.${key}`, errors);
      else if (rule.additionalProperties === false) errors.push(`${path}.${key}: unexpected`);
    }
  }
  return errors;
}

function validateAnalysis(result, context) {
  const errors = validate(result);
  if (result?.analysis_id !== context.analysis_id) errors.push('$.analysis_id: mismatch');
  if (result?.source_document?.source_id !== context.source_document.source_id || result?.source_document?.filename !== context.source_document.filename) errors.push('$.source_document: mismatch');
  const metricIds = new Set(context.active_metric_candidates.map(item => item.id));
  const siteIds = new Set(context.site_candidates.map(item => item.id));
  for (const [index, extraction] of (result?.extractions || []).entries()) {
    const path = `$.extractions[${index}]`;
    if (!metricIds.has(extraction.metric_match?.selected_metric_id) && extraction.metric_match?.selected_metric_id != null) errors.push(`${path}: unknown metric`);
    if ((extraction.metric_match?.candidate_metric_ids || []).some(id => !metricIds.has(id))) errors.push(`${path}: unknown metric candidate`);
    if (!siteIds.has(extraction.scope?.selected_site_id) && extraction.scope?.selected_site_id != null) errors.push(`${path}: unknown site`);
    if ((extraction.scope?.candidate_site_ids || []).some(id => !siteIds.has(id))) errors.push(`${path}: unknown site candidate`);
    const evidenceIds = new Set((extraction.evidence || []).map(item => item.evidence_id));
    for (const part of ['field_value', 'period', 'scope']) {
      if ((extraction[part]?.evidence_ids || []).some(id => !evidenceIds.has(id))) errors.push(`${path}.${part}: unknown evidence`);
    }
    if (extraction.field_value?.status === 'EXTRACTED' && !extraction.field_value.evidence_ids?.length) errors.push(`${path}: value lacks evidence`);
  }
  return errors;
}

module.exports = { validateAnalysis };
