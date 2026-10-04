"""Verify an isolated public release; no network/dependencies."""
from hashlib import sha256
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "RELEASE_MANIFEST.json").read_text(encoding="utf-8"))
errors = []
def check(value, message):
    if not value: errors.append(message)
def local(origin, value):
    if value.startswith(("#", "data:", "blob:", "mailto:", "https:", "http:")) or "${" in value:
        return
    check(not value.startswith("/"), f"Ruta incompatible con subcarpeta: {origin}:{value}")
    path = (origin.parent / unquote(urlsplit(value).path)).resolve()
    check(path.is_relative_to(ROOT), f"Ruta fuera de entrega: {origin}:{value}")
    check(path.is_file(), f"Dependencia ausente: {origin.relative_to(ROOT)}:{value}")
listed = manifest["files"]
actual = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_file()
          and ".git" not in p.parts and "__pycache__" not in p.parts
          and p.name != "RELEASE_MANIFEST.json"}
check(actual == set(listed), f"Inventario distinto: {sorted(actual ^ set(listed))}")
modules = 0
for name, record in listed.items():
    p = ROOT / name
    check(p.is_file(), f"Falta {name}")
    if not p.is_file(): continue
    check(not p.is_symlink(), f"Enlace simbólico {name}")
    check(sha256(p.read_bytes()).hexdigest() == record["sha256"], f"SHA distinto: {name}")
    check(p.stat().st_size == record["bytes"], f"Tamaño distinto: {name}")
    if p.suffix not in (".mjs", ".html", ".css", ".md", ".json", ".py", ".yml"): continue
    text = p.read_text(encoding="utf-8")
    check(not re.search(r"(?i)(?<![a-z])[a-z]:[\\/]", text), f"Ruta absoluta de equipo: {name}")
    if p.suffix == ".mjs":
        modules += 1
        for value in re.findall(r"(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)[\"']([^\"']+)[\"']", text, re.MULTILINE):
            if value.startswith("node:"): continue
            check(value.startswith("."), f"Dependencia externa: {name}:{value}")
            local(p, value)
        for value in re.findall(r"new URL\(\s*[\"']([^\"']+)[\"']\s*,\s*import.meta.url", text): local(p, value)
        # Static assets inside UI template strings are relative to app/index.html.
        for value in re.findall(r"(?:src|href)=[\"']([^\"']+)[\"']", text): local(ROOT / "app/index.html", value)
    elif p.suffix == ".html":
        for value in re.findall(r"(?:src|href)=[\"']([^\"']+)[\"']", text): local(p, value)
    elif p.suffix == ".css":
        for value in re.findall(r"url\(\s*[\"']?([^\s\"')]+)", text): local(p, value)
    elif p.suffix == ".md":
        for value in re.findall(r"\]\(([^)]+)\)", text): local(p, value)
for name in ("game_config.json", "provinces_2023.json", "events.json"):
    check((ROOT / "data" / name).read_bytes() == (ROOT / "app/data" / name).read_bytes(), f"Copia pública distinta: {name}")
    json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))
for folder in (ROOT / "app/data/legacy").iterdir():
    for name in ("game_config.json", "provinces_2023.json", "events.json"):
        check((ROOT / "data/legacy" / folder.name / name).read_bytes() == (folder / name).read_bytes(), f"Copia histórica distinta: {folder.name}/{name}")
check(not any(part in {"evidence", "backups", "corpus", "archive", "memories", "browser-profile"}
              for name in listed for part in Path(name).parts), "Contenido privado en inventario")
check(manifest["rulesVersion"] == "0.8.5", "Edición distinta")
check(json.loads((ROOT / "app/data/game_config.json").read_text(encoding="utf-8"))["rulesVersion"] == manifest["rulesVersion"], "Reglas incoherentes")
report = {"status": "FAIL" if errors else "PASS", "files": len(listed), "moduleFiles": modules,
          "rulesVersion": manifest["rulesVersion"], "sourceChecksum": manifest["sourceChecksum"], "errors": errors}
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(bool(errors))
