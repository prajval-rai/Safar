import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from rewards.models import RewardClaim, RewardOffer


class RewardRangeTests(TestCase):
    def test_every_reward_is_between_1_and_10_xp(self):
        from rewards import services

        constants = [
            services.DAY_COMPLETE_BONUS,
            services.TRIP_COMPLETE_BONUS,
            services.CHECKIN_XP,
            services.MEMORY_XP,
            services.EXPERIENCE_XP,
            services.TRACK_PUBLISH_XP,
            services.TRIP_CREATE_XP,
            services.ORGANIZER_COMPLETE_BONUS,
            *(row[4] for row in services.DEFAULT_ACHIEVEMENTS),
        ]
        for amount in constants:
            self.assertTrue(1 <= amount <= services.MAX_REWARD, amount)
        # The one penalty stays within the same size.
        self.assertTrue(-services.MAX_REWARD <= services.CANCEL_PENALTY < 0)


class RewardCatalogTests(TestCase):
    """Staff put rewards up with an image and rules; travellers claim them."""

    def setUp(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.staff = User.objects.create_user("staff", password="x", is_staff=True)
        self.rich = User.objects.create_user("rich", password="x", xp=Decimal("120.50"))
        self.poor = User.objects.create_user("poor", password="x", xp=Decimal("3.25"))
        self.other = User.objects.create_user("other", password="x", xp=Decimal("500"))

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def png(self):
        from io import BytesIO

        from PIL import Image

        buffer = BytesIO()
        Image.new("RGB", (4, 4), "orange").save(buffer, format="PNG")
        return SimpleUploadedFile("reward.png", buffer.getvalue(), content_type="image/png")

    def make_offer(self, **fields):
        return RewardOffer.objects.create(
            title=fields.pop("title", "Free chai"), xp_required=fields.pop("xp_required", 100), **fields
        )

    @override_settings(MEDIA_ROOT=tempfile.mkdtemp())
    def test_staff_upload_a_reward_with_an_image_and_rules(self):
        response = self.client_for(self.staff).post(
            "/api/rewards/catalog/",
            {"title": "Trek gear voucher", "xp_required": "50.5", "max_claims": 2, "image": self.png()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        offer = RewardOffer.objects.get()
        self.assertEqual(offer.xp_required, Decimal("50.50"))
        self.assertEqual(offer.max_claims, 2)
        self.assertTrue(offer.image.name.startswith("rewards/"))

    def test_travellers_cannot_create_or_change_rewards(self):
        client = self.client_for(self.rich)
        self.assertEqual(
            client.post("/api/rewards/catalog/", {"title": "Hack", "xp_required": 1}).status_code, 403
        )
        offer = self.make_offer()
        self.assertEqual(
            client.patch(f"/api/rewards/catalog/{offer.id}/", {"xp_required": 0.01}).status_code, 403
        )

    def test_rules_must_make_sense(self):
        client = self.client_for(self.staff)
        self.assertEqual(
            client.post("/api/rewards/catalog/", {"title": "x", "xp_required": 0, "max_claims": 1}).status_code, 400
        )
        self.assertEqual(
            client.post("/api/rewards/catalog/", {"title": "x", "xp_required": 5, "max_claims": 0}).status_code, 400
        )

    def test_claiming_needs_enough_xp_and_does_not_spend_it(self):
        offer = self.make_offer(xp_required=100)
        blocked = self.client_for(self.poor).post(f"/api/rewards/catalog/{offer.id}/claim/")
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("96.75 more XP", blocked.data["detail"])

        ok = self.client_for(self.rich).post(f"/api/rewards/catalog/{offer.id}/claim/")
        self.assertEqual(ok.status_code, 201)
        self.assertTrue(ok.data["claimed_by_me"])
        self.rich.refresh_from_db()
        self.assertEqual(self.rich.xp, Decimal("120.50"))

    def test_only_as_many_people_as_the_rule_allows_and_once_each(self):
        offer = self.make_offer(xp_required=10, max_claims=1)
        self.assertEqual(self.client_for(self.rich).post(f"/api/rewards/catalog/{offer.id}/claim/").status_code, 201)
        again = self.client_for(self.rich).post(f"/api/rewards/catalog/{offer.id}/claim/")
        self.assertEqual(again.status_code, 400)
        full = self.client_for(self.other).post(f"/api/rewards/catalog/{offer.id}/claim/")
        self.assertEqual(full.status_code, 400)
        self.assertIn("All claimed", full.data["detail"])
        self.assertEqual(RewardClaim.objects.count(), 1)

    def test_listing_shows_spots_left_and_hides_inactive_rewards(self):
        offer = self.make_offer(xp_required=10, max_claims=3)
        self.make_offer(title="Hidden", is_active=False)
        self.client_for(self.rich).post(f"/api/rewards/catalog/{offer.id}/claim/")

        mine = self.client_for(self.other).get("/api/rewards/catalog/").data
        self.assertEqual([r["title"] for r in mine], ["Free chai"])
        self.assertEqual(mine[0]["spots_left"], 2)
        self.assertEqual(mine[0]["blocked_reason"], "")
        self.assertIsNone(mine[0]["my_claim_status"])
        # ?all=1 only widens the list for admins.
        self.assertEqual(len(self.client_for(self.other).get("/api/rewards/catalog/?all=1").data), 1)
        self.assertEqual(len(self.client_for(self.staff).get("/api/rewards/catalog/?all=1").data), 2)

    def test_admin_endpoints_are_admin_only(self):
        client = self.client_for(self.rich)
        self.assertEqual(client.get("/api/rewards/admin/overview/").status_code, 403)
        self.assertEqual(client.get("/api/rewards/admin/claims/").status_code, 403)
        offer = self.make_offer(xp_required=10)
        client.post(f"/api/rewards/catalog/{offer.id}/claim/")
        claim = RewardClaim.objects.get()
        self.assertEqual(
            client.patch(f"/api/rewards/admin/claims/{claim.id}/", {"status": "delivered"}, format="json").status_code,
            403,
        )

    def test_admin_sees_every_claim_and_delivers_it(self):
        from notifications.models import Notification

        offer = self.make_offer(xp_required=10, max_claims=2)
        self.client_for(self.rich).post(f"/api/rewards/catalog/{offer.id}/claim/")
        # Admins hear about new claims.
        self.assertTrue(Notification.objects.filter(user=self.staff, kind="reward_claimed").exists())

        admin = self.client_for(self.staff)
        overview = admin.get("/api/rewards/admin/overview/").data
        self.assertEqual(overview["stats"]["pending"], 1)
        self.assertEqual(overview["rewards"][0]["pending_count"], 1)

        claims = admin.get("/api/rewards/admin/claims/?status=pending").data
        self.assertEqual([c["user"]["username"] for c in claims], ["rich"])
        response = admin.patch(
            f"/api/rewards/admin/claims/{claims[0]['id']}/",
            {"status": "delivered", "admin_note": "Collect it at the front desk."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "delivered")
        self.assertEqual(response.data["handled_by"]["username"], "staff")
        self.assertTrue(Notification.objects.filter(user=self.rich, kind="reward_update").exists())

        mine = self.client_for(self.rich).get("/api/rewards/catalog/").data[0]
        self.assertEqual(mine["my_claim_status"], "delivered")
        self.assertEqual(mine["my_claim_note"], "Collect it at the front desk.")

    def test_rejecting_a_claim_frees_the_spot(self):
        offer = self.make_offer(xp_required=10, max_claims=1)
        self.client_for(self.rich).post(f"/api/rewards/catalog/{offer.id}/claim/")
        claim = RewardClaim.objects.get()
        self.client_for(self.staff).patch(
            f"/api/rewards/admin/claims/{claim.id}/", {"status": "rejected"}, format="json"
        )
        self.assertEqual(
            self.client_for(self.other).post(f"/api/rewards/catalog/{offer.id}/claim/").status_code, 201
        )
        again = self.client_for(self.rich).post(f"/api/rewards/catalog/{offer.id}/claim/")
        self.assertEqual(again.data["detail"], "Your claim was declined.")
        # The spot is taken again, so the rejected claim can't be revived.
        revive = self.client_for(self.staff).patch(
            f"/api/rewards/admin/claims/{claim.id}/", {"status": "pending"}, format="json"
        )
        self.assertEqual(revive.status_code, 400)

    def test_big_xp_gaps_read_with_thousands_separators(self):
        offer = self.make_offer(xp_required=2000)
        response = self.client_for(self.poor).post(f"/api/rewards/catalog/{offer.id}/claim/")
        self.assertIn("1,996.75 more XP", response.data["detail"])
