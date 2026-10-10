/* Vercel edition: all company data stays in the current browser. */
(() => {
  const nativeFetch = window.fetch.bind(window);
  const KEY = 'greendb-vercel-v1';
  const fileUrls = new Map();
  const now = () => new Date().toISOString();
  const id = () => crypto.randomUUID().replaceAll('-', '');
  let catalogPromise;
  const catalog = () => catalogPromise ||= nativeFetch('/catalog.json').then(r => r.json());
  const defaults = () => ({profile:{id:1,name:'',industry:'',year:new Date().getFullYear(),answers:{},groups:[],separate_sites:true},sites:[],sources:[],records:[]});
  function load() { try { return {...defaults(),...JSON.parse(localStorage.getItem(KEY) || '{}')}; } catch { return defaults(); } }
  function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
  function reply(value, status=200, contentType='application/json') {
    return new Response(contentType==='application/json'?JSON.stringify(value):value,{status,headers:{'Content-Type':contentType}});
  }
  function error(message,status=400) { return reply({error:message},status); }
  function dbOpen() {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('greendb-files',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('files');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }
  async function fileStore(key,file) {
    const db=await dbOpen();
    return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,key);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}});
  }
  async function fileRead(key) {
    const db=await dbOpen();
    return new Promise((resolve,reject)=>{const tx=db.transaction('files','readonly');const request=tx.objectStore('files').get(key);request.onsuccess=()=>{db.close();resolve(request.result)};request.onerror=()=>{db.close();reject(request.error)}});
  }
  async function sourceUrl(sourceId) {
    if(fileUrls.has(sourceId))return fileUrls.get(sourceId);
    const file=await fileRead(sourceId);
    if(!file)return '';
    const url=URL.createObjectURL(file);fileUrls.set(sourceId,url);return url;
  }
  async function unzipXlsx(file) {
    const buffer=await file.arrayBuffer(), bytes=new Uint8Array(buffer), view=new DataView(buffer);
    let end=-1;
    for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(view.getUint32(p,true)===0x06054b50){end=p;break}
    if(end<0)throw Error('Excel 파일의 ZIP 구조를 읽지 못했습니다.');
    const count=view.getUint16(end+10,true), start=view.getUint32(end+16,true), entries=new Map();
    let at=start;
    for(let i=0;i<count;i++){
      if(view.getUint32(at,true)!==0x02014b50)break;
      const method=view.getUint16(at+10,true), size=view.getUint32(at+20,true);
      const nameLength=view.getUint16(at+28,true),extraLength=view.getUint16(at+30,true),commentLength=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
      const name=new TextDecoder().decode(bytes.slice(at+46,at+46+nameLength));
      entries.set(name,{method,size,local});at+=46+nameLength+extraLength+commentLength;
    }
    async function get(name){
      const entry=entries.get(name);if(!entry)return '';
      const p=entry.local, dataAt=p+30+view.getUint16(p+26,true)+view.getUint16(p+28,true);
      const chunk=bytes.slice(dataAt,dataAt+entry.size);
      if(entry.method===0)return new TextDecoder().decode(chunk);
      if(entry.method!==8)throw Error('지원하지 않는 Excel 압축 방식입니다.');
      const stream=new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    const xml=s=>new DOMParser().parseFromString(s,'text/xml');
    const sharedText=await get('xl/sharedStrings.xml');
    const shared=sharedText?[...xml(sharedText).getElementsByTagName('si')].map(n=>n.textContent):[];
    const output=[];
    for(const name of [...entries.keys()].filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort().slice(0,20)){
      const doc=xml(await get(name));
      for(const row of [...doc.getElementsByTagName('row')].slice(0,2000)){
        const cells=[...row.getElementsByTagName('c')].slice(0,80).map(c=>{
          const value=c.getElementsByTagName('v')[0]?.textContent||c.getElementsByTagName('is')[0]?.textContent||'';
          const shown=c.getAttribute('t')==='s'?shared[Number(value)]||'':value;
          return shown?`${c.getAttribute('r')||'?'}=${shown}`:'';
        });
        if(cells.some(Boolean))output.push(`[sheet ${name.split('/').at(-1).replace('.xml','')}, row ${row.getAttribute('r')}] ${cells.filter(Boolean).join(' | ')}`);
      }
    }
    return output.join('\n').slice(0,300000);
  }
  async function extract(file) {
    const suffix=file.name.split('.').pop().toLowerCase();
    if(['txt','csv'].includes(suffix)){
      const buffer=await file.arrayBuffer();let text=new TextDecoder('utf-8',{fatal:false}).decode(buffer);
      if(text.includes('�'))text=new TextDecoder('euc-kr').decode(buffer);
      return [text.slice(0,300000),'텍스트 추출'];
    }
    if(suffix==='xlsx')return [await unzipXlsx(file),'Excel 셀 추출'];
    if(suffix==='pdf'){
      try{
        const pdfjs=await import('/vendor/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';
        const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
        const lines=[];
        for(let i=1;i<=Math.min(pdf.numPages,30);i++){const page=await pdf.getPage(i);const content=await page.getTextContent();lines.push(`[page ${i}] ${content.items.map(x=>x.str).join(' ')}`)}
        return [lines.join('\n').slice(0,300000),'PDF 텍스트 추출'];
      }catch{return ['','PDF 텍스트 추출 불가 — 수동 입력']}
    }
    return ['','이미지 미리보기·수동 입력'];
  }
  function candidates(text,metrics) {
    const number=/(?<!\d)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\d)/g;
    const unit=/(tCO₂e|tCO2e|kgCO2e|kWh|MWh|GJ|TJ|Nm³|m³|m3|kg|톤|t|L|%|원|건)/i;
    const date=/(20\d{2})[.\-/년 ]+(0?[1-9]|1[0-2])(?:[.\-/월 ]+(0?[1-9]|[12]\d|3[01]))?/;
    const found=[];
    for(const [index,raw] of text.split(/\r?\n/).slice(0,2500).entries()){
      const line=raw.trim().slice(0,320);if(line.length<4)continue;
      const u=line.match(unit),values=[...line.matchAll(number)].map(x=>x[0]);
      if(!values.length||(!u&&!/사용량|배출량|발생량|취수량|투입량|재활용량/.test(line)))continue;
      const nonYear=values.filter(v=>!/^(20\d{2})$/.test(v));if(!nonYear.length)continue;
      const compact=line.toLowerCase().replaceAll(' ','');
      found.push({line:index+1,text:line,value:nonYear.at(-1).replaceAll(',',''),unit:u?.[0]||'',date:line.match(date)?.[0]||'',metricId:metrics.find(m=>compact.includes(m.name.toLowerCase().replaceAll(' ','')))?.id||''});
      if(found.length>=80)break;
    }
    return found;
  }
  function base64(buffer) {
    const bytes=new Uint8Array(buffer);let binary='';
    for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return btoa(binary);
  }
  async function analyzeWithGemini(file,sourceId,text,data,ref) {
    const context={analysis_id:id(),source_document:{source_id:sourceId,filename:file.name,media_type:file.type||'application/octet-stream'},analysis_context:{company_name:data.profile.name||null,industry:data.profile.industry||null,management_year:data.profile.year||null},active_metric_candidates:ref.metrics.filter(m=>data.profile.groups.includes(m.group)).map(m=>({id:m.id,group:m.group,name:m.name,unit:m.unit,sourceExample:m.sourceExample})),site_candidates:data.sites.map(s=>({id:s.id,name:s.name,kind:s.kind,scope:s.scope})),expected_schema:'greendb-extraction.schema_v4.json'};
    const suffix=file.name.split('.').pop().toLowerCase();
    const payload={context};
    if(['pdf','png','jpg','jpeg','webp'].includes(suffix)&&file.size<=3*1024*1024){
      payload.media_type=suffix==='pdf'?'application/pdf':suffix==='png'?'image/png':suffix==='webp'?'image/webp':'image/jpeg';
      payload.media_data=base64(await file.arrayBuffer());
    } else if(text.trim()) {
      payload.document_text=['csv','txt'].includes(suffix)?text.split(/\r?\n/).map((line,index)=>`[line ${index+1}] ${line}`).join('\n').slice(0,300000):text.slice(0,300000);
    } else throw Error('이 파일은 자동으로 읽을 수 없습니다. 3MB 이하의 PDF·이미지 또는 텍스트가 있는 파일을 사용해 주세요.');
    const response=await nativeFetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error([result.error,result.detail].filter(Boolean).join(' '));
    return result;
  }
  function csvExport(data) {
    const fields=['metric_name','group_id','site_name','period_start','period_end','value','unit','source_name','evidence','notes','verified_at'];
    const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
    const lines=[fields.map(quote).join(',')];
    for(const r of data.records){const row={...r,site_name:data.sites.find(s=>s.id===r.site_id)?.name||'',source_name:data.sources.find(s=>s.id===r.source_id)?.filename||''};lines.push(fields.map(f=>quote(row[f])).join(','))}
    return '\ufeff'+lines.join('\r\n');
  }
  window.GreenCloud={sourceUrl};
  window.fetch=async (input,options={})=>{
    const url=typeof input==='string'?input:input.url;
    if(!url.startsWith('/api/'))return nativeFetch(input,options);
    try{
      const path=url.split('?')[0],method=(options.method||'GET').toUpperCase(),data=load(),ref=await catalog();
      if(method==='GET'){
        if(path==='/api/state')return reply({...data,...ref});
        if(path==='/api/export.csv')return reply(csvExport(data),200,'text/csv; charset=utf-8');
        if(path==='/api/backup.json')return reply(JSON.stringify({...data,...ref},null,2),200,'application/json-download');
      }
      if(path==='/api/upload'){
        const file=options.body?.get('file');if(!file)return error('파일을 선택해 주세요.');
        if(file.size>20*1024*1024)return error('파일은 20MB 이하만 업로드할 수 있습니다.');
        if(!/\.(pdf|xlsx|csv|txt|png|jpe?g|webp)$/i.test(file.name))return error('지원하지 않는 파일 형식입니다.');
        const sourceId=id();await fileStore(sourceId,file);fileUrls.set(sourceId,URL.createObjectURL(file));
        let text='',methodName='수동 입력';try{[text,methodName]=await extract(file)}catch(e){methodName=`추출 실패 — 수동 입력 (${e.message})`}
        data.sources.unshift({id:sourceId,filename:file.name,type:file.type||'application/octet-stream',uploaded_at:now(),extraction_method:methodName});save(data);
        try {
          const result=await analyzeWithGemini(file,sourceId,text,data,ref);
          data.sources[0].extraction_method=result.method;save(data);
          return reply({id:sourceId,filename:file.name,method:result.method,analysis:result.analysis,candidates:[],excerpt:text.slice(0,8000)});
        } catch(error) {
          data.sources[0].extraction_method='Gemini 분석 실패';save(data);
          return reply({id:sourceId,filename:file.name,method:'Gemini 분석 실패',analysisError:error.message,candidates:[],excerpt:text.slice(0,8000)});
        }
      }
      const body=JSON.parse(options.body||'{}');
      if(path==='/api/profile'){
        if(!body.name?.trim())return error('기업명을 입력해 주세요.');
        data.profile={...data.profile,...body};save(data);return reply({ok:true});
      }
      if(path==='/api/sites'){
        if(!body.name?.trim())return error('사업장 이름을 입력해 주세요.');
        const siteId=id();data.sites.push({id:siteId,name:body.name.trim(),kind:body.kind||'사업장',scope:body.scope||'',created_at:now()});save(data);return reply({id:siteId});
      }
      if(path==='/api/sites/delete'){
        if(data.records.some(r=>r.site_id===body.id))return error('기록이 있는 사업장은 삭제할 수 없습니다.');
        data.sites=data.sites.filter(s=>s.id!==body.id);save(data);return reply({ok:true});
      }
      if(path==='/api/records'){
        const metric=ref.metrics.find(m=>m.id===body.metric_id),group=metric?.group||body.group_id,name=metric?.name||body.metric_name?.trim();
        if(!name||!ref.groups.some(g=>g.id===group))return error('데이터 항목과 영역을 확인해 주세요.');
        if(!data.sites.some(s=>s.id===body.site_id))return error('사업장을 선택해 주세요.');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(body.period_start)||!/^\d{4}-\d{2}-\d{2}$/.test(body.period_end)||body.period_start>body.period_end)return error('기간을 확인해 주세요.');
        if(!Number.isFinite(Number(body.value))||!body.unit?.trim())return error('값과 단위를 확인해 주세요.');
        const recordId=id();data.records.unshift({id:recordId,metric_id:body.metric_id,metric_name:name,group_id:group,site_id:body.site_id,period_start:body.period_start,period_end:body.period_end,value:Number(body.value),unit:body.unit,source_id:body.source_id||null,evidence:body.evidence||'',notes:body.notes||'',verified_at:now()});save(data);return reply({id:recordId});
      }
      if(path==='/api/records/delete'){
        data.records=data.records.filter(r=>r.id!==body.id);save(data);return reply({ok:true});
      }
      return error('API를 찾을 수 없습니다.',404);
    }catch(e){return error(e.message||String(e),500)}
  };
})();
