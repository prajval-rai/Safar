"""Following, public profiles and the travel map."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Follow
from explore.models import TravelPost
from rewards.services import _stats, seed_achievements
from trips.models import Activity, Day, Trip, TripMember

User = get_user_model()


class SocialTestCase(TestCase):
    def setUp(self):
        seed_achievements()
        self.me = User.objects.create_user(
            "me", password="x", display_name="Me", email="me@x.in", phone="999"
        )
        self.ann = User.objects.create_user("ann", password="x", display_name="Ann Rao")
        self.bob = User.objects.create_user("bob", password="x", display_name="Bob")

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def make_trip(self, owner, title="Goa", status="completed", public=True, coords=(15.49, 73.83)):
        trip = Trip.objects.create(
            title=title,
            destination=title,
            region="Goa",
            start_date=date.today() - timedelta(days=5),
            end_date=date.today() - timedelta(days=4),
            status=status,
            is_public=public,
            latitude=coords[0] if coords else None,
            longitude=coords[1] if coords else None,
            area_radius_km=20,
            created_by=owner,
        )
        TripMember.objects.create(trip=trip, user=owner, role="owner")
        Day.objects.create(trip=trip, index=1, date=trip.start_date)
        return trip

    def stop(self, trip, user, verified=True, lat=15.5, lng=73.8):
        return Activity.objects.create(
            day=trip.days.first(),
            title="Beach",
            place_name="Beach",
            latitude=lat,
            longitude=lng,
            status="completed",
            completed_by=user,
            verified_by_location=verified,
        )


class FollowTests(SocialTestCase):
    def test_follow_and_unfollow(self):
        client = self.client_for(self.me)
        first = client.post("/api/users/ann/follow/")
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.data["is_following"])
        self.assertEqual(first.data["followers_count"], 1)

        gone = client.delete("/api/users/ann/follow/")
        self.assertFalse(gone.data["is_following"])
        self.assertEqual(gone.data["followers_count"], 0)

    def test_following_twice_does_not_double_count(self):
        client = self.client_for(self.me)
        client.post("/api/users/ann/follow/")
        response = client.post("/api/users/ann/follow/")
        self.assertEqual(response.data["followers_count"], 1)
        self.assertEqual(Follow.objects.count(), 1)

    def test_you_cannot_follow_yourself(self):
        self.assertEqual(self.client_for(self.me).post("/api/users/me/follow/").status_code, 400)

    def test_unknown_user_is_a_404(self):
        self.assertEqual(self.client_for(self.me).post("/api/users/nobody/follow/").status_code, 404)

    def test_followers_and_following_lists_know_who_i_follow(self):
        Follow.objects.create(follower=self.me, following=self.ann)
        Follow.objects.create(follower=self.bob, following=self.ann)
        client = self.client_for(self.me)

        followers = client.get("/api/users/ann/followers/").data
        self.assertEqual({p["username"] for p in followers}, {"me", "bob"})
        by_name = {p["username"]: p for p in followers}
        self.assertTrue(by_name["me"]["is_me"])
        self.assertFalse(by_name["bob"]["is_following"])

        following = client.get("/api/users/me/following/").data
        self.assertEqual([p["username"] for p in following], ["ann"])
        self.assertTrue(following[0]["is_following"])

    def test_profile_shows_counts_and_never_leaks_contact_details(self):
        Follow.objects.create(follower=self.ann, following=self.me)
        Follow.objects.create(follower=self.me, following=self.bob)

        data = self.client_for(self.ann).get("/api/users/me/").data
        self.assertEqual(data["followers_count"], 1)
        self.assertEqual(data["following_count"], 1)
        self.assertNotIn("email", data["user"])
        self.assertNotIn("phone", data["user"])
        self.assertFalse(data["is_me"])
        self.assertTrue(self.client_for(self.me).get("/api/users/me/").data["is_me"])

    def test_five_followers_unlock_local_hero(self):
        for i in range(5):
            fan = User.objects.create_user(f"fan{i}", password="x")
            self.client_for(fan).post("/api/users/me/follow/")
        titles = [
            a["title"] for a in self.client_for(self.me).get("/api/users/me/").data["achievements"]
        ]
        self.assertIn("Local Hero", titles)

    def test_search_finds_people_by_display_name_and_says_if_i_follow_them(self):
        Follow.objects.create(follower=self.me, following=self.ann)
        results = self.client_for(self.me).get("/api/users/search/?q=Rao").data
        self.assertEqual([r["username"] for r in results], ["ann"])
        self.assertTrue(results[0]["is_following"])

    def test_following_filter_on_posts(self):
        Follow.objects.create(follower=self.me, following=self.ann)
        TravelPost.objects.create(author=self.ann, caption="From Ann")
        TravelPost.objects.create(author=self.bob, caption="From Bob")

        everyone = self.client_for(self.me).get("/api/explore/posts/").data["results"]
        following = self.client_for(self.me).get("/api/explore/posts/?following=1").data["results"]
        self.assertEqual(len(everyone), 2)
        self.assertEqual([p["caption"] for p in following], ["From Ann"])


class TravelMapTests(SocialTestCase):
    def test_finished_trips_become_areas_and_verified_stops_become_pins(self):
        trip = self.make_trip(self.me, "Goa")
        self.stop(trip, self.me, verified=True)
        self.stop(trip, self.me, verified=False, lat=15.6)  # organiser override: not plotted

        data = self.client_for(self.me).get("/api/users/me/travel-map/").data
        self.assertEqual(len(data["areas"]), 1)
        self.assertEqual(data["areas"][0]["radius_km"], 20)
        self.assertEqual(len(data["places"]), 1)
        self.assertEqual(data["areas_covered"], 1)

    def test_finished_list_covers_every_visible_trip_even_without_coordinates(self):
        public = self.make_trip(self.me, "Goa", public=True)
        private = self.make_trip(self.me, "Secret", public=False)
        public.latitude = public.longitude = None
        public.save()
        mine = self.client_for(self.me).get("/api/users/me/travel-map/").data
        self.assertEqual({t["destination"] for t in mine["finished"]}, {"Goa", "Secret"})
        theirs = self.client_for(self.ann).get("/api/users/me/travel-map/").data
        self.assertEqual([t["destination"] for t in theirs["finished"]], ["Goa"])
        self.assertNotIn(str(private.id), [t["trip_id"] for t in theirs["finished"]])

    def test_unfinished_trips_are_not_plotted_as_covered_areas(self):
        self.make_trip(self.me, "Manali", status="active")
        data = self.client_for(self.me).get("/api/users/me/travel-map/").data
        self.assertEqual(data["areas"], [])

    def test_other_people_only_see_public_trips(self):
        public = self.make_trip(self.me, "Goa", public=True)
        private = self.make_trip(self.me, "Secret", public=False)
        self.stop(public, self.me)
        self.stop(private, self.me, lat=10.0, lng=76.0)

        theirs = self.client_for(self.ann).get("/api/users/me/travel-map/").data
        self.assertEqual([a["title"] for a in theirs["areas"]], ["Goa"])
        self.assertEqual(len(theirs["places"]), 1)

        mine = self.client_for(self.me).get("/api/users/me/travel-map/").data
        self.assertEqual(len(mine["areas"]), 2)

    def test_profile_stats_respect_privacy_too(self):
        self.make_trip(self.me, "Goa", public=True)
        self.make_trip(self.me, "Secret", public=False)
        seen_by_ann = self.client_for(self.ann).get("/api/users/me/").data["stats"]
        seen_by_me = self.client_for(self.me).get("/api/users/me/").data["stats"]
        self.assertEqual(seen_by_ann["trips_completed"], 1)
        self.assertEqual(seen_by_me["trips_completed"], 2)

    def test_old_trips_without_coordinates_are_offered_for_lookup_to_their_organiser_only(self):
        self.make_trip(self.me, "Hampi", coords=None)
        mine = self.client_for(self.me).get("/api/users/me/travel-map/").data
        self.assertEqual([t["destination"] for t in mine["needs_coords"]], ["Hampi"])
        self.assertEqual(mine["areas"], [])

        theirs = self.client_for(self.ann).get("/api/users/me/travel-map/").data
        self.assertEqual(theirs["needs_coords"], [])

    def test_areas_covered_counts_distinct_destinations(self):
        for place in ("Goa", "Jaipur", "Leh"):
            self.make_trip(self.me, place)
        self.assertEqual(_stats(self.me)["areas_covered"], 3)


class WritePostTests(SocialTestCase):
    def test_anyone_can_post_without_a_trip(self):
        res = self.client_for(self.me).post(
            "/api/explore/posts/", {"caption": "Sunrise at Pushkar", "place": "Pushkar"}, format="json"
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["author"]["username"], self.me.username)

    def test_cannot_attach_someone_elses_trip(self):
        theirs = self.make_trip(self.ann, "Goa")
        res = self.client_for(self.me).post(
            "/api/explore/posts/", {"caption": "Hi", "trip": str(theirs.id)}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("trip", res.data)

    def test_empty_caption_is_rejected_and_posts_can_be_filtered_by_author(self):
        client = self.client_for(self.me)
        self.assertEqual(client.post("/api/explore/posts/", {"caption": "   "}, format="json").status_code, 400)
        client.post("/api/explore/posts/", {"caption": "Mine"}, format="json")
        found = self.client_for(self.ann).get(f"/api/explore/posts/?author={self.me.username}").data
        rows = found["results"] if isinstance(found, dict) else found
        self.assertEqual([p["caption"] for p in rows], ["Mine"])

    def test_only_trip_members_get_a_link_to_the_trip(self):
        trip = self.make_trip(self.me, "Goa", public=True)
        self.client_for(self.me).post(
            "/api/explore/posts/", {"caption": "Beach day", "trip": str(trip.id)}, format="json"
        )
        def flag(user):
            data = self.client_for(user).get("/api/explore/posts/").data
            return (data["results"] if isinstance(data, dict) else data)[0]["can_open_trip"]
        self.assertTrue(flag(self.me))
        self.assertFalse(flag(self.ann))
