"""Reddit-style discussion on a track: comments about the route, a day or a
stop; threaded replies; votes."""

from explore.models import Track, TrackComment, TrackDay, TrackStop
from notifications.models import Notification
from trips.tests import SafarTestCase


class TrackCommentTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.track = Track.objects.create(title="Goa beaches", destination="Goa", author=self.owner)
        self.day = TrackDay.objects.create(track=self.track, index=1)
        self.stop = TrackStop.objects.create(track_day=self.day, title="Fort Aguada", order=0)
        self.url = f"/api/explore/tracks/{self.track.id}/comments/"

    def post(self, user, **body):
        return self.client_for(user).post(self.url, body, format="json")

    def thread(self, user=None, **params):
        return self.client_for(user or self.friend).get(self.url, params).data

    def vote(self, user, comment_id, value):
        return self.client_for(user).post(f"/api/explore/comments/{comment_id}/vote/", {"value": value}, format="json")

    def test_a_suggestion_on_a_stop_shows_on_the_thread_with_counts(self):
        response = self.post(self.friend, text="Go before 8 AM, it gets crowded.", stop_id=self.stop.id)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["stop"]["title"], "Fort Aguada")
        self.assertEqual(response.data["day"]["index"], 1)  # the stop's day, filled in
        self.post(self.friend, text="Lovely route overall.")

        data = self.thread()
        self.assertEqual(len(data["comments"]), 2)
        self.assertEqual(data["counts"]["total"], 2)
        self.assertEqual(data["counts"]["general"], 1)
        self.assertEqual(data["counts"]["by_stop"][str(self.stop.id)], 1)
        self.assertEqual(data["counts"]["by_day"][str(self.day.id)], 1)
        only_stop = self.thread(stop=self.stop.id)["comments"]
        self.assertEqual([c["text"] for c in only_stop], ["Go before 8 AM, it gets crowded."])
        # The track's author hears about it.
        self.assertTrue(Notification.objects.filter(user=self.owner, kind="track_comment").exists())

    def test_replies_nest_and_notify_the_person_replied_to(self):
        top = self.post(self.friend, text="Is the beach safe at night?").data
        reply = self.post(self.owner, text="Yes, near the shacks.", parent_id=top["id"]).data
        self.post(self.friend, text="Thanks!", parent_id=reply["id"])
        data = self.thread()
        self.assertEqual(len(data["comments"]), 1)
        self.assertEqual(data["comments"][0]["replies"][0]["text"], "Yes, near the shacks.")
        self.assertEqual(data["comments"][0]["replies"][0]["replies"][0]["text"], "Thanks!")
        self.assertTrue(Notification.objects.filter(user=self.friend, kind="comment_reply").exists())

    def test_votes_move_the_score_and_top_sorts_by_it(self):
        first = self.post(self.friend, text="First").data
        second = self.post(self.friend, text="Second").data
        self.assertEqual(self.vote(self.owner, second["id"], 1).data["score"], 1)
        self.assertEqual(self.vote(self.stranger, second["id"], 1).data["score"], 2)
        self.assertEqual(self.vote(self.owner, first["id"], -1).data["score"], -1)
        self.assertEqual([c["text"] for c in self.thread()["comments"]], ["Second", "First"])
        self.assertEqual([c["text"] for c in self.thread(sort="new")["comments"]], ["Second", "First"])
        # Changing your mind, and taking your vote back.
        self.assertEqual(self.vote(self.owner, second["id"], -1).data["score"], 0)
        self.assertEqual(self.vote(self.owner, second["id"], 0).data["score"], 1)
        mine = next(c for c in self.thread(self.stranger)["comments"] if c["id"] == second["id"])
        self.assertEqual(mine["my_vote"], 1)

    def test_you_cannot_vote_on_your_own_comment(self):
        mine = self.post(self.friend, text="Mine").data
        self.assertEqual(self.vote(self.friend, mine["id"], 1).status_code, 400)

    def test_edit_and_delete_are_yours_only(self):
        c = self.post(self.friend, text="Typo herre").data
        edit_url = f"/api/explore/comments/{c['id']}/"
        self.assertEqual(self.client_for(self.owner).patch(edit_url, {"text": "x"}, format="json").status_code, 403)
        self.assertEqual(self.client_for(self.friend).patch(edit_url, {"text": "Typo here"}, format="json").status_code, 200)
        self.assertTrue(self.thread()["comments"][0]["edited"])
        self.assertEqual(self.client_for(self.owner).delete(edit_url).status_code, 403)
        self.assertEqual(self.client_for(self.friend).delete(edit_url).status_code, 204)
        self.assertEqual(self.thread()["comments"], [])

    def test_deleting_a_comment_with_replies_keeps_the_thread(self):
        top = self.post(self.friend, text="Question").data
        self.post(self.owner, text="Answer", parent_id=top["id"])
        self.client_for(self.friend).delete(f"/api/explore/comments/{top['id']}/")
        thread = self.thread()["comments"]
        self.assertTrue(thread[0]["is_deleted"])
        self.assertEqual(thread[0]["text"], "")
        self.assertEqual(thread[0]["replies"][0]["text"], "Answer")
        self.assertEqual(self.post(self.owner, text="late", parent_id=top["id"]).status_code, 400)

    def test_a_stop_from_another_track_is_refused(self):
        other = Track.objects.create(title="Other", destination="X", author=self.owner)
        other_day = TrackDay.objects.create(track=other, index=1)
        other_stop = TrackStop.objects.create(track_day=other_day, title="Elsewhere", order=0)
        self.assertEqual(self.post(self.friend, text="hm", stop_id=other_stop.id).status_code, 400)
        self.assertEqual(TrackComment.objects.count(), 0)
