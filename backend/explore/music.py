"""Song search for trip soundtracks, via Apple's iTunes Search API.

Free and keyless. We only store a song's details (title, artist, cover, link)
and Apple's own 30-second preview URL. The preview streams straight from
Apple's servers, always with a link back to the song on Apple Music, which is
what Apple's preview terms ask for — Safar never downloads or re-hosts audio.
"""

import requests
from django.core.cache import cache

SEARCH_URL = "https://itunes.apple.com/search"
LOOKUP_URL = "https://itunes.apple.com/lookup"
TIMEOUT = 8
# The Indian storefront, so the catalogue (and links) match Indian listeners.
COUNTRY = "IN"


class MusicError(Exception):
    """Apple's search was unreachable, or the song doesn't exist."""


def _get(url: str, params: dict) -> list[dict]:
    try:
        response = requests.get(url, params={**params, "country": COUNTRY}, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise MusicError("Couldn't reach Apple Music right now.") from exc
    return [r for r in response.json().get("results", []) if r.get("kind") == "song"]


def _song(result: dict) -> dict:
    """The few details we keep and show for a song."""
    link = result.get("trackViewUrl", "").replace("&uo=4", "").replace("?uo=4", "")
    return {
        "id": str(result["trackId"]),
        "title": result.get("trackName", ""),
        "artist": result.get("artistName", ""),
        "album": result.get("collectionName", ""),
        "image": result.get("artworkUrl100", "").replace("100x100bb", "300x300bb"),
        "url": link,
        # Apple's embeddable player for the same song.
        "embed_url": link.replace("https://music.apple.com/", "https://embed.music.apple.com/"),
        # A ~30 second clip hosted by Apple — what the story page plays.
        "preview_url": result.get("previewUrl", ""),
    }


def search(query: str, limit: int = 8) -> list[dict]:
    query = query.strip()
    if len(query) < 2:
        return []
    key = f"music:search:{query.lower()}:{limit}"
    cached = cache.get(key)
    if cached is not None:
        return cached
    songs = [_song(r) for r in _get(SEARCH_URL, {"term": query, "media": "music", "entity": "song", "limit": limit})]
    cache.set(key, songs, 60 * 60 * 6)
    return songs


def song(song_id: str) -> dict:
    """Look a song up by id, so what we store always comes from Apple — not
    from whatever the client sent."""
    if not str(song_id).isdigit():
        raise MusicError("That doesn't look like a song.")
    results = _get(LOOKUP_URL, {"id": song_id})
    if not results:
        raise MusicError("Couldn't find that song.")
    return _song(results[0])
