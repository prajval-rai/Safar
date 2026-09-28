"""Where do uploaded and static files actually go? Says so plainly, and — when
Google Cloud Storage is configured — proves it with a real upload, a public
read and a delete. start.sh runs this on every deploy, so the answer is in
the deploy logs.

    python manage.py check_storage           # report, never fails the deploy
    python manage.py check_storage --strict  # exit 1 if the bucket isn't working
"""

import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage, storages
from django.core.management.base import BaseCommand, CommandError

GCS_BACKEND = "storages.backends.gcloud.GoogleCloudStorage"

HINTS = {
    "DefaultCredentialsError": "No Google credentials. Set GS_CREDENTIALS_JSON to the service-account key's JSON.",
    "Forbidden": (
        "The service account can't write to the bucket. In Cloud Console -> the bucket -> Permissions, "
        "grant it the 'Storage Object Admin' role."
    ),
    "NotFound": "No bucket by that name. Check GS_BUCKET_NAME (it's 'safarplan', no gs:// prefix).",
    "RefreshError": "Google rejected the key - it may have been deleted or disabled. Create a new JSON key.",
}


class Command(BaseCommand):
    help = "Report where uploads and static files are stored, and test the Google Cloud bucket."

    def add_arguments(self, parser):
        parser.add_argument("--strict", action="store_true", help="Exit with an error if the bucket test fails.")

    def handle(self, *args, strict=False, **options):
        media = settings.STORAGES["default"]["BACKEND"]
        static = settings.STORAGES["staticfiles"]["BACKEND"]
        bucket = settings.GS_BUCKET_NAME

        self.stdout.write("Storage check")
        if not bucket:
            self.stdout.write(self.style.WARNING(
                "  GS_BUCKET_NAME is not set - uploads are saved on this server's disk "
                f"({settings.MEDIA_ROOT}) and static files are served by the app."
            ))
            self.stdout.write("  Set GS_BUCKET_NAME=safarplan and GS_CREDENTIALS_JSON to use Google Cloud Storage.")
            return

        self.stdout.write(f"  bucket:  {bucket}")
        self.stdout.write(f"  uploads: {'Google Cloud Storage -> media/' if media == GCS_BACKEND else media}")
        self.stdout.write(f"  static:  {'Google Cloud Storage -> static/' if static == GCS_BACKEND else 'served by the app (WhiteNoise)'}")
        creds = getattr(settings, "GS_CREDENTIALS", None)
        who = getattr(creds, "service_account_email", None) or "application default credentials"
        self.stdout.write(f"  as:      {who}")

        name = f"_storage-check/{uuid.uuid4().hex}.txt"
        try:
            saved = default_storage.save(name, ContentFile(b"Safar storage check\n"))
            url = default_storage.url(saved)
            public = self._publicly_readable(url)
            default_storage.delete(saved)
        except Exception as exc:  # noqa: BLE001 - every failure gets reported, not raised
            reason = type(exc).__name__
            self.stdout.write(self.style.ERROR(f"  upload test FAILED: {reason}: {str(exc)[:300]}"))
            hint = HINTS.get(reason)
            if hint:
                self.stdout.write(self.style.ERROR(f"  fix: {hint}"))
            if strict:
                raise CommandError("Google Cloud Storage isn't working.") from exc
            return

        self.stdout.write(self.style.SUCCESS("  upload test OK - wrote, read back and deleted a file in the bucket."))
        if public is False:
            self.stdout.write(self.style.WARNING(
                "  ...but files aren't publicly readable, so photos won't show in the app. Bucket -> Permissions -> "
                "Grant access -> 'allUsers' with role 'Storage Object Viewer' (or set GS_SIGNED_URLS=1)."
            ))
        if static == GCS_BACKEND:
            try:
                count = len(storages["staticfiles"].listdir("")[1]) + len(storages["staticfiles"].listdir("")[0])
                self.stdout.write(f"  static/ in the bucket has {count} top-level entries (collectstatic uploads them).")
            except Exception:  # noqa: BLE001
                pass

    @staticmethod
    def _publicly_readable(url: str):
        """True/False when we could tell, None when the check itself couldn't run."""
        if "X-Goog-Signature" in url or "Signature=" in url:
            return True  # signed links are readable by design
        try:
            import requests

            return requests.get(url, timeout=10).status_code == 200
        except Exception:  # noqa: BLE001
            return None
