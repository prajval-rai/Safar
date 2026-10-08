"""What a photo is, beyond its bytes: a perceptual hash, and its EXIF.

A SHA-256 of the file changes if one pixel does, so re-saving or nudging a
picture made it "new" and worth XP again. The perceptual hash (a dHash — how
brightness changes across a 9×8 thumbnail) stays the same through re-saving,
resizing, recompressing and small edits, so those are caught as repeats.

EXIF (when the phone kept it) says when and where the picture was taken —
evidence the admin sees when reviewing a past trip.
"""

from datetime import datetime

from django.utils import timezone
from PIL import Image, ExifTags

# Hashes this many bits apart or fewer are the same picture.
SAME_PHOTO_BITS = 6


def dhash(image) -> str:
    """16 hex characters for an uploaded image file, or "" if it can't be read."""
    try:
        image.seek(0)
        with Image.open(image) as img:
            small = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
            pixels = list(small.getdata())
    except Exception:
        return ""
    finally:
        image.seek(0)
    bits = 0
    for row in range(8):
        for col in range(8):
            left, right = pixels[row * 9 + col], pixels[row * 9 + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    # A plain, featureless image hashes to (nearly) all zeros or all ones —
    # every blank picture would look like every other, so it says nothing.
    if bin(bits).count("1") <= SAME_PHOTO_BITS or bin(bits).count("1") >= 64 - SAME_PHOTO_BITS:
        return ""
    return f"{bits:016x}"


def same_photo(a: str, b: str) -> bool:
    if not a or not b:
        return False
    return bin(int(a, 16) ^ int(b, 16)).count("1") <= SAME_PHOTO_BITS


def _ratio(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return float(value[0]) / float(value[1])


def _degrees(dms, ref) -> float | None:
    try:
        d, m, s = (_ratio(x) for x in dms)
    except Exception:
        return None
    value = d + m / 60 + s / 3600
    return -value if ref in ("S", "W") else value


def exif_details(image) -> dict:
    """{"taken_at": datetime | None, "latitude": float | None, "longitude": float | None}."""
    found = {"taken_at": None, "latitude": None, "longitude": None}
    try:
        image.seek(0)
        with Image.open(image) as img:
            exif = img.getexif()
            if not exif:
                return found
            tags = {ExifTags.TAGS.get(k, k): v for k, v in exif.items()}
            tags.update({ExifTags.TAGS.get(k, k): v for k, v in exif.get_ifd(0x8769).items()})
            raw = tags.get("DateTimeOriginal") or tags.get("DateTime")
            if raw:
                try:
                    found["taken_at"] = timezone.make_aware(datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S"))
                except ValueError:
                    pass
            gps = {ExifTags.GPSTAGS.get(k, k): v for k, v in exif.get_ifd(0x8825).items()}
            if "GPSLatitude" in gps and "GPSLongitude" in gps:
                lat = _degrees(gps["GPSLatitude"], gps.get("GPSLatitudeRef", "N"))
                lng = _degrees(gps["GPSLongitude"], gps.get("GPSLongitudeRef", "E"))
                if lat is not None and lng is not None and -90 <= lat <= 90 and -180 <= lng <= 180:
                    found["latitude"], found["longitude"] = lat, lng
    except Exception:
        pass
    finally:
        image.seek(0)
    return found
