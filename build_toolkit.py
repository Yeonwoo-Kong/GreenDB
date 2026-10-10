"""Package only reviewed GreenDB source and deployment files."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
output = root.parent / "GreenDB_MVP_Toolkit.zip"
top = "GreenDB_MVP_Toolkit"
files = [
    ".gitignore", ".vercelignore", "README.md", "TOOLKIT_GUIDE.md",
    "THIRD_PARTY_NOTICES.md", "start.bat", "server.py", "catalog.py",
    "build_vercel.py", "build_vercel.mjs", "build_toolkit.py", "vercel.json",
]
for folder in ("static", "web", "public", "api", "extraction", "tests"):
    files.extend(str(path.relative_to(root)) for path in (root / folder).rglob("*") if path.is_file() and path.name != "GreenDB_MVP_Toolkit.zip")

with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for relative in sorted(files):
        source = (root / relative).resolve()
        if root.resolve() not in source.parents or not source.is_file():
            raise ValueError(f"Invalid toolkit member: {relative}")
        archive.write(source, f"{top}/{Path(relative).as_posix()}")

with ZipFile(output) as archive:
    bad = archive.testzip()
    if bad:
        raise RuntimeError(f"Damaged ZIP member: {bad}")
    names = archive.namelist()
    if any("/data/" in name or "/.vercel/" in name or "/__pycache__/" in name for name in names):
        raise RuntimeError("Private or temporary files in toolkit")

print(f"Created {output} ({output.stat().st_size:,} bytes, {len(names)} files)")
