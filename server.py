"""Dependency-free local GreenDB MVP server (Python 3.10+)."""
from __future__ import annotations

import cgi
import csv
import io
import json
import re
import shutil
import sqlite3
import subprocess
import sys
import uuid
import zipfile
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

from catalog import GROUPS, METRICS, QUESTIONS

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
UPLOADS = DATA / "uploads"
DB = DATA / "greendb.sqlite3"
MAX_UPLOAD = 20 * 1024 * 1024
ALLOWED = {".pdf", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg", ".webp"}
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def now():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def connect():
    DATA.mkdir(exist_ok=True)
    UPLOADS.mkdir(exist_ok=True)
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS profile (
          id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL DEFAULT '',
          industry TEXT NOT NULL DEFAULT '', year INTEGER NOT NULL DEFAULT 2026,
          answers TEXT NOT NULL DEFAULT '{}', groups TEXT NOT NULL DEFAULT '[]',
          separate_sites INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS sites (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
          scope TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sources (
          id TEXT PRIMARY KEY, filename TEXT NOT NULL, stored_name TEXT NOT NULL,
          type TEXT NOT NULL, uploaded_at TEXT NOT NULL, extracted_text TEXT NOT NULL,
          extraction_method TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY, metric_id TEXT NOT NULL, metric_name TEXT NOT NULL,
          group_id TEXT NOT NULL, site_id TEXT NOT NULL, period_start TEXT NOT NULL,
          period_end TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
          source_id TEXT, evidence TEXT NOT NULL, notes TEXT NOT NULL,
          verified_at TEXT NOT NULL,
          FOREIGN KEY(site_id) REFERENCES sites(id),
          FOREIGN KEY(source_id) REFERENCES sources(id));
    """)
    db.execute("INSERT OR IGNORE INTO profile(id) VALUES(1)")
    db.commit()
    return db


def rows(db, query, args=()):
    return [dict(row) for row in db.execute(query, args)]


def get_state(db):
    profile = dict(db.execute("SELECT * FROM profile WHERE id=1").fetchone())
    profile["answers"] = json.loads(profile["answers"])
    profile["groups"] = json.loads(profile["groups"])
    profile["separate_sites"] = bool(profile["separate_sites"])
    return {"profile": profile, "questions": QUESTIONS, "groups": GROUPS, "metrics": METRICS,
            "sites": rows(db, "SELECT * FROM sites ORDER BY created_at"),
            "sources": rows(db, "SELECT id, filename, type, uploaded_at, extraction_method FROM sources ORDER BY uploaded_at DESC"),
            "records": rows(db, "SELECT * FROM records ORDER BY period_end DESC, verified_at DESC")}


def xlsx_text(blob):
    output = []
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in item.findall(".//m:t", NS)) for item in root.findall("m:si", NS)]
        sheets = sorted(n for n in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n))
        for sheet in sheets[:20]:
            root = ET.fromstring(archive.read(sheet))
            for row in root.findall("m:sheetData/m:row", NS)[:2000]:
                values = []
                for cell in row.findall("m:c", NS)[:80]:
                    value = cell.find("m:v", NS)
                    inline = cell.find("m:is", NS)
                    item = value.text if value is not None else "".join(t.text or "" for t in inline.findall(".//m:t", NS)) if inline is not None else ""
                    if cell.attrib.get("t") == "s" and item:
                        item = shared[int(item)]
                    values.append(item or "")
                if any(values):
                    output.append(" | ".join(values))
    return "\n".join(output)[:300000]


def find_executable(name, extra=()):
    found = shutil.which(name)
    if found:
        return found
    for path in extra:
        if Path(path).exists():
            return str(path)
    return None


def extract(blob, suffix, path):
    if suffix == ".pdf":
        tool = find_executable("pdftotext", [r"C:\Program Files\Git\mingw64\bin\pdftotext.exe"])
        if not tool:
            return "", "PDF 텍스트 추출기 없음 — 수동 입력"
        run = subprocess.run([tool, "-layout", "-enc", "UTF-8", str(path), "-"], capture_output=True, timeout=25)
        return run.stdout.decode("utf-8", errors="replace")[:300000], "PDF 텍스트 추출"
    if suffix == ".xlsx":
        return xlsx_text(blob), "Excel 셀 추출"
    if suffix in {".csv", ".txt"}:
        for encoding in ("utf-8-sig", "cp949", "utf-16"):
            try:
                return blob.decode(encoding)[:300000], "텍스트 추출"
            except UnicodeDecodeError:
                pass
        return blob.decode("utf-8", errors="replace")[:300000], "텍스트 추출"
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        tool = find_executable("tesseract")
        if tool:
            run = subprocess.run([tool, str(path), "stdout", "-l", "kor+eng"], capture_output=True, timeout=35)
            if run.returncode == 0:
                return run.stdout.decode("utf-8", errors="replace")[:300000], "OCR 초안"
        return "", "이미지 미리보기·수동 입력"
    return "", "수동 입력"


NUMBER = re.compile(r"(?<![\d])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\d])")
UNIT = re.compile(r"(tCO₂e|tCO2e|kgCO2e|kWh|MWh|GJ|TJ|Nm³|m³|m3|kg|톤|t|L|%|원|건)", re.I)
DATE = re.compile(r"(20\d{2})[.\-/년 ]+(0?[1-9]|1[0-2])(?:[.\-/월 ]+(0?[1-9]|[12]\d|3[01]))?")


def candidates(text):
    found = []
    for number, line in enumerate(text.splitlines()[:2500], 1):
        line = " ".join(line.split())[:320]
        if not line or len(line) < 4:
            continue
        unit = UNIT.search(line)
        values = NUMBER.findall(line)
        if not values or (not unit and not any(word in line for word in ("사용량", "배출량", "발생량", "취수량", "투입량", "재활용량"))):
            continue
        date = DATE.search(line)
        non_year = [v for v in values if not (len(v) == 4 and v.startswith("20") and 2000 <= int(v) <= 2099)]
        if not non_year:
            continue
        lower = line.lower().replace(" ", "")
        matches = [m for m in METRICS if m["name"].lower().replace(" ", "") in lower]
        found.append({"line": number, "text": line, "value": non_year[-1].replace(",", ""),
                      "unit": unit.group(1) if unit else "", "date": date.group(0) if date else "",
                      "metricId": matches[0]["id"] if matches else ""})
        if len(found) >= 80:
            break
    return found


class Handler(BaseHTTPRequestHandler):
    server_version = "GreenDBMVP/1.0"

    def log_message(self, format, *args):
        print("[%s] %s" % (self.log_date_time_string(), format % args))

    def send_json(self, obj, status=200):
        blob = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(blob)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(blob)

    def error_json(self, message, status=400):
        self.send_json({"error": message}, status)

    def json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1024 * 1024:
            raise ValueError("요청이 너무 큽니다.")
        return json.loads(self.rfile.read(length))

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/state":
                with connect() as db:
                    return self.send_json(get_state(db))
            if path.startswith("/api/source/") or path.startswith("/api/preview/"):
                source_id = path.rsplit("/", 1)[-1]
                with connect() as db:
                    source = db.execute("SELECT * FROM sources WHERE id=?", (source_id,)).fetchone()
                if not source:
                    return self.error_json("자료를 찾을 수 없습니다.", 404)
                blob = (UPLOADS / source["stored_name"]).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", source["type"])
                preview = path.startswith("/api/preview/") and source["type"] in {"application/pdf", "image/png", "image/jpeg", "image/webp"}
                disposition = "inline" if preview else "attachment"
                self.send_header("Content-Disposition", disposition + "; filename*=UTF-8''" + __import__("urllib.parse", fromlist=["quote"]).quote(source["filename"]))
                self.send_header("Content-Length", str(len(blob)))
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                return self.wfile.write(blob)
            if path == "/api/export.csv":
                with connect() as db:
                    data = rows(db, """SELECT r.*, s.name AS site_name, d.filename AS source_name
                        FROM records r JOIN sites s ON s.id=r.site_id
                        LEFT JOIN sources d ON d.id=r.source_id ORDER BY r.period_end DESC""")
                output = io.StringIO()
                fields = ["metric_name", "group_id", "site_name", "period_start", "period_end", "value", "unit", "source_name", "evidence", "notes", "verified_at"]
                writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
                writer.writeheader()
                writer.writerows(data)
                blob = ("\ufeff" + output.getvalue()).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", "attachment; filename=greendb-records.csv")
                self.send_header("Content-Length", str(len(blob)))
                self.end_headers()
                return self.wfile.write(blob)
            if path == "/api/backup.json":
                with connect() as db:
                    payload = get_state(db)
                blob = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Disposition", "attachment; filename=greendb-backup.json")
                self.send_header("Content-Length", str(len(blob)))
                self.end_headers()
                return self.wfile.write(blob)
            if path not in ("/", "/index.html", "/app.css", "/app.js"):
                return self.error_json("페이지를 찾을 수 없습니다.", 404)
            name = "index.html" if path == "/" else path[1:]
            blob = (BASE / "static" / name).read_bytes()
            kind = {".html": "text/html", ".css": "text/css", ".js": "application/javascript"}[Path(name).suffix]
            self.send_response(200)
            self.send_header("Content-Type", kind + "; charset=utf-8")
            self.send_header("Content-Length", str(len(blob)))
            self.end_headers()
            self.wfile.write(blob)
        except Exception as exc:
            self.error_json(str(exc), 500)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/upload":
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_UPLOAD:
                    return self.error_json("파일은 20MB 이하만 업로드할 수 있습니다.")
                form = cgi.FieldStorage(fp=self.rfile, headers=self.headers,
                                        environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers.get("Content-Type", "")})
                field = form["file"] if "file" in form else None
                if field is None or not field.filename:
                    return self.error_json("파일을 선택해 주세요.")
                filename = Path(field.filename).name[:180]
                suffix = Path(filename).suffix.lower()
                if suffix not in ALLOWED:
                    return self.error_json("PDF, Excel, CSV, 텍스트, 이미지 파일만 지원합니다.")
                blob = field.file.read(MAX_UPLOAD + 1)
                if len(blob) > MAX_UPLOAD:
                    return self.error_json("파일은 20MB 이하만 업로드할 수 있습니다.")
                source_id = uuid.uuid4().hex
                stored = source_id + suffix
                file_path = UPLOADS / stored
                file_path.write_bytes(blob)
                try:
                    content, method = extract(blob, suffix, file_path)
                except Exception as exc:
                    content, method = "", f"추출 실패 — 수동 입력 ({exc})"
                type_name = {".pdf": "application/pdf", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             ".csv": "text/csv", ".txt": "text/plain", ".png": "image/png", ".jpg": "image/jpeg",
                             ".jpeg": "image/jpeg", ".webp": "image/webp"}[suffix]
                with connect() as db:
                    db.execute("INSERT INTO sources VALUES(?,?,?,?,?,?,?)", (source_id, filename, stored, type_name, now(), content, method))
                return self.send_json({"id": source_id, "filename": filename, "method": method,
                                       "candidates": candidates(content), "excerpt": content[:8000]})
            body = self.json_body()
            with connect() as db:
                if path == "/api/profile":
                    name = str(body.get("name", "")).strip()[:120]
                    industry = str(body.get("industry", "")).strip()[:120]
                    year = int(body.get("year", datetime.now().year))
                    if not 2000 <= year <= 2100:
                        raise ValueError("관리 시작 연도를 확인해 주세요.")
                    answers = {q["id"]: bool(body.get("answers", {}).get(q["id"])) for q in QUESTIONS}
                    allowed_groups = {g["id"] for g in GROUPS}
                    groups = [g for g in body.get("groups", []) if g in allowed_groups]
                    db.execute("UPDATE profile SET name=?, industry=?, year=?, answers=?, groups=?, separate_sites=? WHERE id=1",
                               (name, industry, year, json.dumps(answers), json.dumps(groups), int(bool(body.get("separate_sites", True)))))
                    return self.send_json({"ok": True})
                if path == "/api/sites":
                    name = str(body.get("name", "")).strip()[:120]
                    if not name:
                        raise ValueError("사업장 이름을 입력해 주세요.")
                    site_id = uuid.uuid4().hex
                    db.execute("INSERT INTO sites VALUES(?,?,?,?,?)", (site_id, name, str(body.get("kind", "사업장"))[:60],
                               str(body.get("scope", ""))[:300], now()))
                    return self.send_json({"id": site_id})
                if path == "/api/records":
                    metric_id = str(body.get("metric_id", ""))
                    metric = next((m for m in METRICS if m["id"] == metric_id), None)
                    if metric:
                        metric_name, group_id = metric["name"], metric["group"]
                    elif metric_id == "custom":
                        metric_name = str(body.get("metric_name", "")).strip()[:120]
                        group_id = str(body.get("group_id", ""))
                    else:
                        raise ValueError("데이터 항목을 선택해 주세요.")
                    if not metric_name or group_id not in {g["id"] for g in GROUPS}:
                        raise ValueError("데이터 항목과 관리영역을 확인해 주세요.")
                    site_id = str(body.get("site_id", ""))
                    if not db.execute("SELECT 1 FROM sites WHERE id=?", (site_id,)).fetchone():
                        raise ValueError("사업장을 선택해 주세요.")
                    start, end = str(body.get("period_start", "")), str(body.get("period_end", ""))
                    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", start) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", end) or start > end:
                        raise ValueError("자료의 시작일과 종료일을 확인해 주세요.")
                    value = float(body.get("value"))
                    if not -1e15 < value < 1e15:
                        raise ValueError("값의 범위를 확인해 주세요.")
                    unit = str(body.get("unit", "")).strip()[:40]
                    if not unit:
                        raise ValueError("단위를 입력해 주세요.")
                    source_id = body.get("source_id") or None
                    if source_id and not db.execute("SELECT 1 FROM sources WHERE id=?", (source_id,)).fetchone():
                        raise ValueError("증빙 자료를 찾을 수 없습니다.")
                    record_id = uuid.uuid4().hex
                    db.execute("INSERT INTO records VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                               (record_id, metric_id, metric_name, group_id, site_id, start, end, value, unit,
                                source_id, str(body.get("evidence", ""))[:1000], str(body.get("notes", ""))[:1000], now()))
                    return self.send_json({"id": record_id})
                if path == "/api/records/delete":
                    db.execute("DELETE FROM records WHERE id=?", (str(body.get("id", "")),))
                    return self.send_json({"ok": True})
                if path == "/api/sites/delete":
                    site_id = str(body.get("id", ""))
                    if db.execute("SELECT 1 FROM records WHERE site_id=?", (site_id,)).fetchone():
                        raise ValueError("기록이 있는 사업장은 삭제할 수 없습니다.")
                    db.execute("DELETE FROM sites WHERE id=?", (site_id,))
                    return self.send_json({"ok": True})
            self.error_json("API를 찾을 수 없습니다.", 404)
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            self.error_json(str(exc))
        except Exception as exc:
            self.error_json(str(exc), 500)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    with connect():
        pass
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"GreenDB MVP: http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
