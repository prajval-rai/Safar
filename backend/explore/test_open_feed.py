"""The Feed and shared posts are readable without an account."""

from rest_framework.test import APIClient

from explore.models import TravelPost
from trips.models import Memory
from trips.tests import SafarTestCase


class OpenFeedTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.post = TravelPost.objects.create(
            author=self.friend, trip=self.trip, caption="Sunset at the fort was unreal.", place="Goa"
        )
        Memory.objects.create(trip=self.trip, user=self.friend, image_url="https://example.com/a.jpg", caption="Fort")

    def test_anyone_can_read_the_feed_but_not_post_or_like(self):
        anon = APIClient()
        feed = anon.get("/api/explore/posts/")
        self.assertEqual(feed.status_code, 200)
        self.assertEqual(feed.data["results"][0]["caption"], "Sunset at the fort was unreal.")
        self.assertFalse(feed.data["results"][0]["liked"])
        self.assertEqual(anon.get("/api/explore/posts/?following=1").data["results"], [])
        self.assertEqual(anon.post("/api/explore/posts/", {"caption": "hi"}, format="json").status_code, 401)
        self.assertEqual(anon.post(f"/api/explore/posts/{self.post.id}/like/").status_code, 401)

    def test_a_stale_token_still_reads_the_feed(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer expired")
        self.assertEqual(client.get("/api/explore/posts/").status_code, 200)

    def test_a_shared_post_shows_the_trip_only_when_it_is_public(self):
        anon = APIClient()
        story = anon.get(f"/api/explore/posts/{self.post.id}/story/").data
        self.assertEqual(story["post"]["caption"], "Sunset at the fort was unreal.")
        self.assertIsNone(story["trip"])

        self.trip.is_public = True
        self.trip.save()
        story = anon.get(f"/api/explore/posts/{self.post.id}/story/").data
        self.assertEqual(story["trip"]["title"], "Goa Weekend")
        self.assertEqual(story["trip"]["photos"][0]["image_url"], "https://example.com/a.jpg")
        self.assertEqual(story["trip"]["days"][0]["stops"][0]["title"], "Beach")
        # No join code on the public page.
        self.assertNotIn("join_code", story["trip"])
