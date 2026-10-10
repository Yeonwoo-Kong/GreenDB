const prompt = require('./prompt.json');
const schema = require('../extraction/greendb-extraction.schema_v4.json');
const { validateAnalysis } = require('./validate');

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'POST 요청만 지원합니다.'});
  const key = process.env.Gemini_API_Key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return res.status(503).json({error:'Gemini API 키가 Vercel Production 환경에 설정되지 않았습니다.'});
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const context = body?.context;
    if (!context || typeof context.analysis_id !== 'string' || !context.source_document?.filename ||
        !Array.isArray(context.active_metric_candidates) || !Array.isArray(context.site_candidates)) {
      return res.status(400).json({error:'분석 문맥이 올바르지 않습니다.'});
    }
    if (context.active_metric_candidates.length > 200 || context.site_candidates.length > 200) {
      return res.status(400).json({error:'분석 후보가 너무 많습니다.'});
    }
    const parts = [{text: `${prompt}\n\n입력 JSON:\n${JSON.stringify(context)}\n\n아래 JSON Schema에 정확히 맞는 결과만 출력하세요:\n${JSON.stringify(schema)}`}];
    if (body.media_data) {
      if (!ALLOWED_MEDIA.has(body.media_type) || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.media_data) || body.media_data.length > Math.ceil(MAX_BYTES * 4 / 3) + 4) {
        return res.status(413).json({error:'Gemini에 전달할 PDF·이미지는 3MB 이하이어야 합니다.'});
      }
      parts.push({inline_data:{mime_type:body.media_type,data:body.media_data}});
    } else if (typeof body.document_text === 'string' && body.document_text.trim()) {
      if (body.document_text.length > 300000) return res.status(413).json({error:'추출 텍스트가 너무 깁니다.'});
      parts.push({text:`원천자료의 추출 텍스트 (위치 표지를 보존하세요):\n${body.document_text}`});
    } else {
      return res.status(400).json({error:'분석할 파일 내용이 없습니다.'});
    }
    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) return res.status(500).json({error:'Gemini 모델 설정이 올바르지 않습니다.'});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method:'POST', signal:controller.signal,
        headers:{'Content-Type':'application/json','x-goog-api-key':key},
        body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',temperature:0,maxOutputTokens:16384}})
      });
    } finally { clearTimeout(timer); }
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const reason = response.status === 429 ? 'Gemini 사용량 한도에 도달했습니다.' :
        response.status === 400 ? 'Gemini 요청 형식 또는 모델 설정을 확인해 주세요.' :
        response.status === 403 ? 'Gemini API 키의 권한을 확인해 주세요.' : 'Gemini 분석 요청이 실패했습니다.';
      return res.status(502).json({error:reason,detail:String(failure.error?.message || '').slice(0,500)});
    }
    const generated = await response.json();
    const output = (generated.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('');
    if (!output) return res.status(502).json({error:'Gemini가 분석 결과를 반환하지 않았습니다.'});
    let analysis;
    try { analysis = JSON.parse(output); }
    catch { return res.status(502).json({error:'Gemini의 결과를 JSON으로 읽지 못했습니다. 다시 시도해 주세요.'}); }
    const errors = validateAnalysis(analysis, context);
    if (errors.length) return res.status(502).json({error:'Gemini 결과가 첨부된 추출 규칙을 충족하지 못했습니다. 다시 시도해 주세요.',detail:errors.slice(0,8).join('; ')});
    return res.status(200).json({analysis,method:`Gemini ${model}`});
  } catch (error) {
    return res.status(500).json({error:error.name === 'AbortError' ? 'Gemini 응답 시간이 초과되었습니다.' : '분석 요청을 처리하지 못했습니다.'});
  }
};
