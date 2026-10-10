const test = require('node:test');
const assert = require('node:assert/strict');
const {validateAnalysis} = require('../api/validate');
const handler = require('../api/extract');

const context = {
  analysis_id:'analysis-1',
  source_document:{source_id:'source-1',filename:'sample.txt',media_type:'text/plain'},
  analysis_context:{company_name:null,industry:null,management_year:null},
  active_metric_candidates:[],site_candidates:[],expected_schema:'greendb-extraction.schema_v4.json'
};
const empty = {schema_version:'2.0',analysis_id:context.analysis_id,source_document:context.source_document,extractions:[],warnings:['NO_RELEVANT_DATA_FOUND']};

test('attached schema accepts empty evidence result and rejects fabricated ids', () => {
  assert.deepEqual(validateAnalysis(empty,context),[]);
  assert.ok(validateAnalysis({...empty,analysis_id:'wrong'},context).length);
  assert.ok(validateAnalysis({...empty,unexpected:true},context).length);
});

test('server route sends the document to Gemini and returns only a validated draft', async () => {
  const oldFetch=global.fetch,oldKey=process.env.Gemini_API_Key;
  process.env.Gemini_API_Key='test-key';
  let upstream;
  global.fetch=async (url,options)=>{upstream={url,options};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(empty)}]}}]})}};
  const response={headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};
  try {
    await handler({method:'POST',body:{context,document_text:'[line 1] hello'}},response);
    assert.equal(response.code,200);
    assert.deepEqual(response.value.analysis,empty);
    assert.match(upstream.url,/models\/gemini-3.8-flash:generateContent/);
    assert.equal(upstream.options.headers['x-goog-api-key'],'test-key');
    assert.match(upstream.options.body,/\[line 1\] hello/);
  } finally {global.fetch=oldFetch;if(oldKey===undefined)delete process.env.Gemini_API_Key;else process.env.Gemini_API_Key=oldKey;}
});
