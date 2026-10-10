import {readFileSync, writeFileSync, copyFileSync} from 'node:fs';

const read = path => readFileSync(path, 'utf8');
copyFileSync('static/app.css', 'public/app.css');
copyFileSync('web/cloud.js', 'public/cloud.js');
let script=read('static/app.js');
script=script.replace('이미지에서 문자를 자동 읽으려면 이 컴퓨터에 Tesseract OCR이 필요합니다. 설치되지 않은 경우 원본 파일을 보며 직접 입력할 수 있습니다.', 'Gemini가 파일에서 값·단위·기간·사업장과 근거를 추출합니다. 자료는 분석을 위해 Google Gemini API로 전송되며, 결과는 사용자가 확인한 뒤에만 저장됩니다. 3MB를 초과하는 PDF는 텍스트를 읽을 수 있을 때만 분석됩니다.');
script=script.replace('이 MVP는 로컬 컴퓨터에서만 실행됩니다. ESG 평가나 법적 공시 수치로 사용하기 전에는 담당자가 정의·단위·경계를 검증해야 합니다.', '배포본의 기업 자료는 현재 브라우저에 저장됩니다. Gemini 분석 시 파일 또는 추출 텍스트가 Google API로 전송됩니다. ESG 평가나 공시 수치로 사용하기 전에는 담당자가 정의·단위·경계를 검증해야 합니다.');
writeFileSync('public/app.js',script);
let html=read('static/index.html');
html=html.replace('<script src="/app.js" defer></script>','<script src="/cloud.js" defer></script>\n  <script src="/app.js" defer></script>');
html=html.replace('이 컴퓨터에 저장 중','이 브라우저에 저장 중');
writeFileSync('public/index.html',html);
console.log('Vercel site ready: public');
