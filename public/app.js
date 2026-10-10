const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n) => new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 3}).format(n);
const yearNow = new Date().getFullYear();
let state, page = 'overview', draft, uploadResult = null, recordFilter = {group:'', site:'', year:'', query:''};

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
  return head('SETUP','우리 회사에 맞게 시작하기','기업의 실제 활동을 선택하고 사업장과 관리 범위를 설정하세요.','<button class="btn primary" id="save-profile">설정 저장</button>')
   +`<div class="setup-steps"><span class="done">01 기업 정보</span><span class="done">02 활동 질문</span><span class="done">03 관리 영역</span><span class="done">04 사업장</span></div>`
   +`<div class="card panel"><div class="panel-head"><h2>01. 기업 정보</h2></div><div class="form-grid"><label class="field"><span>기업명</span><input id="company-name" value="${esc(draft.name)}" placeholder="예: 그린제조"></label><label class="field"><span>업종</span><input id="industry" value="${esc(draft.industry)}" placeholder="예: 식품 제조업"></label><label class="field"><span>관리 시작 연도</span><input id="start-year" type="number" min="2000" max="2100" value="${esc(draft.year||yearNow)}"></label><label class="field"><span>사업장별 분리 관리</span><select id="separate-sites"><option value="true" ${draft.separate_sites?'selected':''}>사업장별로 구분</option><option value="false" ${!draft.separate_sites?'selected':''}>전사 통합 자료도 포함</option></select></label></div></div>`
   +`<div class="card panel" style="margin-top:16px"><div class="panel-head"><h2>02. 기업활동 질문</h2><span class="subtle">해당하는 활동을 선택하세요</span></div><div class="question-list">${state.questions.map(q=>`<div class="question ${draft.answers?.[q.id]?'on':''}" data-question="${q.id}" tabindex="0" role="button" aria-pressed="${!!draft.answers?.[q.id]}"><div><strong>${q.text}</strong><small>${q.help}</small></div><span class="switch"></span></div>`).join('')}</div><div class="recommendation">선택한 활동을 바탕으로 <strong>${rec.length}개 환경영역</strong>을 추천합니다. 아래에서 직접 추가하거나 제외할 수 있습니다.</div></div>`
   +`<div class="card panel" style="margin-top:16px"><div class="panel-head"><h2>03. 관리할 환경영역</h2><button class="small-link" id="use-recommendation">추천 영역 적용</button></div><div class="grid grid-3">${state.groups.map(g=>`<label class="check-group ${draft.groups.includes(g.id)?'checked':''}"><input type="checkbox" data-group="${g.id}" ${draft.groups.includes(g.id)?'checked':''}><span><strong>${g.icon} ${g.name}</strong><small>${g.hint}${rec.includes(g.id)?' · 추천':''}</small></span></label>`).join('')}</div><div class="notice">선택한 영역의 기본 데이터 항목만 목록에 나타납니다. 필요하면 기록할 때 새 항목을 직접 추가할 수 있습니다.</div></div>`
   +`<div class="card panel" style="margin-top:16px"><div class="panel-head"><h2>04. 사업장과 관리 범위</h2><button class="btn" id="add-site">＋ 사업장 추가</button></div><div class="site-list">${state.sites.map(s=>`<div class="site-row"><div><strong>${esc(s.name)}</strong><small>${esc(s.kind)} · ${esc(s.scope||'범위 메모 없음')}</small></div><button class="icon-delete" data-delete-site="${s.id}">삭제</button></div>`).join('') || empty('등록된 사업장이 없습니다','자료가 어느 사업장에 속하는지 기록하려면 최소 한 곳을 추가하세요.')}</div></div>`;
}

function renderUploadResult(r) {
  const analysis=r.analysis;
  const candidates=analysis?.extractions||r.candidates||[];
  const list=analysis?candidates.map((c,i)=>{
    const value=c.field_value?.value;
    const metric=state.metrics.find(m=>m.id===c.metric_match?.selected_metric_id);
    const label=metric?.name||c.metric_match?.raw_metric_label||'항목 확인 필요';
    const location=c.evidence?.map(e=>[e.location?.page?`${e.location.page}쪽`:'',e.location?.sheet_name||'',e.location?.cell_range||'',e.location?.line_start?`${e.location.line_start}행`:''].filter(Boolean).join(' ')).filter(Boolean).join(', ');
    return `<button class="candidate" data-extraction="${i}"><strong>${esc(label)} · ${esc(value??'값 확인 필요')} ${esc(c.field_value?.raw_unit||'')}</strong><span>${esc(c.period?.raw_text||c.period?.year||'기간 확인 필요')} · ${esc(c.scope?.raw_scope_name||c.scope?.raw_text||'범위 확인 필요')} · ${esc(c.extraction_status)}</span><small>${esc(location||'근거 위치 확인 필요')} · ${esc(c.evidence?.[0]?.raw_text||'근거 문장 확인 필요')}</small></button>`;
  }).join(''):candidates.map((c,i)=>`<button class="candidate" data-candidate="${i}"><strong>${esc(c.value)} ${esc(c.unit)} ${c.date?`· ${esc(c.date)}`:''}</strong>${esc(c.text)}</button>`).join('');
  const preview=/\.(png|jpe?g|webp)$/i.test(r.filename)?`<img src="/api/preview/${r.id}" alt="업로드한 원본 이미지" style="width:100%;max-height:360px;object-fit:contain">`:/\.pdf$/i.test(r.filename)?`<iframe src="/api/preview/${r.id}" title="업로드한 원본 PDF" style="width:100%;height:360px"></iframe>`:`<div class="excerpt">${esc(r.excerpt||'원문 미리보기가 없습니다. 원본 파일을 확인해 주세요.')}</div>`;
  return `<div class="section-head"><h2>추출 결과</h2><span class="pill">${esc(r.method)}</span></div><div class="card panel"><div class="panel-head"><div><h3>${esc(r.filename)}</h3><span class="subtle">원본 파일 보관됨 · 추출 후보 ${candidates.length}개 · 사용자 확인 후 저장</span></div><button class="btn primary" id="manual-from-source">＋ 직접 확인·입력</button></div>${r.analysisError?`<div class="alert">Gemini 분석 실패: ${esc(r.analysisError)}</div>`:''}${analysis?.warnings?.length?`<div class="notice">${analysis.warnings.map(esc).join(' · ')}</div>`:''}<div class="extraction-layout"><div><h3>값 후보</h3><div class="candidate-list">${list||empty('추출된 값이 없습니다','원본을 확인하고 직접 입력해 주세요.')}</div></div><div><h3>원본 확인</h3>${preview}<div style="margin-top:10px"><a class="small-link" href="/api/source/${r.id}">원본 파일 내려받기 ↗</a></div></div></div></div>`;
}

function renderUpload() {
  const r=uploadResult;
  return head('SOURCE DOCUMENTS','자료 업로드','고지서·측정기록·Excel 파일에서 수치 후보를 찾아 검토 화면으로 연결합니다.','<button class="btn" data-go="records">기록 보기</button>')
   +`<div class="grid grid-2"><div class="card panel"><div class="panel-head"><h2>원천자료 올리기</h2><span class="pill">20MB 이하</span></div><label class="upload-zone" id="drop-zone"><span class="upload-icon">⇧</span><strong>파일을 끌어놓거나 클릭해 선택하세요</strong><span>PDF, Excel, CSV, TXT, PNG, JPG, WEBP</span><input type="file" id="file-input" accept=".pdf,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"></label><div class="notice">추출된 값은 초안입니다. 원본과 비교한 뒤 사용자가 저장해야 데이터 기록에 반영됩니다.</div><div class="button-row"><button class="btn primary" id="upload-button">파일 분석하기</button><span id="selected-file" class="subtle"></span></div></div><div class="card panel"><div class="panel-head"><h2>자료 처리 순서</h2></div><div class="site-list"><div class="site-row"><strong>01　기존 업무자료 업로드</strong><small>원본 파일 보관</small></div><div class="site-row"><strong>02　값·단위·날짜 후보 확인</strong><small>자동 추출 초안</small></div><div class="site-row"><strong>03　사업장과 기간 지정</strong><small>사용자 검토</small></div><div class="site-row"><strong>04　데이터베이스 저장</strong><small>연도별 누적</small></div></div><div class="alert" style="margin-top:20px">Gemini가 파일에서 값·단위·기간·사업장과 근거를 추출합니다. 자료는 분석을 위해 Google Gemini API로 전송되며, 결과는 사용자가 확인한 뒤에만 저장됩니다. 3MB를 초과하는 PDF는 텍스트를 읽을 수 있을 때만 분석됩니다.</div></div></div>`
   +(r?renderUploadResult(r):'')
   +`<div class="section-head"><h2>최근 업로드</h2></div><div class="card table-wrap">${state.sources.length?`<table class="recent-table"><thead><tr><th>파일</th><th>업로드 날짜</th><th>처리 방식</th><th>원본</th></tr></thead><tbody>${state.sources.slice(0,10).map(s=>`<tr><td class="metric-name">${esc(s.filename)}</td><td>${esc(s.uploaded_at.slice(0,16).replace('T',' '))}</td><td>${esc(s.extraction_method)}</td><td><a class="small-link" href="/api/source/${s.id}">다운로드</a></td></tr>`).join('')}</tbody></table>`:empty('업로드된 자료가 없습니다','이미 갖고 있는 고지서나 관리대장을 올려보세요.')}</div>`;
}

function filteredRecords() {
  return state.records.filter(r=>(!recordFilter.group||r.group_id===recordFilter.group)&&(!recordFilter.site||r.site_id===recordFilter.site)&&(!recordFilter.year||r.period_end.startsWith(recordFilter.year))&&(!recordFilter.query||`${r.metric_name} ${sourceName(r.source_id)} ${siteName(r.site_id)}`.toLowerCase().includes(recordFilter.query.toLowerCase())));
}
function renderRecords() {
  const list=filteredRecords();
  return head('DATA LIBRARY','환경 데이터 기록','데이터 이름을 중심으로 사업장·기간별 값을 찾아보고 계속 추가하세요.','<button class="btn" data-go="upload">자료 업로드</button><button class="btn primary" id="new-record">＋ 기록 추가</button>')
   +`<div class="filter-bar"><input id="search-record" placeholder="데이터명 또는 증빙 검색" value="${esc(recordFilter.query)}"><select id="filter-group"><option value="">전체 영역</option>${state.groups.map(g=>`<option value="${g.id}" ${recordFilter.group===g.id?'selected':''}>${g.name}</option>`).join('')}</select><select id="filter-site"><option value="">전체 사업장</option>${state.sites.map(s=>`<option value="${s.id}" ${recordFilter.site===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select><select id="filter-year"><option value="">전체 연도</option>${[...new Set(state.records.map(r=>r.period_end.slice(0,4)))].sort().reverse().map(y=>`<option value="${y}" ${recordFilter.year===y?'selected':''}>${y}년</option>`).join('')}</select><span class="push subtle">${list.length}건의 기록</span></div>`
   +`<div class="card table-wrap" id="records-table">${list.length?`<table class="data-table"><thead><tr><th>데이터 항목</th><th>사업장</th><th>기간</th><th>확인값</th><th>증빙자료</th><th>검토일</th><th></th></tr></thead><tbody>${list.map(r=>`<tr><td><div class="metric-name">${esc(r.metric_name)}</div><div class="subtle">${esc(groupName(r.group_id))}</div></td><td>${esc(siteName(r.site_id))}</td><td>${esc(r.period_start)}<br><span class="subtle">~ ${esc(r.period_end)}</span></td><td><strong>${fmt(r.value)} ${esc(r.unit)}</strong></td><td>${r.source_id?`<a class="small-link" href="/api/source/${r.source_id}">${esc(sourceName(r.source_id))}</a>`:'<span class="subtle">직접 입력</span>'}</td><td>${esc(r.verified_at.slice(0,10))}</td><td><button class="icon-delete" data-delete-record="${r.id}">삭제</button></td></tr>`).join('')}</tbody></table>`:empty('조건에 맞는 기록이 없습니다','필터를 바꾸거나 새 값을 추가해 주세요.')}</div>`;
}

function renderInsights() {
  const metrics=selectedMetrics(), recorded=new Set(state.records.map(r=>r.metric_id));
  const years=[...new Set(state.records.map(r=>r.period_end.slice(0,4)))].sort();
  const max=Math.max(1,...years.map(y=>state.records.filter(r=>r.period_end.startsWith(y)).length));
  const missing=metrics.filter(m=>!recorded.has(m.id));
  return head('INSIGHTS','관리 현황과 재활용','빠진 자료를 확인하고, 누적한 데이터를 거래처 요청에 맞게 내보내세요.','<a class="btn" href="/api/backup.json">JSON 백업</a><a class="btn primary" href="/api/export.csv">CSV 내보내기 ↗</a>')
   +`<div class="grid grid-3"><div class="card stat-card"><div class="stat-top">관리영역 <span class="stat-symbol">◇</span></div><div class="stat-value">${state.profile.groups.length}</div><div class="stat-foot">직접 선택한 환경영역</div></div><div class="card stat-card"><div class="stat-top">값이 있는 항목 <span class="stat-symbol">▤</span></div><div class="stat-value">${recorded.size}</div><div class="stat-foot">기록을 시작한 데이터명</div></div><div class="card stat-card"><div class="stat-top">아직 값이 없는 항목 <span class="stat-symbol">◌</span></div><div class="stat-value">${missing.length}</div><div class="stat-foot">기본 항목 기준</div></div></div>`
   +`<div class="grid grid-2" style="margin-top:16px"><div class="card panel"><div class="panel-head"><h2>연도별 축적 기록</h2></div>${years.length?`<div class="year-bars">${years.map(y=>{let n=state.records.filter(r=>r.period_end.startsWith(y)).length;return `<div class="year-bar-wrap"><b>${n}건</b><div class="year-bar" style="height:${Math.max(8,Math.round(n/max*145))}px"></div><small>${y}</small></div>`}).join('')}</div>`:empty('아직 그래프에 표시할 기록이 없습니다','값을 저장하면 연도별 기록 수를 볼 수 있습니다.')}</div><div class="card panel"><div class="panel-head"><h2>영역별 준비 현황</h2></div>${state.groups.filter(g=>state.profile.groups.includes(g.id)).map(g=>{const all=metrics.filter(m=>m.group===g.id),done=all.filter(m=>recorded.has(m.id)).length,p=all.length?Math.round(done/all.length*100):0;return `<div class="area-row"><strong>${g.name}</strong><div class="progress-track"><span style="width:${p}%"></span></div><span>${done}/${all.length}</span></div>`}).join('')||empty('관리 영역이 없습니다','시작하기에서 영역을 선택하세요.')}</div></div>`
   +`<div class="section-head"><h2>우선 확인할 데이터</h2><span class="subtle">선택한 관리영역의 미기록 항목</span></div><div class="card panel">${missing.length?`<div class="grid grid-3">${missing.slice(0,15).map(m=>`<div class="insight-metric"><strong>${esc(m.name)}</strong><div class="line"><span>${esc(groupName(m.group))} · ${esc(m.sourceExample)}</span></div></div>`).join('')}</div>${missing.length>15?`<p class="subtle" style="margin:15px 0 0">외 ${missing.length-15}개 항목</p>`:''}`:empty('현재 선택한 기본 항목이 모두 기록되었습니다','새 자료가 생기면 기간을 달리해 계속 쌓을 수 있습니다.')}</div>`
   +`<div class="notice">이 화면은 자료 준비 현황을 보여줍니다. 온실가스 산정이나 ESG 평가 점수는 계산하지 않습니다. 서로 다른 정의와 단위의 값은 자동으로 합산하지 않습니다.</div>`;
}

function closeDialog() { $('#dialog').close(); }
function openDialog(content) { $('#dialog-content').innerHTML=`<div class="dialog-inner">${content}</div>`; $('#dialog').showModal(); $('#dialog-content').querySelectorAll('[data-close]').forEach(b=>b.onclick=closeDialog); }
function recordDialog(prefill={}) {
  if(!state.sites.length){toast('먼저 사업장을 등록해 주세요.');navigate('setup');return;}
  const metrics=selectedMetrics(), first=metrics[0], metricId=prefill.strict?(prefill.metricId||'custom'):(prefill.metricId||first?.id||'custom');
  let defaultStart=`${state.profile.year||yearNow}-01-01`, defaultEnd=`${state.profile.year||yearNow}-12-31`;
  const dateMatch=String(prefill.date||'').match(/(20\d{2})[-./년 ]+(\d{1,2})(?:[-./월 ]+(\d{1,2}))?/);
  if(dateMatch){const y=Number(dateMatch[1]),m=Number(dateMatch[2]);if(m>=1&&m<=12){const d=dateMatch[3]?Number(dateMatch[3]):1;defaultStart=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;defaultEnd=dateMatch[3]?defaultStart:`${y}-${String(m).padStart(2,'0')}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`}}
  if(prefill.strict){defaultStart=prefill.periodStart||'';defaultEnd=prefill.periodEnd||'';}
  openDialog(`<div class="dialog-title"><div><div class="eyebrow">VERIFY & SAVE</div><h2>환경 데이터 확인</h2></div><button class="close" data-close>×</button></div><p class="muted" style="font-size:12px">원천자료의 값, 기간, 단위, 사업장을 확인한 뒤 저장하세요.</p><form id="record-form" class="form-grid"><label class="field full"><span>데이터 항목</span><select name="metric_id" id="record-metric"><option value="custom">＋ 직접 항목 입력</option>${metrics.map(m=>`<option value="${m.id}" ${metricId===m.id?'selected':''}>${esc(groupName(m.group))} · ${esc(m.name)} (${esc(m.unit)})</option>`).join('')}</select></label><label class="field" id="custom-group-field" style="display:none"><span>관리영역</span><select name="group_id">${state.groups.map(g=>`<option value="${g.id}">${g.name}</option>`).join('')}</select></label><label class="field" id="custom-name-field" style="display:none"><span>새 항목 이름</span><input name="metric_name" placeholder="예: 포장재 사용량"></label><label class="field"><span>사업장</span><select name="site_id" required>${state.sites.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><label class="field"><span>확인한 값</span><input name="value" type="number" step="any" required value="${esc(prefill.value||'')}" placeholder="예: 1250"></label><label class="field"><span>단위</span><input name="unit" required value="${esc(prefill.unit||state.metrics.find(m=>m.id===metricId)?.unit||'')}" placeholder="예: kWh"><small>원자료의 단위를 그대로 기록하세요.</small></label><label class="field"><span>기간 시작</span><input name="period_start" type="date" required value="${esc(defaultStart)}"></label><label class="field"><span>기간 종료</span><input name="period_end" type="date" required value="${esc(defaultEnd)}"></label><label class="field full"><span>증빙 파일</span><select name="source_id"><option value="">파일 연결 없이 입력</option>${state.sources.map(s=>`<option value="${s.id}" ${prefill.sourceId===s.id?'selected':''}>${esc(s.filename)}</option>`).join('')}</select></label><label class="field full"><span>원문 또는 근거 위치</span><textarea name="evidence" placeholder="예: 고지서 2쪽의 사용량 표">${esc(prefill.evidence||'')}</textarea></label><label class="field full"><span>메모</span><input name="notes" placeholder="측정 기준이나 확인할 사항"></label><div class="full button-row" style="justify-content:flex-end"><button type="button" class="btn" data-close>취소</button><button class="btn primary" type="submit">확인하고 저장</button></div></form>`);
  const select=$('#record-metric');
  function customFields(fillUnit=false){const custom=select.value==='custom';$('#custom-group-field').style.display=custom?'block':'none';$('#custom-name-field').style.display=custom?'block':'none';if(fillUnit&&!custom){const m=state.metrics.find(x=>x.id===select.value);if(m) $('#record-form [name="unit"]').value=m.unit;}}
  select.onchange=()=>customFields(true); customFields();
  if(prefill.strict){
    const form=$('#record-form');
    form.elements.site_id.insertAdjacentHTML('afterbegin',`<option value="" ${prefill.siteId?'':'selected'}>사업장 직접 선택</option>`);
    form.elements.site_id.value=prefill.siteId||'';
    form.elements.unit.value=prefill.unit||'';
    form.elements.value.value=prefill.value??'';
    form.elements.metric_name.value=prefill.metricLabel||'';
    if(prefill.groupId)form.elements.group_id.value=prefill.groupId;
    form.elements.notes.value=prefill.note||'';
  }
  $('#record-form').onsubmit=async e=>{e.preventDefault();try{const form=Object.fromEntries(new FormData(e.target));await post('/api/records',form);closeDialog();toast('확인한 값이 저장되었습니다.');await refresh();}catch(error){showError(error)}};
  $('#dialog-content').querySelectorAll('[data-close]').forEach(b=>b.onclick=closeDialog);
}

function bindPage() {
  if(window.GreenCloud) {
    document.querySelectorAll('a[href^="/api/source/"],img[src^="/api/preview/"],iframe[src^="/api/preview/"]').forEach(async el=>{
      const raw=el.getAttribute(el.tagName==='A'?'href':'src');
      const sourceId=raw.split('/').at(-1),url=await window.GreenCloud.sourceUrl(sourceId);
      if(!url)return;
      if(el.tagName==='A'){el.href=url;el.download=sourceName(sourceId)}else el.src=url;
    });
    document.querySelectorAll('a[href="/api/export.csv"],a[href="/api/backup.json"]').forEach(el=>el.onclick=async event=>{
      event.preventDefault();try{const response=await fetch(el.getAttribute('href'));if(!response.ok)throw Error('파일을 만들지 못했습니다.');const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=el.getAttribute('href').endsWith('.csv')?'greendb-records.csv':'greendb-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(error){showError(error)}
    });
  }
  document.querySelectorAll('[data-go]').forEach(el=>el.onclick=()=>navigate(el.dataset.go));
  if(page==='setup') {
    for(const [selector,key] of [['#company-name','name'],['#industry','industry'],['#start-year','year'],['#separate-sites','separate_sites']]) $(selector).onchange=e=>draft[key]=key==='year'?Number(e.target.value):key==='separate_sites'?e.target.value==='true':e.target.value;
    document.querySelectorAll('[data-question]').forEach(el=>{el.onclick=()=>{draft.answers[el.dataset.question]=!draft.answers[el.dataset.question];render();};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click()}}});
    document.querySelectorAll('[data-group]').forEach(el=>el.onchange=()=>{draft.groups=el.checked?[...new Set([...draft.groups,el.dataset.group])]:draft.groups.filter(g=>g!==el.dataset.group);render()});
    $('#use-recommendation').onclick=()=>{draft.groups=recommendation(draft.answers);render();toast('추천 영역을 적용했습니다. 설정 저장을 눌러 확정하세요.')};
    $('#save-profile').onclick=async()=>{try{draft.name=$('#company-name').value.trim();draft.industry=$('#industry').value.trim();draft.year=Number($('#start-year').value);draft.separate_sites=$('#separate-sites').value==='true';if(!draft.name)throw Error('기업명을 입력해 주세요.');await post('/api/profile',draft);draft=null;toast('설정이 저장되었습니다.');await refresh()}catch(error){showError(error)}};
    $('#add-site').onclick=()=>{openDialog(`<div class="dialog-title"><h2>사업장 추가</h2><button class="close" data-close>×</button></div><form id="site-form" class="form-grid"><label class="field full"><span>사업장 이름</span><input name="name" required placeholder="예: 본사, 1공장"></label><label class="field"><span>유형</span><select name="kind"><option>공장</option><option>사무실</option><option>물류센터</option><option>기타</option></select></label><label class="field"><span>관리 범위 메모</span><input name="scope" placeholder="예: 생산동 A·B 포함"></label><div class="full button-row" style="justify-content:flex-end"><button class="btn primary">사업장 저장</button></div></form>`);$('#site-form').onsubmit=async e=>{e.preventDefault();try{await post('/api/sites',Object.fromEntries(new FormData(e.target)));closeDialog();toast('사업장이 추가되었습니다.');await refresh()}catch(error){showError(error)}}};
    document.querySelectorAll('[data-delete-site]').forEach(b=>b.onclick=async()=>{if(!confirm('이 사업장을 삭제할까요?'))return;try{await post('/api/sites/delete',{id:b.dataset.deleteSite});await refresh()}catch(error){showError(error)}});
  }
  if(page==='upload') {
    const input=$('#file-input'),zone=$('#drop-zone');
    input.onchange=()=>$('#selected-file').textContent=input.files[0]?.name||'';
    zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag')};zone.ondragleave=()=>zone.classList.remove('drag');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag');input.files=e.dataTransfer.files;input.onchange()};
    $('#upload-button').onclick=async()=>{if(!input.files[0])return toast('파일을 선택해 주세요.');const button=$('#upload-button');button.disabled=true;button.textContent='분석 중…';try{const data=new FormData();data.append('file',input.files[0]);uploadResult=await api('/api/upload',{method:'POST',body:data});toast('원본 파일이 보관되었습니다. 값을 확인해 주세요.');await refresh()}catch(error){showError(error);button.disabled=false;button.textContent='파일 분석하기'}};
    document.querySelectorAll('[data-candidate]').forEach(b=>b.onclick=()=>{const c=uploadResult.candidates[Number(b.dataset.candidate)];recordDialog({metricId:c.metricId,value:c.value,unit:c.unit,date:c.date,sourceId:uploadResult.id,evidence:`${c.line}행: ${c.text}`})});
    document.querySelectorAll('[data-extraction]').forEach(b=>b.onclick=()=>{
      const x=uploadResult.analysis.extractions[Number(b.dataset.extraction)];
      const metric=x.metric_match,field=x.field_value,period=x.period,scope=x.scope;
      const matched=metric.match_status==='MATCHED'&&state.metrics.some(m=>m.id===metric.selected_metric_id);
      const siteMatched=scope.site_match_status==='MATCHED'&&state.sites.some(s=>s.id===scope.selected_site_id);
      const evidence=x.evidence.map(e=>`${[e.location?.page?`${e.location.page}쪽`:'',e.location?.sheet_name||'',e.location?.cell_range||'',e.location?.line_start?`${e.location.line_start}행`:''].filter(Boolean).join(' ')}: ${e.raw_text}`).join('\n');
      recordDialog({strict:true,metricId:matched?metric.selected_metric_id:'custom',metricLabel:metric.raw_metric_label||'',siteId:siteMatched?scope.selected_site_id:'',value:typeof field.value==='number'?field.value:'',unit:field.raw_unit||'',periodStart:period.start_date||'',periodEnd:period.end_date||'',sourceId:uploadResult.id,evidence,note:typeof field.value==='number'?'':`원문 값: ${field.value??''} (숫자만 저장 가능; 원본 확인 필요)`});
    });
    if($('#manual-from-source')) $('#manual-from-source').onclick=()=>recordDialog({sourceId:uploadResult.id});
  }
  if(page==='records') {
    $('#new-record').onclick=()=>recordDialog();
    for(const [selector,key] of [['#search-record','query'],['#filter-group','group'],['#filter-site','site'],['#filter-year','year']]) $(selector).onchange=e=>{recordFilter[key]=e.target.value;render()};
    $('#search-record').oninput=e=>{recordFilter.query=e.target.value;const pos=e.target.selectionStart;render();const input=$('#search-record');input.focus();input.setSelectionRange(pos,pos)};
    document.querySelectorAll('[data-delete-record]').forEach(b=>b.onclick=async()=>{if(!confirm('이 기록을 삭제할까요?'))return;try{await post('/api/records/delete',{id:b.dataset.deleteRecord});toast('기록을 삭제했습니다.');await refresh()}catch(error){showError(error)}});
  }
}

window.addEventListener('hashchange',()=>{if(location.hash!=='#setup')draft=null;render()});
$('#today').textContent=new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric'}).format(new Date());
$('#help-button').onclick=()=>openDialog(`<div class="dialog-title"><h2>GreenDB 사용 안내</h2><button class="close" data-close>×</button></div><p>① 시작하기에서 기업활동과 사업장을 설정합니다.<br>② 원천자료를 올리고 추출된 값을 원본과 비교합니다.<br>③ 확인한 값을 기간·사업장·증빙과 함께 저장합니다.<br>④ 현황·활용에서 누락 항목을 확인하고 CSV로 내보냅니다.</p><div class="alert">배포본의 기업 자료는 현재 브라우저에 저장됩니다. Gemini 분석 시 파일 또는 추출 텍스트가 Google API로 전송됩니다. ESG 평가나 공시 수치로 사용하기 전에는 담당자가 정의·단위·경계를 검증해야 합니다.</div>`);
refresh().catch(showError);
