from rebeat_ml.classes import CLASSES, from_name


def test_names():
    assert from_name("kick2") == "kick"
    assert from_name("Open hat") == "openhat"
    assert from_name("hh_c") == "hihat"
    assert from_name("snap") == "clap"
    assert from_name("laser") is None


def test_classes_match_the_app():
    from pathlib import Path
    import re

    ts = (Path(__file__).resolve().parents[2] / "src/library/beatbox/classes.ts").read_text()
    block = ts[ts.index("BEATBOX_CLASSES = [") : ts.index("] as const")]
    assert re.findall(r'"(\w+)"', block) == CLASSES
