"""Trip soundtracks: searching Apple Music and attaching a song to a story.
Apple is never actually called — requests.get is mocked."""

from unittest import mock

from django.core.cache import cache
from rest_framework.test import APIClient

from explore.models import TravelPost
from trips.tests import SafarTestCase

KESARIYA = {
    "kind": "song",
    "trackId": 1635014240,
    "trackName": "Kesariya",
    "artistName": "Pritam & Arijit Singh",
    "collectionName": "Brahmastra",
    "artworkUrl100": "https://is1-ssl.mzstatic.com/x/100x100bb.jpg",
    "trackViewUrl": "https://music.apple.com/in/album/kesariya/1635013814?i=1635014240&uo=4",
    "previewUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/preview.m4a",
}


def apple(results):
    response = mock.Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {"results": results}
    return mock.patch("explore.music.requests.get", return_value=response)


class SoundtrackTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.post = TravelPost.objects.create(author=self.friend, trip=self.trip, caption="What a trip.")

    def test_search_returns_songs_for_signed_in_travellers_only(self):
        with apple([KESARIYA]):
            response = self.client_for(self.friend).get("/api/music/search/?q=kesariya")
        self.assertEqual(response.status_code, 200)
        song = response.data[0]
        self.assertEqual(song["title"], "Kesariya")
        self.assertIn("300x300bb", song["image"])
        self.assertTrue(song["embed_url"].startswith("https://embed.music.apple.com/"))
        self.assertNotIn("uo=4", song["url"])
        self.assertTrue(song["preview_url"].endswith(".m4a"))
        self.assertEqual(APIClient().get("/api/music/search/?q=kesariya").status_code, 401)

    def test_the_author_can_add_and_remove_a_song(self):
        client = self.client_for(self.friend)
        with apple([KESARIYA]):
            response = client.patch(f"/api/explore/posts/{self.post.id}/", {"song_id": "1635014240"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["soundtrack"]["artist"], "Pritam & Arijit Singh")

        response = client.patch(f"/api/explore/posts/{self.post.id}/", {"song_id": ""}, format="json")
        self.assertIsNone(response.data["soundtrack"])

    def test_an_unknown_song_is_rejected(self):
        with apple([]):
            response = self.client_for(self.friend).patch(
                f"/api/explore/posts/{self.post.id}/", {"song_id": "999"}, format="json"
            )
        self.assertEqual(response.status_code, 400)

    def test_nobody_can_edit_someone_elses_post(self):
        response = self.client_for(self.owner).patch(
            f"/api/explore/posts/{self.post.id}/", {"caption": "Hijacked"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.post.refresh_from_db()
        self.assertEqual(self.post.caption, "What a trip.")

    def test_a_trip_write_up_can_carry_a_song_to_the_feed(self):
        client = self.client_for(self.owner)
        for activity in (self.a1, self.a2, self.a3):
            client.post(f"/api/activities/{activity.id}/complete/")
        with apple([KESARIYA]):
            response = client.post(
                f"/api/trips/{self.trip.id}/experience/",
                {"text": "Sunsets, forts and far too much fish curry.", "song_id": "1635014240"},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        post = TravelPost.objects.get(experience__user=self.owner)
        self.assertEqual(post.soundtrack["title"], "Kesariya")

        # Editing the words later keeps the song.
        client.post(f"/api/trips/{self.trip.id}/experience/", {"text": "Sunsets and forts, mostly."}, format="json")
        post.refresh_from_db()
        self.assertEqual(post.soundtrack["title"], "Kesariya")

    def test_an_older_song_gets_its_preview_when_the_story_is_opened(self):
        self.post.soundtrack = {"id": "1635014240", "title": "Kesariya", "artist": "Pritam", "url": "x"}
        self.post.save()
        with apple([KESARIYA]):
            story = APIClient().get(f"/api/explore/posts/{self.post.id}/story/").data
        self.assertTrue(story["post"]["soundtrack"]["preview_url"].endswith(".m4a"))
