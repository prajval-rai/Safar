"""The first photo in a trip's gallery becomes the trip's picture everywhere."""

import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from explore.models import TravelPost
from trips.test_photo_xp import png
from trips.tests import SafarTestCase

TEST_MEDIA = tempfile.mkdtemp(prefix="safar-test-cover-")


@override_settings(MEDIA_ROOT=TEST_MEDIA)
class GalleryCoverTests(SafarTestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA, ignore_errors=True)

    def upload(self, user, color, name):
        return self.client_for(user).post(
            f"/api/trips/{self.trip.id}/memories/",
            {"image": SimpleUploadedFile(name, png(color), content_type="image/png"), "caption": name},
            format="multipart",
        )

    def cover(self, path=None):
        return self.client_for(self.owner).get(path or f"/api/trips/{self.trip.id}/").data["cover_image"]

    def test_planned_cover_until_the_gallery_has_a_photo(self):
        self.trip.cover_image = "https://example.com/place.jpg"
        self.trip.save()
        self.assertEqual(self.cover(), "https://example.com/place.jpg")

    def test_first_gallery_photo_becomes_the_cover_and_stays_first(self):
        self.trip.cover_image = "https://example.com/place.jpg"
        self.trip.save()
        self.upload(self.friend, (255, 0, 0), "first.png")
        self.upload(self.owner, (0, 0, 255), "second.png")

        cover = self.cover()
        self.assertTrue(cover.startswith("http"), cover)
        self.assertIn("first", cover)
        # The same picture on the trip list and home, not just the trip page.
        listed = self.client_for(self.owner).get("/api/trips/").data["results"][0]
        self.assertEqual(listed["cover_image"], cover)

    def test_deleting_the_first_photo_promotes_the_next(self):
        self.upload(self.owner, (255, 0, 0), "first.png")
        self.upload(self.owner, (0, 0, 255), "second.png")
        self.trip.memories.get(caption="first.png").delete()
        self.assertIn("second", self.cover())

    def test_a_linked_photo_counts_too(self):
        self.client_for(self.owner).post(
            f"/api/trips/{self.trip.id}/memories/", {"image_url": "https://example.com/view.jpg"}, format="json"
        )
        self.assertEqual(self.cover(), "https://example.com/view.jpg")

    def test_trip_posts_in_the_feed_show_the_gallery_cover(self):
        post = TravelPost.objects.create(author=self.owner, trip=self.trip, caption="What a trip")
        own = TravelPost.objects.create(
            author=self.owner, trip=self.trip, caption="Mine", image_url="https://example.com/mine.jpg"
        )
        self.upload(self.owner, (255, 0, 0), "first.png")

        feed = {p["id"]: p for p in self.client_for(self.owner).get("/api/explore/posts/").data["results"]}
        self.assertIn("first", feed[str(post.id)]["image_url"])
        # A post with its own picture keeps it.
        self.assertEqual(feed[str(own.id)]["image_url"], "https://example.com/mine.jpg")
