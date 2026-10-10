"""Build the browser-storage Vercel edition from the local MVP UI."""
import json
import shutil
from pathlib import Path

from catalog import GROUPS, METRICS, QUESTIONS

root = Path(__file__).resolve().parent
public = root / "public"
public.mkdir(exist_ok=True)
shutil.copyfile(root / "static" / "app.css", public / "app.css")
script = (root / "static" / "app.js").read_text(encoding="utf-8")
script = script.replace("이미지에서 문자를 자동 읽으려면 이 컴퓨터에 Tesseract OCR이 필요합니다. 설치되지 않은 경우 원본 파일을 보며 직접 입력할 수 있습니다.",
                        "이미지 자료는 원본 미리보기를 보며 직접 입력할 수 있습니다. 텍스트 PDF는 브라우저에서 값 후보를 추출합니다.")
script = script.replace("이 MVP는 로컬 컴퓨터에서만 실행됩니다. ESG 평가나 법적 공시 수치로 사용하기 전에는 담당자가 정의·단위·경계를 검증해야 합니다.",
                        "배포본의 기업 자료는 현재 브라우저에만 저장됩니다. 다른 기기와 동기화되지 않으니 주기적으로 내보내 백업하세요. ESG 평가나 공시 수치로 사용하기 전에는 담당자가 정의·단위·경계를 검증해야 합니다.")
(public / "app.js").write_text(script, encoding="utf-8")
shutil.copyfile(root / "web" / "cloud.js", public / "cloud.js")
vendor = public / "vendor"
vendor.mkdir(exist_ok=True)
for name in ("pdf.mjs", "pdf.worker.mjs", "LICENSE"):
    shutil.copyfile(root / "web" / "vendor" / name, vendor / name)
html = (root / "static" / "index.html").read_text(encoding="utf-8")
html = html.replace('<script src="/app.js" defer></script>', '<script src="/cloud.js" defer></script>\n  <script src="/app.js" defer></script>')
html = html.replace("이 컴퓨터에 저장 중", "이 브라우저에 저장 중")
(public / "index.html").write_text(html, encoding="utf-8")
(public / "catalog.json").write_text(json.dumps({"groups": GROUPS, "metrics": METRICS, "questions": QUESTIONS}, ensure_ascii=False), encoding="utf-8")
print(f"Vercel site ready: {public}")
