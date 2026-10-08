"""The Explore map's pins, and the feed's Popular sort."""

from datetime import date, timedelta

from explore.models import PostLike, Track, TrackDay, TrackStop, TravelPost
from trips.tests import SafarTestCase


class ExploreMapTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.track = Track.objects.create(title="Goa beaches", destination="Goa", author=self.owner)
        day = TrackDay.objects.create(track=self.track, index=1)
        TrackStop.objects.create(track_day=day, title="No pin", order=0)
        TrackStop.objects.create(track_day=day, title="Baga", latitude=15.55, longitude=73.75, order=1)
        Track.objects.create(title="Nowhere", destination="?", author=self.owner)  # no pinned stop: no pin

        self.trip.open_to_join = True
        self.trip.start_date = date.today() + timedelta(days=5)
        self.trip.end_date = self.trip.start_date + timedelta(days=2)
        self.trip.latitude, self.trip.longitude = 15.49, 73.83
        self.trip.save()

    def test_tracks_sit_at_their_first_pinned_stop_and_open_trips_at_their_destination(self):
        pins = self.client_for(self.friend).get("/api/explore/map/").json()
        by_kind = {(p["kind"], p["title"]): p for p in pins}
        self.assertEqual(len(pins), 2)
        track = by_kind[("track", "Goa beaches")]
        self.assertEqual((track["latitude"], track["longitude"]), (15.55, 73.75))
        trip = by_kind[("trip", "Goa Weekend")]
        self.assertEqual((trip["latitude"], trip["longitude"]), (15.49, 73.83))

    def test_search_and_kind_narrow_it(self):
        client = self.client_for(self.friend)
        self.assertEqual([p["kind"] for p in client.get("/api/explore/map/?kind=tracks").json()], ["track"])
        self.assertEqual(client.get("/api/explore/map/?q=jaipur").json(), [])


class PopularPostTests(SafarTestCase):
    def test_popular_puts_the_most_liked_first(self):
        quiet = TravelPost.objects.create(author=self.owner, caption="Quiet one")
        loved = TravelPost.objects.create(author=self.owner, caption="Loved one")
        for user in (self.friend, self.stranger):
            PostLike.objects.create(post=loved, user=user)
        results = self.client_for(self.friend).get("/api/explore/posts/?sort=popular").json()["results"]
        self.assertEqual([p["id"] for p in results][:2], [str(loved.id), str(quiet.id)])
