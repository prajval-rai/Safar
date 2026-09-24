"""Checklists: shared items, personal items, and the organiser's view of everyone's."""

from django.contrib.auth import get_user_model

from trips.models import ChecklistItem, TripMember
from trips.tests import SafarTestCase

User = get_user_model()


class ChecklistTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.buddy = User.objects.create_user("buddy", password="safar1234", display_name="Buddy")
        TripMember.objects.create(trip=self.trip, user=self.buddy, role="member")
        self.url = f"/api/trips/{self.trip.id}/checklist/"

    def add(self, user, **body):
        return self.client_for(user).post(self.url, {"title": "Power bank", **body}, format="json")

    def titles(self, user):
        return sorted(
            (i["title"], (i["assigned_to"] or {}).get("username")) for i in self.client_for(user).get(self.url).data
        )

    def test_members_add_to_their_own_list_by_default_or_to_the_group(self):
        mine = self.add(self.friend)
        self.assertEqual(mine.data["assigned_to"]["username"], "friend")
        shared = self.add(self.friend, title="Snacks", assigned_to_id=None)
        self.assertIsNone(shared.data["assigned_to"])

    def test_members_cannot_add_to_someone_elses_list(self):
        self.assertEqual(self.add(self.friend, assigned_to_id=self.buddy.id).status_code, 403)
        self.assertEqual(self.add(self.friend, for_everyone=True).status_code, 403)

    def test_organisers_add_for_one_person_or_everyone(self):
        self.assertEqual(self.add(self.owner, assigned_to_id=self.buddy.id).status_code, 201)
        everyone = self.add(self.owner, title="Carry your ID", for_everyone=True)
        self.assertEqual(everyone.status_code, 201)
        self.assertEqual(len(everyone.data), 3)
        self.assertEqual(
            set(ChecklistItem.objects.filter(title="Carry your ID").values_list("assigned_to__username", flat=True)),
            {"owner", "friend", "buddy"},
        )
        self.assertEqual(self.add(self.owner, assigned_to_id=self.stranger.id).status_code, 400)

    def test_members_see_shared_and_their_own_organisers_see_everything(self):
        self.add(self.owner, title="Carry your ID", for_everyone=True)
        self.add(self.owner, title="Snacks", assigned_to_id=None)
        self.add(self.buddy, title="Buddy's charger")

        self.assertEqual(self.titles(self.friend), [("Carry your ID", "friend"), ("Snacks", None)])
        owner_view = self.titles(self.owner)
        self.assertIn(("Buddy's charger", "buddy"), owner_view)
        self.assertIn(("Carry your ID", "friend"), owner_view)
        self.assertEqual(len(owner_view), 5)

    def test_ticking_and_removing_follow_who_owns_the_item(self):
        buddys = ChecklistItem.objects.create(trip=self.trip, title="Buddy's", assigned_to=self.buddy)
        shared = ChecklistItem.objects.create(trip=self.trip, title="Tickets")
        friend = self.client_for(self.friend)

        # Someone else's item doesn't even exist as far as a member is concerned.
        self.assertEqual(friend.patch(f"/api/checklist/{buddys.id}/", {"is_done": True}, format="json").status_code, 404)
        # Shared items are anyone's to tick, but only organisers remove them.
        self.assertEqual(friend.patch(f"/api/checklist/{shared.id}/", {"is_done": True}, format="json").status_code, 200)
        self.assertEqual(friend.delete(f"/api/checklist/{shared.id}/").status_code, 403)
        # Members can't move an item onto someone else's list.
        own = ChecklistItem.objects.create(trip=self.trip, title="Mine", assigned_to=self.friend)
        self.assertEqual(
            friend.patch(f"/api/checklist/{own.id}/", {"assigned_to_id": self.buddy.id}, format="json").status_code, 403
        )
        self.assertEqual(friend.delete(f"/api/checklist/{own.id}/").status_code, 204)

        # Organisers can tick anyone's and remove anything.
        owner = self.client_for(self.owner)
        self.assertEqual(owner.patch(f"/api/checklist/{buddys.id}/", {"is_done": True}, format="json").status_code, 200)
        self.assertEqual(owner.delete(f"/api/checklist/{shared.id}/").status_code, 204)
