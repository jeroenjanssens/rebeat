"""The classes the model knows (D107), in output order, and how each dataset's labels map to them."""

CLASSES = ["kick", "snare", "hihat", "openhat", "tom", "clap", "crash", "other"]
NAMES = {
    "kick": "Kick",
    "snare": "Snare",
    "hihat": "Closed hi-hat",
    "openhat": "Open hi-hat",
    "tom": "Tom",
    "clap": "Clap",
    "crash": "Crash",
    "other": "Other",
}
INDEX = {c: i for i, c in enumerate(CLASSES)}

# AVP: kd, sd, hhc, hho
AVP = {"kd": "kick", "sd": "snare", "hhc": "hihat", "hho": "openhat"}

# beatboxset1 (Stowell 2008); "?" is dropped
BEATBOXSET1 = {
    "k": "kick",
    "hc": "hihat",
    "ho": "openhat",
    "sb": "snare",
    "sk": "snare",
    "s": "snare",
    "br": "other",
    "m": "other",
    "v": "other",
    "x": "other",
}

# Jeroen's beatbox-samples: strudel.json keys
BEATBOX_SAMPLES = {
    "kick": "kick",
    "snare": "snare",
    "hihat": "hihat",
    "tom": "tom",
    "clap": "clap",
    "snap": "clap",
    "crash": "crash",
}


def from_name(name: str) -> str | None:
    """A class from a file or strudel key name ("kick2", "Open hat", "hh_o"), else None."""
    n = name.lower().replace("-", "").replace("_", "").replace(" ", "").rstrip("0123456789")
    table = [
        ("openhat", ("openhat", "openhihat", "ohh", "hho", "oh")),
        ("hihat", ("hihat", "hat", "hh", "hhc", "closedhat", "ch")),
        ("kick", ("kick", "kd", "bd", "bassdrum")),
        ("snare", ("snare", "sd", "sn")),
        ("tom", ("tom", "lt", "mt", "ht")),
        ("clap", ("clap", "cp", "snap", "rim", "rimshot")),
        ("crash", ("crash", "cymbal", "cy", "ride")),
    ]
    for cls, keys in table:
        if n in keys:
            return cls
    return None
