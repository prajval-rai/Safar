"""A photo earns XP once, ever — re-uploading the same picture earns nothing."""

import shutil
import tempfile
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from rewards.services import MEMORY_XP
from trips.models import Memory, Trip, TripMember
from trips.tests import SafarTestCase


def png(color) -> bytes:
    """A real (tiny) PNG — uploads are checked to be genuine images."""
    buffer = BytesIO()
    Image.new("RGB", (8, 8), color).save(buffer, format="PNG")
    return buffer.getvalue()


PHOTO = png((255, 120, 0))


TEST_MEDIA = tempfile.mkdtemp(prefix="safar-test-media-")


# Uploads land in a throwaway folder, never the real media directory.
@override_settings(MEDIA_ROOT=TEST_MEDIA)
class PhotoXPTests(SafarTestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA, ignore_errors=True)

    def upload(self, user, trip=None, content=PHOTO, name="sunset.png"):
        trip = trip or self.trip
        return self.client_for(user).post(
            f"/api/trips/{trip.id}/memories/",
            {"image": SimpleUploadedFile(name, content, content_type="image/png"), "caption": "Sunset"},
            format="multipart",
        )

    def test_the_first_upload_earns_one_xp(self):
        response = self.upload(self.friend)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["xp_awarded"], MEMORY_XP)
        self.assertFalse(response.data["duplicate_photo"])

    def test_the_same_photo_again_earns_nothing_for_anyone(self):
        self.upload(self.friend)
        self.friend.refresh_from_db()
        before = self.friend.xp

        again = self.upload(self.friend, name="renamed-copy.png")
        self.assertEqual(again.status_code, 201)
        self.assertEqual(again.data["xp_awarded"], 0)
        self.assertTrue(again.data["duplicate_photo"])

        # Someone else, on another trip, uploading the same picture: still nothing.
        other = Trip.objects.create(
            title="Another", destination="Goa", start_date=self.trip.start_date,
            end_date=self.trip.end_date, created_by=self.owner,
        )
        TripMember.objects.create(trip=other, user=self.owner, role="owner")
        self.assertEqual(self.upload(self.owner, trip=other).data["xp_awarded"], 0)

        self.friend.refresh_from_db()
        self.assertEqual(self.friend.xp, before)
        # The duplicate is still saved — it just didn't earn anything.
        self.assertEqual(Memory.objects.filter(is_original=False).count(), 2)

    def test_a_different_photo_earns_again(self):
        self.upload(self.friend)
        self.assertEqual(self.upload(self.friend, content=png((0, 90, 200))).data["xp_awarded"], MEMORY_XP)

    def test_linked_photos_are_tracked_too(self):
        client = self.client_for(self.friend)
        url = f"/api/trips/{self.trip.id}/memories/"
        first = client.post(url, {"image_url": "https://example.com/fort.jpg"}, format="json")
        second = client.post(url, {"image_url": "https://example.com/fort.jpg"}, format="json")
        self.assertEqual(first.data["xp_awarded"], MEMORY_XP)
        self.assertEqual(second.data["xp_awarded"], 0)

    def test_repeat_uploads_do_not_count_towards_shutterbug(self):
        for _ in range(3):
            self.upload(self.friend)
        from rewards.services import _stats

        self.assertEqual(_stats(self.friend)["photos_uploaded"], 1)
