const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n) => new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 3}).format(n);
const yearNow = new Date().getFullYear();
let state, page = 'overview', draft, uploadResults = [], uploadResultIndex = 0, uploadFiles = [], uploadDrafts = [], uploadProcessing = false, recordFilter = {group:'', site:'', year:'', query:''}, insightMode = 'year', insightSelectedYear = '', insightSelectedMonth = '', insightMonthViewYear = '';
const uploadReviewStorageKey = 'greendb-upload-review-v1';
try {
  const savedReview = JSON.parse(sessionStorage.getItem(uploadReviewStorageKey) || 'null');
  if (Array.isArray(savedReview?.results)) uploadResults = savedReview.results;
  if (Array.isArray(savedReview?.drafts)) uploadDrafts = savedReview.drafts;
} catch {}
function persistUploadReview() {
  try { sessionStorage.setItem(uploadReviewStorageKey, JSON.stringify({results:uploadResults,drafts:uploadDrafts})); } catch {}
}

async function api(path, options={}) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
}
async function post(path, body) { return api(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}); }
async function refresh() { state = await api('/api/state'); $('#side-company').textContent = state.profile.name || '우리 회사'; render(); }
function toast(message) { const el=$('#toast'); el.textContent=message; el.style.display='block'; clearTimeout(el._timer); el._timer=setTimeout(()=>el.style.display='none',3500); }
function showError(error) { toast(error.message || String(error)); }
function navigate(to) { location.hash=to; }
function groupName(id) { return state.groups.find(g=>g.id===id)?.name || id; }
function siteName(id) { return state.sites.find(s=>s.id===id)?.name || '—'; }
function sourceName(id) { return state.sources.find(s=>s.id===id)?.filename || '직접 입력'; }
function selectedMetrics() { return state.metrics.filter(m=>state.profile.groups.includes(m.group)); }
function stage() { if(!state.profile.name) return 0; if(!state.sites.length) return 1; if(!state.records.length) return 2; return 3; }
function head(label,title,description,actions='') { return `<div class="hero"><div><div class="eyebrow">${label}</div><h1>${title}</h1><p>${description}</p></div><div class="hero-actions">${actions}</div></div>`; }
function empty(title,body,button='') { return `<div class="empty"><div class="empty-art">◇</div><strong>${title}</strong><p>${body}</p>${button}</div>`; }
function workflowNextMarkup(currentPage) {
  const steps={
    setup:{number:'02',next:'upload',label:'자료 업로드',title:'설정이 끝났다면, 자료를 올려보세요',description:'고지서와 관리 자료를 확인해 환경 데이터를 기록할 준비를 합니다.',button:'자료 업로드로 이동'},
    upload:{number:'03',next:'records',label:'데이터 기록',title:'자료를 확인했다면, 기록으로 남겨보세요',description:'확인한 값에 사업장과 기간을 지정해 데이터로 저장합니다.',button:'데이터 기록으로 이동'},
    records:{number:'04',next:'insights',label:'현황·활용',title:'쌓인 기록과 다음 할 일을 살펴보세요',description:'누락된 항목과 연도별 기록을 확인하고 필요한 자료를 내보냅니다.',button:'현황·활용 보기'}
  }[currentPage];
  if(!steps) return '';
  return `<section class="workflow-next" data-go="${steps.next}" role="button" tabindex="0" aria-label="${steps.button}"><div class="workflow-next-inner"><div class="workflow-next-copy"><span class="workflow-next-label">NEXT STEP　${steps.number} · ${steps.label}</span><h2>${steps.title}</h2><p>${steps.description}</p></div><div class="workflow-next-action"><span class="btn workflow-next-button">${steps.button}<span aria-hidden="true"> →</span></span></div></div></section>`;
}

function render() {
  page = (location.hash.replace('#','') || 'overview');
  if (!['overview','setup','upload','records','insights'].includes(page)) page='overview';
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===page));
  const title={overview:'대시보드',setup:'시작하기',upload:'자료 업로드',records:'데이터 기록',insights:'현황·활용'}[page];
  $('#crumb').innerHTML=`워크스페이스 <span>/</span> <strong>${title}</strong>`;
  $('#app').innerHTML={overview:renderOverview,setup:renderSetup,upload:renderUpload,records:renderRecords,insights:renderInsights}[page]();
  bindPage();
}

function renderOverview() {
  const p=state.profile, metrics=selectedMetrics(), covered=new Set(state.records.map(r=>r.metric_id));
  const coveredCount=metrics.filter(m=>covered.has(m.id)).length;
  const percent=metrics.length ? Math.round(coveredCount/metrics.length*100):0;
  const latest=state.records.slice(0,5);
  const next=stage()===0?['기업 정보를 입력해 시작하세요','setup']:stage()===1?['첫 사업장을 등록하세요','setup']:stage()===2?['가지고 있는 자료를 올려보세요','upload']:['새 자료를 추가하고 기록을 이어가세요','upload'];
  return head('OVERVIEW',`${esc(p.name || '우리 회사')}의 환경 데이터`,`흩어진 업무자료를 모아, 관리할 수 있는 환경 데이터로 바꿔보세요.`,`<button class="btn" data-go="setup">관리 범위 설정</button><button class="btn primary" data-go="upload">＋ 자료 업로드</button>`)
    +`<div class="grid grid-4"><div class="card stat-card highlight"><div class="stat-top">관리 항목 <span class="stat-symbol">✳</span></div><div class="stat-value">${metrics.length}<small style="font-size:13px">개</small></div><div class="stat-foot">선택한 환경영역의 기본 데이터</div></div><div class="card stat-card"><div class="stat-top">확인된 기록 <span class="stat-symbol">▤</span></div><div class="stat-value">${state.records.length}<small style="font-size:13px">건</small></div><div class="stat-foot">사용자 검토 후 저장</div></div><div class="card stat-card"><div class="stat-top">원천자료 <span class="stat-symbol">⇧</span></div><div class="stat-value">${state.sources.length}<small style="font-size:13px">개</small></div><div class="stat-foot">원본 파일과 함께 보관</div></div><div class="card stat-card"><div class="stat-top">사업장 <span class="stat-symbol">⌂</span></div><div class="stat-value">${state.sites.length}<small style="font-size:13px">곳</small></div><div class="stat-foot">사업장별 범위 관리</div></div></div>`
    +`<div class="grid grid-2"><div class="card progress-card" style="margin-top:16px"><div class="progress-card-top"><div><h3>데이터 준비 현황</h3><p>선택한 관리 항목 중 기록이 있는 항목</p></div><span class="pill">${percent}% 준비</span></div><div class="progress-track"><span style="width:${percent}%"></span></div><div class="progress-meta"><span>기록된 항목 ${coveredCount}개</span><span>전체 ${metrics.length}개</span></div></div><div class="card next-card" style="margin-top:16px"><div><div class="eyebrow">NEXT STEP</div><h3>${next[0]}</h3><p>한 번에 모두 채우지 않아도 됩니다. 확인 가능한 자료부터 시작해 보세요.</p></div><button class="btn" data-go="${next[1]}">계속하기 →</button></div></div>`
    +`<div class="section-head"><h2>관리 영역</h2><button class="small-link" data-go="setup">항목 설정 →</button></div><div class="group-grid">${state.groups.filter(g=>p.groups.includes(g.id)).map(g=>`<div class="card group-card" data-go="records"><div class="group-head"><div class="group-icon">${g.icon}</div><span class="group-count">${state.records.filter(r=>r.group_id===g.id).length}건 기록</span></div><h3>${g.name}</h3><p>${g.hint}</p></div>`).join('') || `<div class="card" style="grid-column:1/-1">${empty('관리 영역을 선택해 주세요','기업활동 질문에 답하면 필요한 환경영역을 추천합니다.','<button class="btn primary" data-go="setup">시작하기</button>')}</div>`}</div>`
    +`<div class="section-head"><h2>최근 확인한 데이터</h2><button class="small-link" data-go="records">전체 보기 →</button></div><div class="card table-wrap">${latest.length?`<table class="recent-table"><thead><tr><th>데이터 항목</th><th>사업장</th><th>기간</th><th>값</th><th>증빙</th></tr></thead><tbody>${latest.map(r=>`<tr><td class="metric-name">${esc(r.metric_name)}</td><td>${esc(siteName(r.site_id))}</td><td>${esc(r.period_start)} ~ ${esc(r.period_end)}</td><td><strong>${fmt(r.value)}</strong> ${esc(r.unit)}</td><td><span class="pill ${r.source_id?'':'amber'}">${r.source_id?'파일 연결':'직접 입력'}</span></td></tr>`).join('')}</tbody></table>`:empty('아직 저장된 기록이 없습니다','첫 자료를 업로드하거나 값을 직접 입력해 주세요.')}</div>`;
}

function recommendation(answers) { return state.groups.filter(g=>g.questions.some(q=>answers[q])).map(g=>g.id); }
function renderSetup() {
  if(!draft) draft=structuredClone(state.profile);
  const rec=recommendation(draft.answers || {});
  return head('SETUP','우리 회사에 맞게 시작하기','기업의 실제 활동을 선택하고 사업장과 관리 범위를 설정하세요.')
   +`<button class="btn primary" id="save-profile">설정 저장</button><div class="setup-steps"><span class="done">01 기업 정보</span><span class="done">02 관리할 환경영역</span><span class="done">03 사업장과 범위</span></div>`
   +`<div class="card panel"><div class="panel-head"><h2>01. 기업 정보</h2></div><div class="form-grid"><label class="field"><span>기업명</span><input id="company-name" value="${esc(draft.name)}" placeholder="예: 그린제조"></label><label class="field"><span>업종</span><input id="industry" value="${esc(draft.industry)}" placeholder="예: 식품 제조업"></label><label class="field"><span>관리 시작 연도</span><input id="start-year" type="number" min="2000" max="2100" value="${esc(draft.year||yearNow)}"></label><label class="field"><span>사업장별 분리 관리</span><select id="separate-sites"><option value="true" ${draft.separate_sites?'selected':''}>사업장별로 구분</option><option value="false" ${!draft.separate_sites?'selected':''}>전사 통합 자료도 포함</option></select></label></div></div>`
   +`<div class="card panel setup-area-panel" style="margin-top:16px"><div class="panel-head"><div><h2>02. 관리할 환경영역</h2><span class="subtle">필요한 영역을 직접 선택하거나 활동 질문으로 추천받으세요.</span></div></div><div class="activity-recommend-card"><div class="activity-recommend-copy"><span class="activity-recommend-icon">✳</span><div><strong>기업활동 맞춤 추천</strong><p>간단한 질문에 답하면 우리 회사에 필요한 환경영역을 추천해요.</p></div></div><button class="btn" id="open-activity-quiz">질문 시작 <span aria-hidden="true">→</span></button></div><div class="recommendation">현재 답변 기준 <strong>${rec.length}개 환경영역</strong>을 추천합니다. 추천을 적용한 뒤에도 아래에서 자유롭게 바꿀 수 있어요.</div><div class="grid grid-3">${state.groups.map(g=>`<label class="check-group ${draft.groups.includes(g.id)?'checked':''}"><input type="checkbox" data-group="${g.id}" ${draft.groups.includes(g.id)?'checked':''}><span><strong>${g.icon} ${g.name}</strong><small>${g.hint}${rec.includes(g.id)?' · 추천':''}</small></span></label>`).join('')}</div><div class="notice">선택한 영역의 기본 데이터 항목만 목록에 나타납니다. 필요하면 기록할 때 새 항목을 직접 추가할 수 있습니다.</div></div>`
    +`<div class="card panel" style="margin-top:16px"><div class="panel-head"><h2>03. 사업장과 관리 범위</h2><button class="btn" id="add-site">＋ 사업장 추가</button></div><div class="site-list">${state.sites.map(s=>`<div class="site-row"><div><strong>${esc(s.name)}</strong><small>${esc(s.kind)} · ${esc(s.scope||'범위 메모 없음')}</small></div><div class="site-actions"><button class="icon-edit" data-edit-site="${esc(s.id)}">편집</button><button class="icon-delete" data-delete-site="${esc(s.id)}">삭제</button></div></div>`).join('') || empty('등록된 사업장이 없습니다','자료가 어느 사업장에 속하는지 기록하려면 최소 한 곳을 추가하세요.')}</div></div>`
    +workflowNextMarkup('setup');
}

function showActivityQuestion(index) {
  const questions=state.questions||[];
  if(index>=questions.length) return showActivityRecommendation();
  const question=questions[index], total=questions.length;
  const selected=draft.answers?.[question.id];
  const progress=Math.round((index+1)/total*100);
  openDialog(`<div class="activity-question-dialog"><div class="dialog-title"><div><div class="eyebrow">ACTIVITY MATCH</div><h2>기업활동 맞춤 추천</h2></div><button class="close" data-close aria-label="닫기">×</button></div><div class="activity-question-meta"><span>${index+1} / ${total}</span><span>${progress}%</span></div><div class="activity-progress"><span style="width:${progress}%"></span></div><p class="activity-question-help">${esc(question.help||'해당하는 활동을 선택해 주세요.')}</p><h3>${esc(question.text)}</h3><div class="activity-answer-grid"><button type="button" class="activity-answer ${selected===true?'selected':''}" data-activity-answer="yes" aria-pressed="${selected===true}"><span>예</span><small>해당 활동을 하고 있어요</small></button><button type="button" class="activity-answer ${selected===false?'selected':''}" data-activity-answer="no" aria-pressed="${selected===false}"><span>아니요</span><small>현재는 해당하지 않아요</small></button></div><div class="activity-dialog-footer"><button type="button" class="small-link" id="activity-previous" ${index===0?'disabled':''}>← 이전 질문</button><button type="button" class="small-link" data-close>나중에 답하기</button></div></div>`,'activity');
  document.querySelectorAll('[data-activity-answer]').forEach(button=>button.onclick=()=>{
    draft.answers ||= {};
    draft.answers[question.id]=button.dataset.activityAnswer==='yes';
    showActivityQuestion(index+1);
  });
  $('#activity-previous').onclick=()=>{if(index>0)showActivityQuestion(index-1)};
}

function showActivityRecommendation() {
  const recommended=recommendation(draft.answers||{});
  const groups=state.groups.filter(g=>recommended.includes(g.id));
  openDialog(`<div class="activity-result-dialog"><div class="dialog-title"><div><div class="eyebrow">YOUR MATCH</div><h2>맞춤 추천 결과</h2></div><button class="close" data-close aria-label="닫기">×</button></div><div class="activity-result-count"><strong>${groups.length}</strong><span>개 환경영역 추천</span></div><p class="activity-result-copy">추천 영역을 확인한 뒤 관리 범위에 적용할 수 있어요. 적용 후에도 직접 수정할 수 있습니다.</p><div class="activity-result-groups">${groups.map(g=>`<span>${g.icon} ${esc(g.name)}</span>`).join('')||'<span>질문을 바탕으로 추천할 영역이 없어요. 아래에서 직접 선택해 주세요.</span>'}</div><div class="activity-result-actions"><button type="button" class="btn" id="activity-review-answers">답변 다시 보기</button><button type="button" class="btn primary" id="activity-apply-recommendation" ${groups.length?'':'disabled'}>추천 영역 적용</button></div></div>`,'activity');
  $('#activity-review-answers').onclick=()=>showActivityQuestion(0);
  $('#activity-apply-recommendation').onclick=()=>{draft.groups=recommended;closeDialog();render();toast('추천 영역을 적용했습니다. 설정 저장을 눌러 확정하세요.')};
}

function formatFileSize(size) { return size<1024*1024?`${Math.max(1,Math.round(size/1024))} KB`:`${(size/1024/1024).toFixed(1)} MB`; }
function sourceViewerMarkup(sourceId,filename,excerpt='') {
  const id=esc(sourceId),name=esc(filename),isImage=/\.(png|jpe?g|webp)$/i.test(filename);
  const preview=isImage?`<img class="source-preview-image" data-source-preview src="/api/preview/${id}" alt="${name} 원본 이미지">`:/\.pdf$/i.test(filename)?`<div class="source-pdf-wrap"><canvas class="source-pdf-canvas" data-source-pdf></canvas><div class="source-pdf-controls"><button type="button" class="source-page-button" data-pdf-prev aria-label="이전 페이지">‹</button><span data-pdf-page>PDF 불러오는 중</span><button type="button" class="source-page-button" data-pdf-next aria-label="다음 페이지">›</button></div></div>`:`<pre class="source-text-preview" data-source-text>${esc(excerpt||'미리보기를 제공하지 않는 파일 형식입니다. 파일을 내려받아 확인해 주세요.')}</pre>`;
  const zoomControls=isImage?`<div class="source-zoom-controls"><button type="button" data-source-zoom-out aria-label="축소">−</button><span data-source-zoom-level>100%</span><button type="button" data-source-zoom-in aria-label="확대">＋</button><button type="button" data-source-zoom-reset>초기화</button></div>`:'';
  return `<div class="source-viewer" data-source-viewer data-source-id="${id}"><div class="source-viewer-toolbar"><strong>${name}</strong><div class="source-viewer-actions">${zoomControls}<button type="button" class="btn source-fullscreen" data-source-fullscreen>⛶ 전체화면</button></div></div><div class="source-viewer-stage ${isImage?'has-zoom-image':''}" data-source-stage>${preview}</div><div class="source-viewer-hint">${isImage?'휠이나 버튼으로 확대·축소하고, 확대 후 끌어서 이동하세요.':'원본은 전체화면에서 크게 볼 수 있어요.'}</div></div>`;
}
function setSourceImageView(viewer,scale,x,y) {
  const stage=viewer.querySelector('[data-source-stage]'),image=viewer.querySelector('[data-source-preview]');
  if(!stage||!image)return;
  scale=Math.max(1,Math.min(5,scale));
  const box=stage.getBoundingClientRect(),fit=image.naturalWidth?Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight):1;
  const maxX=Math.max(0,((image.naturalWidth?image.naturalWidth*fit:box.width)*scale-box.width)/2);
  const maxY=Math.max(0,((image.naturalHeight?image.naturalHeight*fit:box.height)*scale-box.height)/2);
  x=Math.max(-maxX,Math.min(maxX,x));y=Math.max(-maxY,Math.min(maxY,y));
  viewer._imageView={scale,x,y};image.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
  stage.classList.toggle('is-zoomed',scale>1.001);
  const level=viewer.querySelector('[data-source-zoom-level]');if(level)level.textContent=`${Math.round(scale*100)}%`;
}
async function renderSourcePdfPage(viewer) {
  const model=viewer._pdfModel,canvas=viewer.querySelector('[data-source-pdf]'),stage=viewer.querySelector('[data-source-stage]');
  if(!model||!canvas||!stage)return;
  const page=await model.pdf.getPage(model.page),base=page.getViewport({scale:1});
  const scale=Math.min((stage.clientWidth-28)/base.width,(stage.clientHeight-44)/base.height,2);
  const viewport=page.getViewport({scale:Math.max(.2,scale)}),ratio=Math.min(window.devicePixelRatio||1,2),context=canvas.getContext('2d');
  canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
  canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
  context.setTransform(ratio,0,0,ratio,0,0);
  await page.render({canvasContext:context,viewport}).promise;
  viewer.querySelector('[data-pdf-page]').textContent=`${model.page} / ${model.pdf.numPages}`;
  viewer.querySelector('[data-pdf-prev]').disabled=model.page<=1;
  viewer.querySelector('[data-pdf-next]').disabled=model.page>=model.pdf.numPages;
}
function bindSourceViewers(root=document) {
  const viewers=[...(root.matches?.('[data-source-viewer]')?[root]:[]),...root.querySelectorAll('[data-source-viewer]')];
  viewers.forEach(async viewer=>{
    if(viewer.dataset.viewerBound)return;
    viewer.dataset.viewerBound='true';
    const stage=viewer.querySelector('[data-source-stage]'),sourceId=viewer.dataset.sourceId;
    const image=viewer.querySelector('[data-source-preview]');
    if(image){
      viewer._imageView={scale:1,x:0,y:0};
      const url=window.GreenCloud?await window.GreenCloud.sourceUrl(sourceId):'';
      if(url&&viewer.isConnected)image.src=url;
      image.addEventListener('load',()=>setSourceImageView(viewer,...Object.values(viewer._imageView)));
      const zoomIn=viewer.querySelector('[data-source-zoom-in]'),zoomOut=viewer.querySelector('[data-source-zoom-out]'),zoomReset=viewer.querySelector('[data-source-zoom-reset]');
      const changeZoom=factor=>{const view=viewer._imageView;setSourceImageView(viewer,view.scale*factor,view.x,view.y)};
      zoomIn.onclick=()=>changeZoom(1.25);zoomOut.onclick=()=>changeZoom(1/1.25);zoomReset.onclick=()=>setSourceImageView(viewer,1,0,0);
      stage.addEventListener('wheel',event=>{event.preventDefault();changeZoom(event.deltaY<0?1.15:1/1.15)},{passive:false});
      stage.addEventListener('pointerdown',event=>{
        if(viewer._imageView.scale<=1.001)return;
        viewer._panPointer={id:event.pointerId,x:event.clientX,y:event.clientY};stage.setPointerCapture(event.pointerId);stage.classList.add('is-panning');
      });
      stage.addEventListener('pointermove',event=>{
        const pan=viewer._panPointer;if(!pan||pan.id!==event.pointerId)return;
        const view=viewer._imageView;setSourceImageView(viewer,view.scale,view.x+event.clientX-pan.x,view.y+event.clientY-pan.y);pan.x=event.clientX;pan.y=event.clientY;
      });
      const endPan=event=>{if(viewer._panPointer?.id===event.pointerId){viewer._panPointer=null;stage.classList.remove('is-panning')}};
      stage.addEventListener('pointerup',endPan);stage.addEventListener('pointercancel',endPan);
      viewer._imageResizeObserver=new ResizeObserver(()=>{const view=viewer._imageView;setSourceImageView(viewer,view.scale,view.x,view.y)});viewer._imageResizeObserver.observe(stage);
    }
    const canvas=viewer.querySelector('[data-source-pdf]');
    if(canvas){
      try{
        const pdfjs=await import('/vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';
        const url=window.GreenCloud?await window.GreenCloud.sourceUrl(sourceId):`/api/preview/${encodeURIComponent(sourceId)}`;
        if(!url)throw Error('원본 파일을 찾을 수 없습니다.');
        const pdf=await pdfjs.getDocument({url}).promise;
        if(!viewer.isConnected)return;
        viewer._pdfModel={pdf,page:1};
        await renderSourcePdfPage(viewer);
        viewer.querySelector('[data-pdf-prev]').onclick=()=>{if(viewer._pdfModel.page>1){viewer._pdfModel.page--;renderSourcePdfPage(viewer)}};
        viewer.querySelector('[data-pdf-next]').onclick=()=>{if(viewer._pdfModel.page<pdf.numPages){viewer._pdfModel.page++;renderSourcePdfPage(viewer)}};
        viewer._pdfResizeObserver=new ResizeObserver(()=>renderSourcePdfPage(viewer));viewer._pdfResizeObserver.observe(stage);
      }catch(error){const label=viewer.querySelector('[data-pdf-page]');if(label)label.textContent=`PDF를 표시할 수 없습니다: ${error.message}`}
    }
    const full=viewer.querySelector('[data-source-fullscreen]');
    full.onclick=async()=>{try{if(document.fullscreenElement===viewer)await document.exitFullscreen();else await viewer.requestFullscreen()}catch(error){showError(error)}};
  });
}
document.addEventListener('fullscreenchange',()=>document.querySelectorAll('[data-source-viewer]').forEach(viewer=>{
  const button=viewer.querySelector('[data-source-fullscreen]');
  if(button)button.textContent=document.fullscreenElement===viewer?'전체화면 닫기':'⛶ 전체화면';
  if(viewer._pdfModel)renderSourcePdfPage(viewer);
}));
function uploadDraftFor(key) { return uploadDrafts.find(item=>item.key===key); }
function uploadCandidatePrefill(result,index) {
  if(result.analysis?.extractions?.[index]){
    const item=result.analysis.extractions[index],match=item.metric_match||{},field=item.field_value||{},period=item.period||{},scope=item.scope||{};
    const metric=selectedMetrics().find(m=>m.id===match.selected_metric_id),year=String(period.year||period.raw_text||'').match(/20\d{2}/)?.[0];
    const evidence=(item.evidence||[]).map(entry=>`${[entry.location?.page?`${entry.location.page}쪽`:'',entry.location?.sheet_name||'',entry.location?.cell_range||'',entry.location?.line_start?`${entry.location.line_start}행`:''].filter(Boolean).join(' ')}${entry.raw_text?`: ${entry.raw_text}`:''}`).filter(Boolean).join('\n');
    return {strict:true,deferSave:true,draftKey:`${result.id}:${index}`,metricId:metric?metric.id:'custom',metricLabel:match.raw_metric_label||'',groupId:metric?.group||state.profile.groups[0]||state.groups[0]?.id,siteId:scope.site_match_status==='MATCHED'?scope.selected_site_id:'',value:typeof field.value==='number'?field.value:'',unit:field.raw_unit||metric?.unit||'',periodStart:period.start_date||(year?`${year}-01-01`:''),periodEnd:period.end_date||(year?`${year}-12-31`:''),sourceId:result.id,evidence,note:typeof field.value==='number'?'':`원문 값: ${field.value??''} (숫자로 확인해 주세요.)`,excerpt:result.excerpt||''};
  }
  const candidate=result.candidates?.[index];
  if(!candidate)return null;
  const metric=selectedMetrics().find(m=>m.id===candidate.metricId);
  return {strict:true,deferSave:true,draftKey:`${result.id}:${index}`,metricId:metric?.id||'custom',metricLabel:metric?'':candidate.metricName||'',groupId:metric?.group||state.profile.groups[0]||state.groups[0]?.id,siteId:'',value:candidate.value??'',unit:candidate.unit||metric?.unit||'',date:candidate.date||'',sourceId:result.id,evidence:`${candidate.line?`${candidate.line}행: `:''}${candidate.text||''}`,excerpt:result.excerpt||''};
}
function uploadDraftPrefill(saved) {
  const record=saved.record;
  return {strict:true,deferSave:true,draftKey:saved.key,metricId:record.metric_id,metricLabel:record.metric_name,groupId:record.group_id,siteId:record.site_id,value:record.value,unit:record.unit,periodStart:record.period_start,periodEnd:record.period_end,sourceId:record.source_id,evidence:record.evidence,note:record.notes,excerpt:saved.excerpt||''};
}
function uploadCandidateMarkup(result,index,candidate,isAnalysis) {
  const key=`${result.id}:${index}`,saved=uploadDraftFor(key),value=isAnalysis?candidate.field_value?.value:candidate.value;
  const metric=isAnalysis?state.metrics.find(m=>m.id===candidate.metric_match?.selected_metric_id):state.metrics.find(m=>m.id===candidate.metricId);
  const label=metric?.name||(isAnalysis?candidate.metric_match?.raw_metric_label:'')||'항목 확인 필요';
  const unit=isAnalysis?candidate.field_value?.raw_unit:candidate.unit;
  const period=isAnalysis?(candidate.period?.raw_text||candidate.period?.year||candidate.period?.start_date||'기간 확인 필요'):(candidate.date||'기간 확인 필요');
  const scope=isAnalysis?(candidate.scope?.raw_scope_name||candidate.scope?.raw_text||'사업장 확인 필요'):'원본에서 확인한 값';
  const evidence=isAnalysis?(candidate.evidence?.map(e=>[e.location?.page?`${e.location.page}쪽`:'',e.location?.sheet_name||'',e.location?.cell_range||'',e.location?.line_start?`${e.location.line_start}행`:'',e.raw_text||''].filter(Boolean).join(' ')).join(' · ')||'근거 위치 확인 필요'):`${candidate.line?`${candidate.line}행 · `:''}${candidate.text||''}`;
  const status=saved?.uploaded?'업로드 완료':saved?(saved.selected?'임시 저장 · 업로드 선택':'임시 저장 · 업로드 제외'):'선택해 값을 확인하세요';
  const classes=['upload-candidate-row',saved?.selected?'is-selected':'',saved&&!saved.selected&&!saved.uploaded?'is-excluded':'',saved?.uploaded?'is-uploaded':''].filter(Boolean).join(' ');
  return `<div class="${classes}"><button type="button" class="candidate" data-upload-candidate="${esc(key)}" data-source-id="${esc(result.id)}" data-candidate-index="${index}" data-candidate-kind="${isAnalysis?'analysis':'basic'}" aria-pressed="${Boolean(saved?.selected&&!saved.uploaded)}"><strong>${esc(label)} · ${esc(value??'값 확인 필요')} ${esc(unit||'')}</strong><span>${esc(period)} · ${esc(scope)}</span><small>${esc(evidence)}</small><em class="candidate-status">${status}</em></button>${saved&&!saved.uploaded?`<button type="button" class="btn candidate-edit" data-edit-upload-draft="${esc(key)}">편집</button>`:`<span class="candidate-status-side">${saved?.uploaded?'완료':''}</span>`}</div>`;
}
function renderUploadResult(result) {
  const analysis=result.analysis, candidates=analysis?.extractions||result.candidates||[], isAnalysis=Boolean(analysis);
  const list=candidates.map((candidate,index)=>uploadCandidateMarkup(result,index,candidate,isAnalysis)).join('');
  return `<article class="card panel upload-result-card"><div class="panel-head"><div><h2>${esc(result.filename)}</h2><span class="subtle">${esc(result.method||'파일 분석')} · 후보 ${candidates.length}개</span></div><div class="button-row"><button type="button" class="btn" data-manual-source="${esc(result.id)}">＋ 직접 입력</button><a class="small-link" href="/api/source/${esc(result.id)}">원본 내려받기 ↗</a></div></div>${result.analysisError?`<div class="alert">분석 안내: ${esc(result.analysisError)}</div>`:''}${analysis?.warnings?.length?`<div class="notice">${analysis.warnings.map(esc).join(' · ')}</div>`:''}<div class="extraction-layout"><div><div class="upload-candidate-heading"><h3>값 후보</h3><span>선택한 항목을 확인한 뒤 임시 저장하세요.</span></div><div class="candidate-list">${list||empty('값 후보가 없습니다','원본을 확인한 뒤 직접 입력할 수 있습니다.')}</div></div><div><div class="upload-candidate-heading"><h3>원본 확인</h3><span>원본 이미지는 확대·축소할 수 있어요.</span></div>${sourceViewerMarkup(result.id,result.filename,result.excerpt||'')}</div></div></article>`;
}
function renderUploadCarousel() {
  if(!uploadResults.length)return '';
  uploadResultIndex=Math.max(0,Math.min(uploadResultIndex,uploadResults.length-1));
  const total=uploadResults.length,index=uploadResultIndex+1,progress=Math.round(index/total*100);
  return `<section class="upload-carousel" aria-label="업로드 자료 확인"><div class="upload-carousel-controls"><strong>자료 ${index} / ${total}</strong><div class="button-row"><button type="button" class="btn" id="upload-result-prev" ${index<=1?'disabled':''}>← 이전 자료</button><button type="button" class="btn" id="upload-result-next" ${index>=total?'disabled':''}>다음 자료 →</button></div></div><div class="upload-carousel-progress" role="progressbar" aria-label="자료 확인 진행률" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${index}"><span style="width:${progress}%"></span></div><div class="upload-carousel-page">${renderUploadResult(uploadResults[uploadResultIndex])}</div></section>`;
}
function renderUploadFileList() {
  if(!uploadFiles.length)return '';
  return `<ul class="upload-file-list">${uploadFiles.map((item,index)=>`<li class="upload-file-item ${item.status==='분석 중'?'is-processing':''} ${['실패','분석 실패','선택 불가'].includes(item.status)?'is-failed':''}"><span class="upload-file-icon">${esc(item.file.name.split('.').pop().toUpperCase().slice(0,4))}</span><span class="upload-file-meta"><strong title="${esc(item.file.name)}">${esc(item.file.name)}</strong><small>${formatFileSize(item.file.size)} · ${esc(item.error||item.status)}</small></span>${['대기','실패','선택 불가'].includes(item.status)?`<button type="button" class="upload-file-remove" data-remove-upload-file="${index}" aria-label="${esc(item.file.name)} 제거" ${uploadProcessing?'disabled':''}>×</button>`:`<span class="upload-file-state">${item.status==='분석 중'?'분석 중…':item.status==='분석 실패'?'확인 필요':'완료'}</span>`}</li>`).join('')}</ul>`;
}
function renderManualDrafts() {
  const items=uploadDrafts.filter(item=>item.manual);
  if(!items.length)return '';
  return `<section class="card panel manual-upload-drafts"><div class="upload-candidate-heading"><h3>직접 입력 후보</h3><span>선택·제외하거나 저장 전에 편집할 수 있어요.</span></div><div class="candidate-list">${items.map(item=>{const record=item.record,metric=state.metrics.find(m=>m.id===record.metric_id),status=item.uploaded?'업로드 완료':item.selected?'임시 저장 · 업로드 선택':'임시 저장 · 업로드 제외',classes=['upload-candidate-row',item.selected?'is-selected':'',!item.selected&&!item.uploaded?'is-excluded':'',item.uploaded?'is-uploaded':''].filter(Boolean).join(' ');return `<div class="${classes}"><button type="button" class="candidate" data-toggle-upload-draft="${esc(item.key)}" aria-pressed="${Boolean(item.selected&&!item.uploaded)}"><strong>${esc(metric?.name||record.metric_name||'직접 입력 항목')} · ${esc(record.value)} ${esc(record.unit)}</strong><span>${esc(siteName(record.site_id))} · ${esc(record.period_start)} ~ ${esc(record.period_end)}</span><small>${esc(record.evidence||record.notes||item.filename||'직접 입력')}</small><em class="candidate-status">${status}</em></button>${item.uploaded?'<span class="candidate-status-side">완료</span>':`<button type="button" class="btn candidate-edit" data-edit-upload-draft="${esc(item.key)}">편집</button>`}</div>`}).join('')}</div></section>`;
}
function renderUpload() {
  const queued=uploadFiles.filter(item=>item.status==='대기'||item.status==='실패').length;
  const selected=uploadDrafts.filter(item=>item.selected&&!item.uploaded).length;
  const pending=uploadDrafts.filter(item=>!item.uploaded).length;
  return head('SOURCE DOCUMENTS','자료 업로드','여러 문서를 한 번에 올려 확인하고, 필요한 데이터 후보만 골라 저장하세요.','<button class="btn" data-go="records">기록 보기</button>')
   +`<div class="upload-layout"><div class="card panel upload-select-panel"><div class="panel-head"><h2>원천자료 올리기</h2><div class="button-row"><button type="button" class="btn test-upload-button" id="test-upload-button" ${uploadProcessing?'disabled':''}>테스트 자료 자동 업로드</button><span class="pill">파일당 20MB 이하</span></div></div><label class="upload-zone" id="drop-zone"><span class="upload-icon">⇧</span><strong>파일을 끌어놓거나 클릭해 선택하세요</strong><span>여러 파일을 한 번에 선택할 수 있어요 · PDF, Excel, CSV, TXT, PNG, JPG, WEBP</span><input type="file" id="file-input" multiple accept=".pdf,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"></label><div id="upload-file-list">${renderUploadFileList()}</div><div class="notice">원본은 분석을 위해 보관됩니다. 확인한 데이터 값은 임시 저장되며, 아래의 ‘자료 업로드’를 눌러야 기록에 반영됩니다.</div><div class="button-row"><button class="btn primary" id="upload-button" ${uploadProcessing||!queued?'disabled':''}>${uploadProcessing?'파일 분석 중…':`선택한 파일 분석하기${queued?` (${queued})`:''}`}</button><span class="subtle">파일 형식과 파일명을 목록에서 확인하세요.</span></div></div><div class="card panel"><div class="panel-head"><h2>자료 처리 순서</h2></div><div class="site-list"><div class="site-row"><strong>01　여러 업무자료 선택</strong><small>PDF·Excel·이미지 등</small></div><div class="site-row"><strong>02　값 후보 검토</strong><small>원본과 나란히 확인</small></div><div class="site-row"><strong>03　필요한 값 임시 저장</strong><small>편집하거나 업로드에서 제외</small></div><div class="site-row"><strong>04　선택 후보 일괄 저장</strong><small>데이터 기록에 반영</small></div></div><div class="alert" style="margin-top:20px">파일 분석 결과는 초안입니다. 원본과 비교해 값·단위·기간·사업장을 확인해 주세요.</div></div></div>`
   +renderUploadCarousel()+renderManualDrafts()
   +(uploadResults.length||uploadDrafts.some(item=>item.manual&&!item.uploaded)?`<section class="bulk-upload-bar"><div><strong>검토한 후보를 기록으로 저장</strong><span>${pending?`임시 저장 ${pending}건 · 최종 저장 선택 ${selected}건`:'저장할 임시 후보가 없습니다.'}</span></div><button type="button" class="btn primary" id="upload-staged-button" ${!selected?'disabled':''}>자료 업로드</button></section>`:'')
   +`<div class="section-head"><h2>업로드한 원천자료</h2></div><div class="card table-wrap">${state.sources.length?`<table class="recent-table"><thead><tr><th>자료명</th><th>업로드 날짜</th><th>값 직접 입력·수정</th><th>원본</th></tr></thead><tbody>${state.sources.slice(0,10).map(s=>`<tr><td class="metric-name">${esc(s.filename)}</td><td>${esc((s.uploaded_at||'').slice(0,16).replace('T',' '))}</td><td><button type="button" class="btn recent-edit-button" data-manual-source="${esc(s.id)}">직접 입력</button></td><td><a class="small-link" href="/api/source/${s.id}">다운로드</a></td></tr>`).join('')}</tbody></table>`:empty('업로드된 자료가 없습니다','')}</div>`
   +workflowNextMarkup('upload');
}

function filteredRecords() {
  return state.records.filter(r=>(!recordFilter.group||r.group_id===recordFilter.group)&&(!recordFilter.site||r.site_id===recordFilter.site)&&(!recordFilter.year||r.period_end.startsWith(recordFilter.year))&&(!recordFilter.query||`${r.metric_name} ${sourceName(r.source_id)} ${siteName(r.site_id)}`.toLowerCase().includes(recordFilter.query.toLowerCase())));
}
function renderRecords() {
  const list=filteredRecords();
  return head('DATA LIBRARY','환경 데이터 기록','데이터 이름을 중심으로 사업장·기간별 값을 찾아보고 계속 추가하세요.','<button class="btn" data-go="upload">자료 업로드</button><button class="btn primary" id="new-record">＋ 기록 추가</button>')
   +`<div class="filter-bar"><input id="search-record" placeholder="데이터명 또는 증빙 검색" value="${esc(recordFilter.query)}"><select id="filter-group"><option value="">전체 영역</option>${state.groups.map(g=>`<option value="${g.id}" ${recordFilter.group===g.id?'selected':''}>${g.name}</option>`).join('')}</select><select id="filter-site"><option value="">전체 사업장</option>${state.sites.map(s=>`<option value="${s.id}" ${recordFilter.site===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select><select id="filter-year"><option value="">전체 연도</option>${[...new Set(state.records.map(r=>r.period_end.slice(0,4)))].sort().reverse().map(y=>`<option value="${y}" ${recordFilter.year===y?'selected':''}>${y}년</option>`).join('')}</select><span class="push subtle">${list.length}건의 기록</span></div>`
    +`<div class="card table-wrap" id="records-table">${list.length?`<table class="data-table"><thead><tr><th>데이터 항목</th><th>사업장</th><th>기간</th><th>확인값</th><th>증빙자료</th><th>검토일</th><th></th></tr></thead><tbody>${list.map(r=>`<tr><td><div class="metric-name">${esc(r.metric_name)}</div><div class="subtle">${esc(groupName(r.group_id))}</div></td><td>${esc(siteName(r.site_id))}</td><td>${esc(r.period_start)}<br><span class="subtle">~ ${esc(r.period_end)}</span></td><td><strong>${fmt(r.value)} ${esc(r.unit)}</strong></td><td>${r.source_id?`<a class="small-link" href="/api/source/${r.source_id}">${esc(sourceName(r.source_id))}</a>`:'<span class="subtle">직접 입력</span>'}</td><td>${esc(r.verified_at.slice(0,10))}</td><td><div class="record-row-actions"><button class="small-link" data-edit-record="${r.id}">수정</button><button class="icon-delete" data-delete-record="${r.id}">삭제</button></div></td></tr>`).join('')}</tbody></table>`:empty('조건에 맞는 기록이 없습니다','필터를 바꾸거나 새 값을 추가해 주세요.')}</div>`
    +workflowNextMarkup('records');
}

function renderInsights() {
  const metrics=selectedMetrics(), recorded=new Set(state.records.map(r=>r.metric_id));
  const years=[...new Set(state.records.map(r=>r.period_end.slice(0,4)))].sort();
  const latestYear=years.at(-1)||String(new Date().getFullYear());
  if(!years.includes(insightMonthViewYear))insightMonthViewYear=insightSelectedYear||latestYear;
  const monthYear=insightMonthViewYear||latestYear;
  const monthKeys=Array.from({length:12},(_,i)=>`${monthYear}-${String(i+1).padStart(2,'0')}`);
  const yearMax=Math.max(1,...years.map(y=>state.records.filter(r=>r.period_end.startsWith(y)).length));
  const monthMax=Math.max(1,...monthKeys.map(m=>state.records.filter(r=>r.period_end.startsWith(m)).length));
  const priorityPeriod=insightMode==='month'&&insightSelectedMonth?insightSelectedMonth:insightSelectedYear;
  const missing=metrics.filter(m=>!state.records.some(r=>r.metric_id===m.id&&(!priorityPeriod||r.period_end.startsWith(priorityPeriod))));
  const periodLabel=priorityPeriod?priorityPeriod.length===7?`${priorityPeriod.slice(0,4)}년 ${Number(priorityPeriod.slice(5,7))}월`:`${priorityPeriod}년`:'전체 기간';
  const graph=insightMode==='year'
    ? years.length?`<div class="year-bars">${years.map(y=>{const n=state.records.filter(r=>r.period_end.startsWith(y)).length,selected=insightSelectedYear===y;return `<button type="button" class="year-bar-wrap period-bar-button ${selected?'is-selected':''}" data-insight-year="${y}" aria-pressed="${selected}"><b>${n}건</b><span class="year-bar" style="height:${Math.max(8,Math.round(n/yearMax*145))}px"></span><small>${y}</small></button>`}).join('')}</div>`:empty('아직 그래프에 표시할 기록이 없습니다','값을 저장하면 연도별 기록 수를 볼 수 있습니다.')
    :`<div class="month-chart-head"><label for="insight-month-year">연도</label><select id="insight-month-year">${years.map(y=>`<option value="${y}" ${monthYear===y?'selected':''}>${y}년</option>`).join('')}</select></div>${years.length?`<div class="year-bars month-bars">${monthKeys.map(m=>{const n=state.records.filter(r=>r.period_end.startsWith(m)).length,selected=insightSelectedMonth===m;return `<button type="button" class="year-bar-wrap period-bar-button ${selected?'is-selected':''}" data-insight-month="${m}" aria-pressed="${selected}"><b>${n}건</b><span class="year-bar" style="height:${Math.max(8,Math.round(n/monthMax*145))}px"></span><small>${Number(m.slice(5,7))}월</small></button>`}).join('')}</div>`:empty('아직 그래프에 표시할 기록이 없습니다','값을 저장하면 월별 기록 수를 볼 수 있습니다.')}`;
  return head('INSIGHTS','관리 현황과 재활용','빠진 자료를 확인하고, 누적한 데이터를 거래처 요청에 맞게 내보내세요.','<a class="btn" href="/api/backup.json">JSON 백업</a><a class="btn primary" href="/api/export.csv">CSV 내보내기 ↗</a>')
   +`<div class="grid grid-3"><div class="card stat-card"><div class="stat-top">관리영역 <span class="stat-symbol">◇</span></div><div class="stat-value">${state.profile.groups.length}</div><div class="stat-foot">직접 선택한 환경영역</div></div><div class="card stat-card"><div class="stat-top">값이 있는 항목 <span class="stat-symbol">▤</span></div><div class="stat-value">${recorded.size}</div><div class="stat-foot">기록을 시작한 데이터명</div></div><div class="card stat-card"><div class="stat-top">아직 값이 없는 항목 <span class="stat-symbol">◌</span></div><div class="stat-value">${missing.length}</div><div class="stat-foot">${priorityPeriod?`${periodLabel} 기준`:'전체 기간 기준'}</div></div></div>`
   +`<div class="grid grid-2" style="margin-top:16px"><div class="card panel"><div class="panel-head"><h2>${insightMode==='year'?'연도별':'월별'} 축적 기록</h2><div class="segmented-toggle" role="group" aria-label="축적 기록 단위"><button type="button" data-insight-mode="year" class="${insightMode==='year'?'active':''}" aria-pressed="${insightMode==='year'}">연도별</button><button type="button" data-insight-mode="month" class="${insightMode==='month'?'active':''}" aria-pressed="${insightMode==='month'}">월별</button></div></div>${graph}<p class="chart-hint">막대를 누르면 해당 기간의 우선 확인 항목을 볼 수 있어요. 다시 누르면 선택이 해제됩니다.</p></div><div class="card panel"><div class="panel-head"><h2>영역별 준비 현황</h2></div>${state.groups.filter(g=>state.profile.groups.includes(g.id)).map(g=>{const all=metrics.filter(m=>m.group===g.id),done=all.filter(m=>recorded.has(m.id)).length,p=all.length?Math.round(done/all.length*100):0;return `<div class="area-row"><strong>${g.name}</strong><div class="progress-track"><span style="width:${p}%"></span></div><span>${done}/${all.length}</span></div>`}).join('')||empty('관리 영역이 없습니다','시작하기에서 영역을 선택하세요.')}</div></div>`
   +`<div class="section-head"><h2>우선 확인할 데이터</h2><span class="pill">${periodLabel} 기준</span></div><div class="card panel">${missing.length?`<div class="grid grid-3">${missing.slice(0,15).map(m=>`<div class="insight-metric"><strong>${esc(m.name)}</strong><div class="line"><span>${esc(groupName(m.group))} · ${esc(m.sourceExample)}</span></div></div>`).join('')}</div>${missing.length>15?`<p class="subtle" style="margin:15px 0 0">외 ${missing.length-15}개 항목</p>`:''}`:empty(priorityPeriod?`${periodLabel}에 미기록 기본 항목이 없습니다`:'현재 선택한 기본 항목이 모두 기록되었습니다','새 자료가 생기면 기간을 달리해 계속 쌓을 수 있습니다.')}</div>`
   +`<div class="notice">이 화면은 자료 준비 현황을 보여줍니다. 온실가스 산정이나 ESG 평가 점수는 계산하지 않습니다. 서로 다른 정의와 단위의 값은 자동으로 합산하지 않습니다.</div>`;
}

function closeDialog() { $('#dialog').close(); }
function openDialog(content, variant='') { const dialog=$('#dialog'); dialog.className=variant?`dialog-${variant}`:''; $('#dialog-content').innerHTML=`<div class="dialog-inner">${content}</div>`; if(!dialog.open)dialog.showModal(); $('#dialog-content').querySelectorAll('[data-close]').forEach(b=>b.onclick=closeDialog); }
function recordDialog(prefill={}) {
  if(!state.sites.length){toast('먼저 사업장을 등록해 주세요.');navigate('setup');return;}
  const metrics=[...selectedMetrics()], existingMetric=state.metrics.find(m=>m.id===prefill.metricId);
  if(existingMetric&&!metrics.some(m=>m.id===existingMetric.id))metrics.unshift(existingMetric);
  const first=metrics[0], strict=Boolean(prefill.strict||prefill.deferSave), metricId=strict?(prefill.metricId||'custom'):(prefill.metricId||first?.id||'custom');
  let defaultStart=`${state.profile.year||yearNow}-01-01`, defaultEnd=`${state.profile.year||yearNow}-12-31`;
  const dateMatch=String(prefill.date||'').match(/(20\d{2})[-./년 ]+(\d{1,2})(?:[-./월 ]+(\d{1,2}))?/);
  if(dateMatch){const y=Number(dateMatch[1]),m=Number(dateMatch[2]);if(m>=1&&m<=12){const d=dateMatch[3]?Number(dateMatch[3]):1;defaultStart=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;defaultEnd=dateMatch[3]?defaultStart:`${y}-${String(m).padStart(2,'0')}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`}}
  if(strict){defaultStart=prefill.periodStart||(dateMatch?defaultStart:'');defaultEnd=prefill.periodEnd||(dateMatch?defaultEnd:'');}
  const source=state.sources.find(s=>s.id===(prefill.sourceId||''));
  const viewer=source?sourceViewerMarkup(source.id,source.filename,prefill.excerpt||''):`<div class="source-viewer-empty">증빙 파일을 선택하면<br>여기에 원본이 표시됩니다.</div>`;
  openDialog(`<div class="record-dialog-layout"><div class="record-form-column"><div class="dialog-title"><div><div class="eyebrow">VERIFY & SAVE</div><h2>${prefill.recordId?'데이터 기록 수정':'환경 데이터 확인'}</h2></div><button class="close" data-close>×</button></div><p class="muted" style="font-size:12px">원천자료의 값, 기간, 단위, 사업장을 확인한 뒤 ${prefill.deferSave?'임시 저장':'저장'}하세요.</p><form id="record-form" class="form-grid"><label class="field full"><span>데이터 항목</span><select name="metric_id" id="record-metric"><option value="custom">＋ 직접 항목 입력</option>${metrics.map(m=>`<option value="${m.id}" ${metricId===m.id?'selected':''}>${esc(groupName(m.group))} · ${esc(m.name)} (${esc(m.unit)})</option>`).join('')}</select><small>이 항목으로 기록을 분류하고 현황을 집계합니다.</small></label><label class="field" id="custom-group-field" style="display:none"><span>관리영역</span><select name="group_id">${state.groups.map(g=>`<option value="${g.id}" ${prefill.groupId===g.id?'selected':''}>${g.name}</option>`).join('')}</select></label><label class="field" id="custom-name-field" style="display:none"><span>새 항목 이름</span><input name="metric_name" value="${esc(prefill.metricLabel||'')}" placeholder="예: 포장재 사용량"></label><label class="field"><span>사업장</span><select name="site_id" required>${strict?`<option value="" ${prefill.siteId?'':'selected'}>사업장 선택</option>`:''}${state.sites.map(s=>`<option value="${s.id}" ${prefill.siteId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label class="field"><span>확인한 값</span><input name="value" type="number" step="any" required value="${esc(prefill.value??'')}" placeholder="예: 1250"></label><label class="field"><span>단위</span><input name="unit" required value="${esc(prefill.unit||state.metrics.find(m=>m.id===metricId)?.unit||'')}" placeholder="예: kWh"><small>원자료의 단위를 그대로 기록하세요.</small></label><label class="field"><span>기간 시작</span><input name="period_start" type="date" required value="${esc(defaultStart)}"></label><label class="field"><span>기간 종료</span><input name="period_end" type="date" required value="${esc(defaultEnd)}"></label><label class="field full"><span>증빙 파일</span><select name="source_id"><option value="">파일 연결 없이 입력</option>${state.sources.map(s=>`<option value="${s.id}" ${prefill.sourceId===s.id?'selected':''}>${esc(s.filename)}</option>`).join('')}</select></label><label class="field full"><span>원문 또는 근거 위치</span><textarea name="evidence" placeholder="예: 고지서 2쪽의 사용량 표">${esc(prefill.evidence||'')}</textarea></label><label class="field full"><span>메모</span><input name="notes" value="${esc(prefill.note||prefill.notes||'')}" placeholder="측정 기준이나 확인할 사항"></label><div class="full button-row" style="justify-content:flex-end"><button type="button" class="btn" data-close>취소</button><button class="btn primary" type="submit">${prefill.deferSave?'임시 저장':prefill.recordId?'수정 내용 저장':'확인하고 저장'}</button></div></form></div><aside class="record-source-column" id="record-source-viewer">${viewer}</aside></div>`,'record');
  const select=$('#record-metric'),form=$('#record-form');
  function customFields(fillUnit=false){const custom=select.value==='custom';$('#custom-group-field').style.display=custom?'block':'none';$('#custom-name-field').style.display=custom?'block':'none';form.elements.group_id.required=custom;form.elements.metric_name.required=custom;if(fillUnit&&!custom){const m=state.metrics.find(x=>x.id===select.value);if(m) $('#record-form [name="unit"]').value=m.unit;}}
  select.onchange=()=>customFields(true); customFields();
  if(prefill.siteId)form.elements.site_id.value=prefill.siteId;
  if(prefill.groupId)form.elements.group_id.value=prefill.groupId;
  bindSourceViewers($('#record-source-viewer'));
  form.elements.source_id.onchange=()=>{
    const selected=state.sources.find(s=>s.id===form.elements.source_id.value);
    const holder=$('#record-source-viewer');
    holder.innerHTML=selected?sourceViewerMarkup(selected.id,selected.filename):`<div class="source-viewer-empty">증빙 파일을 선택하면<br>여기에 원본이 표시됩니다.</div>`;
    bindSourceViewers(holder);
  };
  $('#record-form').onsubmit=async e=>{
    e.preventDefault();
    try{
      const record=Object.fromEntries(new FormData(e.target));
      if(prefill.deferSave){
        const saved=uploadDrafts.find(item=>item.key===prefill.draftKey);
        if(saved){saved.record=record;saved.excerpt=prefill.excerpt||saved.excerpt||''}
        else uploadDrafts.push({key:prefill.draftKey,sourceId:record.source_id,filename:state.sources.find(s=>s.id===record.source_id)?.filename||'',excerpt:prefill.excerpt||'',record,selected:true,uploaded:false,manual:String(prefill.draftKey).includes(':manual:')});
        persistUploadReview();
        closeDialog();render();toast('후보를 임시 저장했습니다. 검토 후 아래에서 일괄 저장하세요.');
      } else {await post(prefill.recordId?'/api/records/update':'/api/records',prefill.recordId?{...record,id:prefill.recordId}:record);closeDialog();toast(prefill.recordId?'기록을 수정했습니다.':'확인한 값이 저장되었습니다.');await refresh();}
    }catch(error){showError(error)}
  };
  $('#dialog-content').querySelectorAll('[data-close]').forEach(b=>b.onclick=closeDialog);
}

function bindPage() {
  if(window.GreenCloud) {
    document.querySelectorAll('a[href^="/api/source/"]').forEach(async el=>{
      const sourceId=el.getAttribute('href').split('/').at(-1),url=await window.GreenCloud.sourceUrl(sourceId);
      if(url){el.href=url;el.download=sourceName(sourceId)}
    });
    document.querySelectorAll('a[href="/api/export.csv"],a[href="/api/backup.json"]').forEach(el=>el.onclick=async event=>{
      event.preventDefault();try{const response=await fetch(el.getAttribute('href'));if(!response.ok)throw Error('파일을 만들지 못했습니다.');const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=el.getAttribute('href').endsWith('.csv')?'greendb-records.csv':'greendb-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(error){showError(error)}
    });
  }
  bindSourceViewers(document);
  document.querySelectorAll('[data-go]').forEach(el=>el.onclick=()=>navigate(el.dataset.go));
  document.querySelectorAll('.workflow-next[data-go]').forEach(el=>el.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate(el.dataset.go)}});
  if(page==='setup') {
    for(const [selector,key] of [['#company-name','name'],['#industry','industry'],['#start-year','year'],['#separate-sites','separate_sites']]) $(selector).onchange=e=>draft[key]=key==='year'?Number(e.target.value):key==='separate_sites'?e.target.value==='true':e.target.value;
    document.querySelectorAll('[data-group]').forEach(el=>el.onchange=()=>{draft.groups=el.checked?[...new Set([...draft.groups,el.dataset.group])]:draft.groups.filter(g=>g!==el.dataset.group);render()});
    $('#open-activity-quiz').onclick=()=>showActivityQuestion(0);
    $('#save-profile').onclick=async()=>{try{draft.name=$('#company-name').value.trim();draft.industry=$('#industry').value.trim();draft.year=Number($('#start-year').value);draft.separate_sites=$('#separate-sites').value==='true';if(!draft.name)throw Error('기업명을 입력해 주세요.');await post('/api/profile',draft);draft=null;toast('설정이 저장되었습니다.');await refresh()}catch(error){showError(error)}};
    const openSiteDialog=(site=null)=>{
      const kinds=[...new Set([site?.kind,'공장','사무실','물류센터','기타'].filter(Boolean))];
      openDialog(`<div class="dialog-title"><h2>${site?'사업장 정보 수정':'사업장 추가'}</h2><button class="close" data-close aria-label="닫기">×</button></div><form id="site-form" class="form-grid"><label class="field full"><span>사업장 이름</span><input name="name" required maxlength="120" value="${esc(site?.name||'')}" placeholder="예: 본사, 1공장"></label><label class="field"><span>유형</span><select name="kind">${kinds.map(kind=>`<option value="${esc(kind)}" ${site?.kind===kind?'selected':''}>${esc(kind)}</option>`).join('')}</select></label><label class="field"><span>관리 범위 메모</span><input name="scope" maxlength="300" value="${esc(site?.scope||'')}" placeholder="예: 생산동 A·B 포함"></label><div class="full button-row" style="justify-content:flex-end"><button type="button" class="btn" data-close>취소</button><button type="submit" class="btn primary">${site?'수정 내용 저장':'사업장 저장'}</button></div></form>`);
      $('#site-form').onsubmit=async e=>{e.preventDefault();try{const values=Object.fromEntries(new FormData(e.target));if(site)values.id=site.id;await post(site?'/api/sites/update':'/api/sites',values);closeDialog();toast(site?'사업장 정보가 수정되었습니다.':'사업장이 추가되었습니다.');await refresh()}catch(error){showError(error)}};
    };
    $('#add-site').onclick=()=>openSiteDialog();
    document.querySelectorAll('[data-edit-site]').forEach(button=>button.onclick=()=>{const site=state.sites.find(item=>item.id===button.dataset.editSite);if(site)openSiteDialog(site)});
    document.querySelectorAll('[data-delete-site]').forEach(b=>b.onclick=async()=>{if(!confirm('이 사업장을 삭제할까요?'))return;try{await post('/api/sites/delete',{id:b.dataset.deleteSite});await refresh()}catch(error){showError(error)}});
  }
  if(page==='upload') {
    const input=$('#file-input'),zone=$('#drop-zone');
    const moveUploadResult=delta=>{const next=uploadResultIndex+delta;if(next>=0&&next<uploadResults.length){uploadResultIndex=next;render()}};
    $('#upload-result-prev')?.addEventListener('click',()=>moveUploadResult(-1));
    $('#upload-result-next')?.addEventListener('click',()=>moveUploadResult(1));
    const carousel=$('.upload-carousel-page');
    if(carousel){
      let swipeStart=null;
      carousel.addEventListener('touchstart',event=>{
        if(event.target.closest('button,a,input,select,textarea,.candidate,.source-viewer-stage.is-zoomed'))return;
        const touch=event.touches[0];if(touch)swipeStart={x:touch.clientX,y:touch.clientY};
      },{passive:true});
      carousel.addEventListener('touchend',event=>{
        const touch=event.changedTouches[0];if(!touch||!swipeStart)return;
        const dx=touch.clientX-swipeStart.x,dy=touch.clientY-swipeStart.y;swipeStart=null;
        if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.2)moveUploadResult(dx<0?1:-1);
      },{passive:true});
    }
    const addFiles=files=>{
      for(const file of files){
        const key=`${file.name}:${file.size}:${file.lastModified}`;
        if(uploadFiles.some(item=>item.key===key))continue;
        const allowed=/\.(pdf|xlsx|csv|txt|png|jpe?g|webp)$/i.test(file.name),tooLarge=file.size>20*1024*1024;
        uploadFiles.push({key,file,status:!allowed||tooLarge?'선택 불가':'대기',error:!allowed?'지원하지 않는 파일 형식':tooLarge?'파일당 20MB를 초과했습니다.':''});
      }
      render();
    };
    $('#test-upload-button').onclick=async()=>{
      try{
        const response=await fetch('/test-invoice.png',{cache:'no-store'});
        if(!response.ok)throw Error(`테스트 자료를 불러오지 못했습니다 (HTTP ${response.status}). 로컬 서버를 재시작하거나 배포본을 갱신해 주세요.`);
        const blob=await response.blob();
        addFiles([new File([blob],'도시가스_6.png',{type:blob.type||'image/png',lastModified:Date.now()})]);
        toast('테스트 자료를 목록에 추가하고 분석을 시작합니다.');
        setTimeout(()=>$('#upload-button')?.click(),0);
      }catch(error){showError(error)}
    };
    input.onchange=()=>{addFiles([...input.files]);input.value=''};
    zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag')};zone.ondragleave=()=>zone.classList.remove('drag');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag');addFiles([...e.dataTransfer.files])};
    document.querySelectorAll('[data-remove-upload-file]').forEach(button=>button.onclick=()=>{uploadFiles.splice(Number(button.dataset.removeUploadFile),1);render()});
    $('#upload-button').onclick=async()=>{
      const queue=uploadFiles.filter(item=>item.status==='대기'||item.status==='실패');
      if(!queue.length)return toast('먼저 분석할 파일을 선택해 주세요.');
      uploadProcessing=true;
      for(const item of queue){
        item.status='분석 중';item.error='';render();
        try{
          if(!item.sourceResult){
            const form=new FormData();form.append('file',item.file);
            item.sourceResult=await api('/api/upload',{method:'POST',body:form});
            if(!state.sources.some(source=>source.id===item.sourceResult.id))state.sources.unshift({id:item.sourceResult.id,filename:item.sourceResult.filename,type:item.file.type||'application/octet-stream',uploaded_at:new Date().toISOString(),extraction_method:item.sourceResult.method||'파일 보관'});
          }
          let extraction=item.sourceResult;
          if(!extraction.analysis&&!extraction.analysisError){
            const context={analysis_id:crypto.randomUUID(),source_document:{source_id:item.sourceResult.id,filename:item.sourceResult.filename,media_type:item.file.type||'application/octet-stream'},analysis_context:{company_name:state.profile.name||null,industry:state.profile.industry||null,management_year:state.profile.year||null},active_metric_candidates:selectedMetrics().map(m=>({id:m.id,group:m.group,name:m.name,unit:m.unit,sourceExample:m.sourceExample})),site_candidates:state.sites.map(s=>({id:s.id,name:s.name,kind:s.kind,scope:s.scope})),expected_schema:'greendb-extraction.schema_v4.json'};
            extraction=await post('/api/extract',{context});
          }
          const result={...item.sourceResult,...extraction,filename:item.sourceResult.filename,excerpt:extraction.excerpt||item.sourceResult.excerpt||'',fileType:item.file.type||''};
          const old=uploadResults.findIndex(entry=>entry.id===result.id);if(old>=0)uploadResults.splice(old,1);uploadResults.unshift(result);uploadResultIndex=0;
          persistUploadReview();
          item.status=result.analysisError?'분석 실패':'완료';item.error=result.analysisError||'';
        }catch(error){
          item.status='실패';item.error=error.message;
          if(item.sourceResult){const result={...item.sourceResult,filename:item.sourceResult.filename,analysisError:error.message,fileType:item.file.type||''};const old=uploadResults.findIndex(entry=>entry.id===result.id);if(old>=0)uploadResults.splice(old,1);uploadResults.unshift(result);uploadResultIndex=0;persistUploadReview()}
        }
        render();
      }
      uploadProcessing=false;await refresh();toast('선택한 파일 분석이 끝났습니다. 값 후보를 확인해 주세요.');
    };
    document.querySelectorAll('[data-upload-candidate]').forEach(button=>button.onclick=()=>{
      const key=button.dataset.uploadCandidate,saved=uploadDraftFor(key);
      if(saved){if(saved.uploaded)return toast('이미 데이터 기록에 저장된 후보입니다.');saved.selected=!saved.selected;persistUploadReview();render();return;}
      const result=uploadResults.find(item=>item.id===button.dataset.sourceId),prefill=result&&uploadCandidatePrefill(result,Number(button.dataset.candidateIndex));
      if(prefill)recordDialog(prefill);
    });
    document.querySelectorAll('[data-toggle-upload-draft]').forEach(button=>button.onclick=()=>{const saved=uploadDraftFor(button.dataset.toggleUploadDraft);if(saved&&!saved.uploaded){saved.selected=!saved.selected;persistUploadReview();render()}});
    document.querySelectorAll('[data-edit-upload-draft]').forEach(button=>button.onclick=()=>{const saved=uploadDraftFor(button.dataset.editUploadDraft);if(saved&&!saved.uploaded)recordDialog(uploadDraftPrefill(saved))});
    document.querySelectorAll('[data-manual-source]').forEach(button=>button.onclick=()=>recordDialog({strict:true,deferSave:true,draftKey:`${button.dataset.manualSource}:manual:${crypto.randomUUID()}`,sourceId:button.dataset.manualSource,groupId:state.profile.groups[0]||state.groups[0]?.id}));
    if($('#upload-staged-button'))$('#upload-staged-button').onclick=async()=>{
      const selectedDrafts=uploadDrafts.filter(item=>item.selected&&!item.uploaded);
      if(!selectedDrafts.length)return toast('일괄 저장할 후보를 선택해 주세요.');
      const button=$('#upload-staged-button');button.disabled=true;button.textContent='저장 중…';
      try{
        const result=await post('/api/records/bulk',{records:selectedDrafts.map(item=>item.record)});
        selectedDrafts.forEach((item,index)=>{item.uploaded=true;item.selected=false;item.recordId=result.ids?.[index]||''});
        persistUploadReview();
        await refresh();toast(`${selectedDrafts.length}건을 데이터 기록에 저장했습니다.`);
      }catch(error){showError(error);render()}
    };
  }
  if(page==='records') {
    $('#new-record').onclick=()=>recordDialog();
    for(const [selector,key] of [['#search-record','query'],['#filter-group','group'],['#filter-site','site'],['#filter-year','year']]) $(selector).onchange=e=>{recordFilter[key]=e.target.value;render()};
    $('#search-record').oninput=e=>{recordFilter.query=e.target.value;const pos=e.target.selectionStart;render();const input=$('#search-record');input.focus();input.setSelectionRange(pos,pos)};
    document.querySelectorAll('[data-edit-record]').forEach(button=>button.onclick=()=>{const record=state.records.find(item=>item.id===button.dataset.editRecord);if(record)recordDialog({recordId:record.id,strict:true,metricId:record.metric_id,metricLabel:record.metric_name,groupId:record.group_id,siteId:record.site_id,value:record.value,unit:record.unit,periodStart:record.period_start,periodEnd:record.period_end,sourceId:record.source_id||'',evidence:record.evidence||'',notes:record.notes||''})});
    document.querySelectorAll('[data-delete-record]').forEach(b=>b.onclick=async()=>{if(!confirm('이 기록을 삭제할까요?'))return;try{await post('/api/records/delete',{id:b.dataset.deleteRecord});toast('기록을 삭제했습니다.');await refresh()}catch(error){showError(error)}});
  }
  if(page==='insights') {
    document.querySelectorAll('[data-insight-mode]').forEach(button=>button.onclick=()=>{insightMode=button.dataset.insightMode;render()});
    document.querySelectorAll('[data-insight-year]').forEach(button=>button.onclick=()=>{const year=button.dataset.insightYear;insightSelectedYear=insightSelectedYear===year?'':year;insightMonthViewYear=insightSelectedYear||[...new Set(state.records.map(r=>r.period_end.slice(0,4)))].sort().at(-1)||'';if(!insightSelectedYear)insightSelectedMonth='';else if(insightSelectedMonth&&!insightSelectedMonth.startsWith(insightSelectedYear))insightSelectedMonth='';render()});
    document.querySelectorAll('[data-insight-month]').forEach(button=>button.onclick=()=>{const month=button.dataset.insightMonth;insightSelectedMonth=insightSelectedMonth===month?'':month;if(insightSelectedMonth){insightSelectedYear=month.slice(0,4);insightMonthViewYear=insightSelectedYear}render()});
    if($('#insight-month-year'))$('#insight-month-year').onchange=event=>{insightMonthViewYear=event.target.value;insightSelectedYear=event.target.value;if(insightSelectedMonth&&!insightSelectedMonth.startsWith(event.target.value))insightSelectedMonth='';render()};
  }
}

window.addEventListener('hashchange',()=>{if(location.hash!=='#setup')draft=null;render();window.scrollTo({top:0,behavior:'smooth'})});
$('#today').textContent=new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric'}).format(new Date());
$('#help-button').onclick=()=>openDialog(`<div class="dialog-title"><h2>GreenDB 사용 안내</h2><button class="close" data-close>×</button></div><p>① 시작하기에서 기업활동과 사업장을 설정합니다.<br>② 원천자료를 올리고 추출된 값을 원본과 비교합니다.<br>③ 확인한 값을 기간·사업장·증빙과 함께 저장합니다.<br>④ 현황·활용에서 누락 항목을 확인하고 CSV로 내보냅니다.</p><div class="alert">이 MVP는 로컬 컴퓨터에서만 실행됩니다. ESG 평가나 법적 공시 수치로 사용하기 전에는 담당자가 정의·단위·경계를 검증해야 합니다.</div>`);
refresh().catch(showError);
