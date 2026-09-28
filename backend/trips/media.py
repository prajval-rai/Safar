"""Turning stored images into links a browser or phone can load.

With Google Cloud Storage configured, an upload's `.url` is already a full
https://storage.googleapis.com/... link. On local disk it's a path like
/media/memories/x.jpg, which only works when prefixed with the API's own
host — the frontend runs on a different one.
"""


def absolute_url(url: str, request=None) -> str:
    if not url or url.startswith(("http://", "https://")) or request is None:
        return url or ""
    return request.build_absolute_uri(url)


def memory_photo_url(memory, request=None) -> str:
    """The picture behind a gallery memory: the uploaded file, or its link."""
    if memory.image:
        return absolute_url(memory.image.url, request)
    return memory.image_url or ""
