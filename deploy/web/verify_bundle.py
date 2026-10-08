"""Verify the reviewed public web bundle; never read local app data or auth files."""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import time

ROOT = Path(__file__).resolve().parent
PROJECT = "examstudio-shared-bank"
SITE = "https://examstudio-shared-bank.pages.dev/"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def manifest():
    data = json.loads((ROOT / "bundle-manifest.json").read_text(encoding="utf-8"))
    if data["project"] != PROJECT or data["productionBranch"] != "main" or data["site"] != SITE:
        raise ValueError("Unexpected deployment target")
    return data


def bundle(data):
    archive = ROOT / data["archive"]
    if archive.parent != ROOT or digest(archive.read_bytes()) != data["archiveSHA256"]:
        raise ValueError("Bundle checksum differs from the reviewed ZIP")
    with zipfile.ZipFile(archive) as zipped:
        names = zipped.namelist()
        if len(names) != len(set(names)) or set(names) != set(data["assets"]):
            raise ValueError("Bundle file list differs from the reviewed ZIP")
        result = {}
        for name in names:
            relative = PurePosixPath(name)
            if relative.is_absolute() or ".." in relative.parts or "\\" in name or ":" in name:
                raise ValueError("Invalid bundle path")
            info = zipped.getinfo(name)
            if info.file_size > 25 * 1024 * 1024 or (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("Unsupported bundle member")
            content = zipped.read(name)
            if digest(content) != data["assets"][name]:
                raise ValueError("Bundle asset checksum differs: " + name)
            result[name] = content
    engine = json.loads(result['python/export-engine.json'])
    if engine.get('schema') != 1 or engine.get('engineId') != data['engineId']:
        raise ValueError('Export engine identity differs from review')
    for name, expected in engine['assets'].items():
        if digest(result['python/'+name]) != expected:
            raise ValueError('Export engine file differs: '+name)
    return result


def classify_live(actual, data, deployed=False):
    names = [name for name in data["assets"] if name != "_headers"] if deployed else data["baselinePublicAssets"]
    candidate = {name: data["assets"][name] for name in names}
    if actual == candidate:
        return "reviewed bundle already published"
    if not deployed and actual == data["baselinePublicAssets"]:
        return "reviewed production baseline unchanged"
    raise ValueError("Production changed since review; stop and reconcile the newer assets")


def check_live(data, deployed=False):
    def read(name):
        url = SITE + urllib.parse.quote(name) + "?examstudio_bundle=" + data["archiveSHA256"] + "&attempt=" + str(time.time_ns())
        request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "ExamStudio-Deployment-Verification"})
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read(25 * 1024 * 1024 + 1)
        if len(content) > 25 * 1024 * 1024:
            raise ValueError("Unexpected public asset size")
        return name, digest(content)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        names = [name for name in data["assets"] if name != "_headers"] if deployed else data["baselinePublicAssets"]
        actual = dict(pool.map(read, names))
    print(classify_live(actual, data, deployed), "-", len(actual), "asset hashes verified")
    return actual


def check_project():
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not re.fullmatch(r"[a-fA-F0-9]{32}", account) or not token:
        raise ValueError("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in GitHub Actions secrets")
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/{PROJECT}"
    request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise ValueError(f"Existing project lookup failed (HTTP {error.code}); no project will be created") from None
    project = result.get("result") or {}
    if not result.get("success") or project.get("name") != PROJECT or project.get("production_branch") != "main":
        raise ValueError("Existing Pages project or production branch differs; no deployment")
    print("Existing Pages project and main production branch confirmed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "live", "deployed", "project"])
    parser.add_argument("--destination", type=Path)
    args = parser.parse_args()
    data = manifest()
    if args.mode == "project":
        check_project()
    elif args.mode == "prepare":
        files = bundle(data)
        if args.destination:
            destination = args.destination.resolve()
            if destination.exists():
                raise ValueError("Extraction target already exists; refusing to overwrite")
            destination.mkdir(parents=True)
            for name, content in files.items():
                target = destination.joinpath(*PurePosixPath(name).parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
        print("Reviewed bundle verified:", len(files), "assets,", data["archiveSHA256"])
    else:
        attempts = 8 if args.mode == "deployed" else 1
        for attempt in range(attempts):
            try:
                check_live(data, args.mode == "deployed")
                break
            except (ValueError, urllib.error.URLError):
                if attempt == attempts-1: raise
                time.sleep(5)


if __name__ == "__main__":
    main()
