"""
Download the datasets into ml/data/raw (D108), checked by hash. Run: `uv run python -m rebeat_ml.fetch`.
Every dataset and its license is listed in ml/DATA.md.
"""

import hashlib
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data" / "raw"

AVP_URL = "https://zenodo.org/records/5036529/files/AVP_Dataset.zip?download=1"
AVP_MD5 = "a40f3f3bc9d5bc0f52ab9aa4c13a907e"
BBS1 = "https://archive.org/download/beatboxset1"
BBS1_META = "https://archive.org/metadata/beatboxset1"
SAMPLES_REPO = "jeroenjanssens/beatbox-samples"
SAMPLES_COMMIT = "4c22aaea993cd64c5c7cf91bf319696286cc6d1a"


def md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def get(url: str, dest: Path, expect_md5: str | None = None):
    if dest.exists() and (expect_md5 is None or md5(dest) == expect_md5):
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading {url}", file=sys.stderr)
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    if expect_md5 and md5(tmp) != expect_md5:
        tmp.unlink()
        raise SystemExit(f"{dest.name}: checksum mismatch")
    tmp.rename(dest)


def avp():
    z = ROOT / "AVP_Dataset.zip"
    get(AVP_URL, z, AVP_MD5)
    out = ROOT / "avp"
    if not out.exists():
        with zipfile.ZipFile(z) as f:
            f.extractall(out)


def beatboxset1():
    out = ROOT / "beatboxset1"
    with urllib.request.urlopen(BBS1_META) as r:
        files = json.load(r)["files"]
    for f in files:
        n = f["name"]
        if n.endswith(".wav") or n.startswith("Annotations") or n == "beatboxset1.csv":
            get(f"{BBS1}/{n}", out / n, f.get("md5"))


def beatbox_samples():
    out = ROOT / "beatbox-samples"
    base = f"https://raw.githubusercontent.com/{SAMPLES_REPO}/{SAMPLES_COMMIT}/"
    get(base + "strudel.json", out / "strudel.json")
    spec = json.loads((out / "strudel.json").read_text())
    for key, value in spec.items():
        if key.startswith("_"):
            continue
        for rel in value if isinstance(value, list) else [value]:
            get(base + rel, out / rel)


def main():
    which = sys.argv[1:] or ["avp", "beatboxset1", "beatbox-samples"]
    for name in which:
        {"avp": avp, "beatboxset1": beatboxset1, "beatbox-samples": beatbox_samples}[name]()


if __name__ == "__main__":
    main()
