"""Refer a friend: +REFERRAL_XP when someone signs up with your link."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.tests import google_claims
from notifications.models import Notification
from rewards.services import REFERRAL_XP

User = get_user_model()


@override_settings(GOOGLE_CLIENT_ID="test-client-id.apps.googleusercontent.com")
@patch("accounts.google_auth.id_token.verify_oauth2_token")
class ReferralTests(TestCase):
    def setUp(self):
        cache.clear()
        self.referrer = User.objects.create_user("asha", password="safar1234", display_name="Asha")

    def code(self, user=None):
        client = APIClient()
        client.force_authenticate(user or self.referrer)
        return client.get("/api/auth/me/").data["referral_code"]

    def sign_in(self, ref=None, **claims):
        body = {"credential": "fake-token"}
        if ref is not None:
            body["ref"] = ref
        return APIClient().post("/api/auth/google/", body, format="json")

    def test_everyone_gets_a_code_that_stays_the_same(self, verify):
        first = self.code()
        self.assertEqual(len(first), 8)
        self.assertEqual(self.code(), first)

    def test_a_new_signup_with_the_link_pays_the_referrer(self, verify):
        verify.return_value = google_claims()
        code = self.code()
        response = self.sign_in(ref=code.lower())  # codes aren't case-sensitive
        self.assertEqual(response.status_code, 201)

        newcomer = User.objects.get(google_sub="1234567890")
        self.assertEqual(newcomer.referred_by, self.referrer)
        self.referrer.refresh_from_db()
        self.assertEqual(self.referrer.xp, REFERRAL_XP)
        self.assertTrue(
            Notification.objects.filter(user=self.referrer, kind="referral_joined", actor=newcomer).exists()
        )
        me = APIClient()
        me.force_authenticate(self.referrer)
        self.assertEqual(me.get("/api/auth/me/").data["referral_count"], 1)
        # The new traveller doesn't get it — only whoever shared the link.
        self.assertEqual(newcomer.xp, 0)

    def test_an_existing_account_signing_in_with_the_link_earns_nothing(self, verify):
        verify.return_value = google_claims()
        self.sign_in()  # the account is created without a referral
        self.sign_in(ref=self.code())  # …then comes back through a link
        self.referrer.refresh_from_db()
        self.assertEqual(self.referrer.xp, 0)
        self.assertIsNone(User.objects.get(google_sub="1234567890").referred_by)

    def test_a_bad_code_never_blocks_signing_up(self, verify):
        verify.return_value = google_claims()
        response = self.sign_in(ref="NOPE1234")
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(User.objects.get(google_sub="1234567890").referred_by)

    def test_a_switched_off_referrer_earns_nothing(self, verify):
        verify.return_value = google_claims()
        code = self.code()
        self.referrer.is_active = False
        self.referrer.save()
        self.sign_in(ref=code)
        self.referrer.refresh_from_db()
        self.assertEqual(self.referrer.xp, 0)

    def test_the_rule_is_in_the_xp_rulebook(self, verify):
        client = APIClient()
        client.force_authenticate(self.referrer)
        rules = client.get("/api/rewards/me/").data["xp_rules"]
        self.assertTrue(any(r["title"] == "Refer a friend" for r in rules))
