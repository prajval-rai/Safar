"""Writing about a finished trip, and the Home prompt that asks for it."""

from datetime import date

from rewards.services import EXPERIENCE_XP
from trips.tests import SafarTestCase


class ExperienceTests(SafarTestCase):
    def finish_trip(self):
        client = self.client_for(self.owner)
        for activity in (self.a1, self.a2, self.a3):
            client.post(f"/api/activities/{activity.id}/complete/")

    def write(self, user, text="Loved every minute of the beach and the fort."):
        return self.client_for(user).post(
            f"/api/trips/{self.trip.id}/experience/", {"text": text}, format="json"
        )

    def test_cannot_write_before_the_trip_is_finished(self):
        self.assertEqual(self.write(self.friend).status_code, 400)

    def test_home_asks_about_a_finished_trip_until_you_write(self):
        self.finish_trip()
        home = self.client_for(self.friend).get("/api/home/")
        prompt = home.data["experience_prompt"]
        self.assertEqual(prompt["trip"]["title"], "Goa Weekend")
        self.assertGreater(prompt["xp_earned"], 0)

        self.assertEqual(self.write(self.friend).status_code, 201)
        home = self.client_for(self.friend).get("/api/home/")
        self.assertIsNone(home.data["experience_prompt"])
        # Someone else writing doesn't answer it for the owner.
        self.assertIsNotNone(self.client_for(self.owner).get("/api/home/").data["experience_prompt"])

    def test_first_write_up_earns_xp_and_editing_does_not(self):
        self.finish_trip()
        self.friend.refresh_from_db()
        before = self.friend.xp

        first = self.write(self.friend)
        self.assertEqual(first.data["xp_awarded"], EXPERIENCE_XP)
        again = self.write(self.friend, "Actually the fort was the best part of it.")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["xp_awarded"], 0)

        self.friend.refresh_from_db()
        self.assertEqual(self.friend.xp, before + EXPERIENCE_XP)
        summary = self.client_for(self.owner).get(f"/api/trips/{self.trip.id}/summary/")
        self.assertEqual(len(summary.data["experiences"]), 1)
        self.assertIn("fort", summary.data["experiences"][0]["text"])

    def test_too_short_is_rejected(self):
        self.finish_trip()
        self.assertEqual(self.write(self.friend, "ok").status_code, 400)

    def test_strangers_cannot_write(self):
        self.finish_trip()
        self.assertEqual(self.write(self.stranger).status_code, 404)

    def test_skipping_stops_the_prompt_for_that_trip_only(self):
        self.finish_trip()
        client = self.client_for(self.friend)
        self.assertEqual(client.post(f"/api/trips/{self.trip.id}/experience/skip/").status_code, 204)
        self.assertIsNone(client.get("/api/home/").data["experience_prompt"])
        # A skip isn't a write-up: nothing shows on the trip story.
        summary = client.get(f"/api/trips/{self.trip.id}/summary/")
        self.assertEqual(summary.data["experiences"], [])

    def test_writing_after_skipping_still_earns_the_xp(self):
        self.finish_trip()
        self.client_for(self.friend).post(f"/api/trips/{self.trip.id}/experience/skip/")
        response = self.write(self.friend)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["xp_awarded"], EXPERIENCE_XP)

    def test_a_finished_trip_is_not_shown_as_live_on_its_last_day(self):
        self.trip.start_date = self.trip.end_date = date.today()
        self.trip.save()
        self.finish_trip()
        home = self.client_for(self.owner).get("/api/home/")
        self.assertIsNone(home.data["live_trip"])
        self.assertEqual(home.data["experience_prompt"]["trip"]["title"], "Goa Weekend")

    def test_a_write_up_is_shared_to_the_feed_and_edits_keep_it_in_step(self):
        self.finish_trip()
        self.write(self.friend)
        feed = self.client_for(self.owner).get("/api/explore/posts/").data
        posts = feed["results"] if isinstance(feed, dict) else feed
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["author"]["username"], "friend")
        self.assertEqual(posts[0]["trip_title"], "Goa Weekend")

        self.write(self.friend, "Second thoughts: the fort beat the beach.")
        feed = self.client_for(self.owner).get("/api/explore/posts/").data
        posts = feed["results"] if isinstance(feed, dict) else feed
        self.assertEqual(len(posts), 1)
        self.assertIn("fort beat the beach", posts[0]["caption"])

    def test_skipping_posts_nothing(self):
        self.finish_trip()
        self.client_for(self.friend).post(f"/api/trips/{self.trip.id}/experience/skip/")
        feed = self.client_for(self.owner).get("/api/explore/posts/").data
        posts = feed["results"] if isinstance(feed, dict) else feed
        self.assertEqual(len(posts), 0)
