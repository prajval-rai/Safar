"""Publishing a trip as a track is an on/off switch: one track per trip."""

from explore.models import Track
from trips.tests import SafarTestCase

URL = "/api/explore/tracks/from-trip/"


class TrackToggleTests(SafarTestCase):
    def publish(self, published=True, user=None):
        return self.client_for(user or self.owner).post(
            URL, {"trip": str(self.trip.id), "published": published}, format="json"
        )

    def test_publishing_twice_keeps_one_track_and_pays_once(self):
        first = self.publish()
        self.assertEqual(first.status_code, 201)
        self.assertGreater(first.data["xp_awarded"], 0)
        again = self.publish()
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["xp_awarded"], 0)
        self.assertEqual(again.data["track"]["id"], first.data["track"]["id"])
        self.assertEqual(Track.objects.filter(source_trip=self.trip).count(), 1)

    def test_switching_off_hides_it_and_on_brings_the_same_one_back(self):
        track_id = self.publish().data["track"]["id"]
        self.publish(False)
        self.assertFalse(Track.objects.get(pk=track_id).is_published)
        listing = self.client_for(self.friend).get("/api/explore/tracks/")
        ids = [t["id"] for t in listing.data.get("results", listing.data)]
        self.assertNotIn(track_id, ids)

        back = self.publish(True)
        self.assertEqual(back.data["track"]["id"], track_id)
        self.assertEqual(back.data["xp_awarded"], 0)
        self.assertTrue(Track.objects.get(pk=track_id).is_published)
        self.assertEqual(Track.objects.filter(source_trip=self.trip).count(), 1)

    def test_switching_off_before_publishing_does_nothing(self):
        res = self.publish(False)
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["track"])
        self.assertFalse(Track.objects.exists())

    def test_trip_detail_says_whether_it_is_published(self):
        detail = self.client_for(self.owner).get(f"/api/trips/{self.trip.id}/")
        self.assertIsNone(detail.data["my_track"])
        track_id = self.publish().data["track"]["id"]
        detail = self.client_for(self.owner).get(f"/api/trips/{self.trip.id}/")
        self.assertEqual(detail.data["my_track"], {"id": track_id, "is_published": True})
        # Another member hasn't published it themselves.
        self.assertIsNone(self.client_for(self.friend).get(f"/api/trips/{self.trip.id}/").data["my_track"])
