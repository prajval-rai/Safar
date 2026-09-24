from django.test import TestCase

# Create your tests here.


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
            *services.CATEGORY_XP.values(),
            *(row[4] for row in services.DEFAULT_ACHIEVEMENTS),
        ]
        for amount in constants:
            self.assertTrue(1 <= amount <= services.MAX_REWARD, amount)
        # The one penalty stays within the same size.
        self.assertTrue(-services.MAX_REWARD <= services.CANCEL_PENALTY < 0)
