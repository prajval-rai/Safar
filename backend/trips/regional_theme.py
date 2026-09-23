"""What colour palette a trip wears, purely from where it's headed.

Nine palettes total — the original five plus four added for places distinct
enough to deserve their own look — each one a real, designed CSS theme
(frontend/src/app/globals.css), not a per-city one-off. Matching goes from
most specific to least:

  1. a well-known city/destination by name ("Goa", "Pink City", "Manali"…)
  2. the state itself, for anywhere not called out by name
  3. the site's own default, for anywhere outside India or with no region set

Everyone looking at a trip — the organiser, a member, someone who just joined
with the invite code — reads the same `Trip.theme`, so it's always the same
for all of them.
"""

import re

# Famous nicknames and specific cities/towns, checked before the state-level
# fallback. Matched by substring, so "Jaipur, Rajasthan" or "Pink City Tour"
# both hit "pink city" / "jaipur" correctly.
CITY_THEMES: dict[str, str] = {
    # beach — turquoise water, sunset gold
    "goa": "beach",
    "panaji": "beach",
    "panjim": "beach",
    "calangute": "beach",
    "baga": "beach",
    "anjuna": "beach",
    "gokarna": "beach",
    "varkala": "beach",
    "kovalam": "beach",
    "diu": "beach",
    "puri": "beach",
    # pinkcity — Jaipur specifically, rose pink and gold
    "pink city": "pinkcity",
    "jaipur": "pinkcity",
    # metro — the big cosmopolitan hubs, bold and modern
    "mumbai": "metro",
    "bombay": "metro",
    "navi mumbai": "metro",
    "new delhi": "metro",
    "gurugram": "metro",
    "gurgaon": "metro",
    "noida": "metro",
    "bengaluru": "metro",
    "bangalore": "metro",
    "hyderabad": "metro",
    "chennai": "metro",
    "pune": "metro",
    # forest — hill stations, wildlife, trekking through jungle rather than snow
    "coorg": "forest",
    "kodagu": "forest",
    "wayanad": "forest",
    "munnar": "forest",
    "ooty": "forest",
    "udhagamandalam": "forest",
    "kodaikanal": "forest",
    "chikmagalur": "forest",
    "corbett": "forest",
    "ranthambore": "forest",
    "kaziranga": "forest",
    "bandhavgarh": "forest",
    "periyar": "forest",
    "thekkady": "forest",
    "bandipur": "forest",
    # himalaya — the mountains and the passes through them, by name
    "manali": "himalaya",
    "leh": "himalaya",
    "kashmir": "himalaya",
    "srinagar": "himalaya",
    "shimla": "himalaya",
    "manikaran": "himalaya",
    "kasol": "himalaya",
    "spiti": "himalaya",
    "darjeeling": "himalaya",
    "gangtok": "himalaya",
    "rishikesh": "himalaya",
    "haridwar": "himalaya",
    "nainital": "himalaya",
    "mussoorie": "himalaya",
    "dharamshala": "himalaya",
    "mcleodganj": "himalaya",
    "auli": "himalaya",
    # backwater — Kerala's coast and canals, and the south's other coastal cities
    "kochi": "backwater",
    "cochin": "backwater",
    "alleppey": "backwater",
    "alappuzha": "backwater",
    "kumarakom": "backwater",
    "kollam": "backwater",
    "thiruvananthapuram": "backwater",
    "trivandrum": "backwater",
    "pondicherry": "backwater",
    "puducherry": "backwater",
    "andaman": "backwater",
    "lakshadweep": "backwater",
    # terracotta — Rajasthan's other cities and the desert belt
    "udaipur": "terracotta",
    "jodhpur": "terracotta",
    "jaisalmer": "terracotta",
    "pushkar": "terracotta",
    "mount abu": "terracotta",
    "bikaner": "terracotta",
    # saffron — the spiritual heartland, by name (state-level already covers UP/Delhi)
    "varanasi": "saffron",
    "banaras": "saffron",
    "ayodhya": "saffron",
    "mathura": "saffron",
    "vrindavan": "saffron",
    "bodh gaya": "saffron",
    # peacock — a couple of specific cities in already-peacock states, for clarity
    "kolkata": "peacock",
    "amritsar": "peacock",
}

# Every state/UT, grouped into the same nine palettes, for anywhere not
# called out by name above.
STATE_THEMES: dict[str, str] = {
    # beach — Goa is small enough that its state and its "city" are the same place
    "goa": "beach",
    # backwater — coastal & tropical south/west coast + islands
    "kerala": "backwater",
    "karnataka": "backwater",
    "tamil nadu": "backwater",
    "andhra pradesh": "backwater",
    "lakshadweep": "backwater",
    "andaman and nicobar islands": "backwater",
    "dadra and nagar haveli and daman and diu": "backwater",
    # terracotta — clay red & desert gold, arid north/central India
    "rajasthan": "terracotta",
    "gujarat": "terracotta",
    "madhya pradesh": "terracotta",
    "chhattisgarh": "terracotta",
    "haryana": "terracotta",
    "telangana": "terracotta",
    # himalaya — the mountains and the northeast
    "himachal pradesh": "himalaya",
    "uttarakhand": "himalaya",
    "jammu and kashmir": "himalaya",
    "ladakh": "himalaya",
    "sikkim": "himalaya",
    "arunachal pradesh": "himalaya",
    "assam": "himalaya",
    "meghalaya": "himalaya",
    "manipur": "himalaya",
    "mizoram": "himalaya",
    "nagaland": "himalaya",
    "tripura": "himalaya",
    # peacock — the eastern/central heartland
    "west bengal": "peacock",
    "bihar": "peacock",
    "jharkhand": "peacock",
    "odisha": "peacock",
    "maharashtra": "peacock",
    "punjab": "peacock",
    "chandigarh": "peacock",
    # saffron — the site's own default
    "delhi": "saffron",
    "nct of delhi": "saffron",
    "uttar pradesh": "saffron",
}

DEFAULT_TRIP_THEME = "saffron"

# Every theme id this module can return — kept in one place so callers (and
# tests) don't have to enumerate CITY_THEMES/STATE_THEMES themselves.
ALL_TRIP_THEMES = sorted({*CITY_THEMES.values(), *STATE_THEMES.values(), DEFAULT_TRIP_THEME})

_WORD = re.compile(r"[a-z]+")


def _match(key: str, table: dict[str, str]) -> str | None:
    """Exact match first, then whole-word matching against the table's keys —
    never a raw substring. A raw substring would misfire on real places:
    "Goalpara" (Assam) contains "goa", "Puri" could stray into "pur" endings,
    and so on. A single-word key ("goa", "mumbai") must match a whole word in
    the input; a multi-word key ("pink city", "mount abu") must appear as a
    whole phrase in the input's words, so ordering and adjacency still count."""
    if not key:
        return None
    if key in table:
        return table[key]
    words = _WORD.findall(key)
    if not words:
        return None
    word_set = set(words)
    joined = " ".join(words)
    for name, theme in table.items():
        name_words = name.split()
        if len(name_words) == 1:
            if name_words[0] in word_set:
                return theme
        elif f" {name} " in f" {joined} ":
            return theme
    return None


def theme_for_trip(destination: str, region: str) -> str:
    """The theme id for a trip — the destination's own name first (so "Goa"
    or "Pink City" gets its specific look), then its state, then the site
    default. Both inputs are matched case/space-insensitively."""
    by_city = _match((destination or "").strip().lower(), CITY_THEMES)
    if by_city:
        return by_city
    by_state = _match((region or "").strip().lower(), STATE_THEMES)
    if by_state:
        return by_state
    return DEFAULT_TRIP_THEME


def theme_for_region(region: str) -> str:
    """State-only lookup — kept for anything that only has a region on hand,
    e.g. a profile-level default with no single destination to point at."""
    return _match((region or "").strip().lower(), STATE_THEMES) or DEFAULT_TRIP_THEME
