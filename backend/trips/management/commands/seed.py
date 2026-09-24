"""Fill the database with believable demo data so the app looks alive on first run.

    python manage.py seed --reset
"""

import random
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from accounts.models import Follow
from django.db import transaction

from explore.models import Track, TrackDay, TrackLike, TrackSave, TrackStop, TravelPost
from rewards.services import (
    DAY_COMPLETE_BONUS,
    TRIP_COMPLETE_BONUS,
    award_xp,
    evaluate_achievements,
    seed_achievements,
)
from trips.catalog import plan_for_day
from trips.models import (
    Activity,
    ChatMessage,
    ChecklistItem,
    Day,
    Expense,
    Memory,
    Trip,
    TripMember,
)

User = get_user_model()

PEOPLE = [
    ("prajwal", "Prajwal Rai", "Pune", "🧳", "Weekend trips and long drives."),
    ("rahul", "Rahul Menon", "Bengaluru", "🏍️", "Two wheels, one helmet, many detours."),
    ("sneha", "Sneha Kulkarni", "Mumbai", "📸", "I plan the trip, you carry the bags."),
    ("aditya", "Aditya Sharma", "Delhi", "⛰️", "Mountains over beaches, always."),
    ("meera", "Meera Nair", "Kochi", "🌴", "Backwaters, filter coffee, repeat."),
    ("faizan", "Faizan Ali", "Hyderabad", "🍛", "I travel for the food."),
]

CHECKLIST_SEED = [
    ("Book train tickets", "booking"),
    ("Carry ID proof for all", "documents"),
    ("Power bank and chargers", "packing"),
    ("Sunscreen and caps", "packing"),
    ("Download offline maps", "other"),
]

EXPENSE_SEED = [
    ("Train tickets", 4800, "travel"),
    ("Hotel - 2 nights", 7200, "stay"),
    ("Dinner at the beach", 2100, "food"),
    ("Cab and fuel", 1650, "travel"),
    ("Entry tickets", 900, "sightseeing"),
]

CHAT_SEED = [
    "Guys, train is at 6:10 AM — please don't be late 🙏",
    "Carrying an extra power bank, anyone need one?",
    "Booked the hotel. 2 rooms, breakfast included.",
    "Weather looks clear for the whole weekend 🎉",
]


class Command(BaseCommand):
    help = "Seed Safar with demo travellers, trips, tracks and posts."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing demo data first")

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(7)
        if options["reset"]:
            self.stdout.write("Clearing old data…")
            Trip.objects.all().delete()
            Track.objects.all().delete()
            TravelPost.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()

        seed_achievements()
        users = self.make_users()
        me = users["prajwal"]

        today = date.today()

        # 1. A finished trip — shows the completion screen and Memories.
        goa = self.make_trip(
            owner=me,
            crew=[users["rahul"], users["sneha"], users["faizan"]],
            title="Goa Beach Escape",
            destination="Goa",
            region="Goa",
            cover_key="beach",
            summary="Four days of beaches, shacks and one very early sunrise.",
            start=today - timedelta(days=40),
            days=4,
            trip_type="friends",
            pace="balanced",
            transport="flight",
            budget=14000,
            complete_ratio=1.0,
        )

        # 2. A trip happening right now — powers Live Trip mode.
        jaipur = self.make_trip(
            owner=me,
            crew=[users["aditya"], users["sneha"]],
            title="Jaipur Weekend",
            destination="Jaipur",
            region="Rajasthan",
            cover_key="fort",
            summary="Forts, kachoris and a rooftop dinner.",
            start=today - timedelta(days=1),
            days=3,
            trip_type="weekend",
            pace="packed",
            transport="train",
            budget=9000,
            complete_ratio=0.45,
            status="active",
        )

        # 3. Still being planned — shows the planning state and checklist.
        ladakh = self.make_trip(
            owner=me,
            crew=[users["rahul"], users["aditya"]],
            title="Ladakh Road Trip",
            destination="Leh Ladakh",
            region="Ladakh",
            cover_key="road",
            summary="Leh, Pangong and Nubra on two wheels.",
            start=today + timedelta(days=34),
            days=6,
            trip_type="road",
            pace="balanced",
            transport="bike",
            budget=38000,
            complete_ratio=0.0,
        )

        # A trip owned by someone else, so the feed isn't all mine.
        self.make_trip(
            owner=users["meera"],
            crew=[users["faizan"]],
            title="Kerala Backwaters",
            destination="Alleppey",
            region="Kerala",
            cover_key="backwater",
            summary="Houseboat, sadya and very slow mornings.",
            start=today - timedelta(days=90),
            days=3,
            trip_type="family",
            pace="relaxed",
            transport="train",
            budget=16000,
            complete_ratio=1.0,
        )

        self.decorate(jaipur, users)
        self.decorate(ladakh, users, expenses=False)
        self.add_memories(goa, [me, users["sneha"], users["rahul"]])
        self.add_memories(jaipur, [me, users["aditya"]])

        self.make_follows(users)
        self.make_tracks(users, goa)
        self.make_posts(users, goa, jaipur)

        for user in users.values():
            evaluate_achievements(user)

        self.stdout.write(self.style.SUCCESS("\nSeeded Safar."))
        self.stdout.write("  Log in as  prajwal / safar1234")
        self.stdout.write("  Admin at   /admin  (admin / safar1234)")

    # ------------------------------------------------------------------

    def make_users(self):
        users = {}
        for username, name, city, emoji, bio in PEOPLE:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "display_name": name,
                    "home_city": city,
                    "avatar_emoji": emoji,
                    "bio": bio,
                    "email": f"{username}@example.in",
                },
            )
            if created:
                user.set_password("safar1234")
                user.save()
            users[username] = user

        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser(
                "admin", "admin@example.in", "safar1234", display_name="Safar Admin"
            )
        return users

    def make_trip(
        self,
        owner,
        crew,
        title,
        destination,
        region,
        cover_key,
        summary,
        start,
        days,
        trip_type,
        pace,
        transport,
        budget,
        complete_ratio,
        status="planning",
    ):
        trip = Trip.objects.create(
            title=title,
            destination=destination,
            region=region,
            summary=summary,
            cover_key=cover_key,
            start_date=start,
            end_date=start + timedelta(days=days - 1),
            trip_type=trip_type,
            pace=pace,
            transport=transport,
            budget_per_person=budget,
            status=status,
            is_public=True,
            created_by=owner,
        )
        TripMember.objects.create(trip=trip, user=owner, role="owner")
        for i, mate in enumerate(crew):
            TripMember.objects.create(
                trip=trip, user=mate, role="admin" if i == 0 else "member"
            )

        everyone = [owner] + crew
        created_activities = []
        for offset in range(days):
            day = Day.objects.create(
                trip=trip, index=offset + 1, date=start + timedelta(days=offset)
            )
            for order, stop in enumerate(plan_for_day(destination, cover_key, day.index, pace)):
                created_activities.append(Activity.objects.create(day=day, order=order, **stop))

        cutoff = int(len(created_activities) * complete_ratio)
        # Only organisers (the owner and the co-planner) complete stops, and
        # each one counts for the whole group.
        organisers = everyone[:2]
        for activity in created_activities[:cutoff]:
            doer = random.choice(organisers)
            activity.status = "completed"
            activity.completed_by = doer
            activity.completed_at = timezone_for(activity)
            activity.checked_in_at = activity.completed_at
            # Demo data: pretend these travellers really stood at each pinned stop.
            activity.verified_by_location = activity.latitude is not None
            activity.completed_distance_m = 120 if activity.latitude is not None else None
            activity.save()
            for member in everyone:
                award_xp(member, activity.xp_value, f"Completed {activity.title}", "activity", trip)

        for day in trip.days.all():
            if day.is_complete:
                for member in everyone:
                    award_xp(member, DAY_COMPLETE_BONUS, f"Finished day {day.index}", "day", trip)

        if complete_ratio >= 1.0:
            trip.status = "completed"
            trip.save(update_fields=["status"])
            for member in everyone:
                award_xp(member, TRIP_COMPLETE_BONUS, f"Completed {title}", "trip", trip)

        self.stdout.write(f"  · {title} — {len(created_activities)} activities")
        return trip

    def decorate(self, trip, users, expenses=True):
        crew = [m.user for m in trip.members.all()]
        for title, category in CHECKLIST_SEED:
            ChecklistItem.objects.create(
                trip=trip,
                title=title,
                category=category,
                assigned_to=random.choice(crew),
                is_done=random.random() < 0.5,
            )
        if expenses:
            for title, amount, category in EXPENSE_SEED:
                Expense.objects.create(
                    trip=trip,
                    title=title,
                    amount=amount,
                    category=category,
                    paid_by=random.choice(crew),
                    spent_on=trip.start_date,
                )
        for i, text in enumerate(CHAT_SEED):
            ChatMessage.objects.create(trip=trip, user=crew[i % len(crew)], text=text)

    def add_memories(self, trip, people):
        captions = [
            "Sunset from the fort 🌅",
            "Best chai of the trip",
            "Group photo before everyone got tired",
            "That view was worth the early alarm",
            "Street food stop we didn't plan",
        ]
        activities = list(Activity.objects.filter(day__trip=trip, status="completed")[:5])
        for i, caption in enumerate(captions[: len(activities) or 3]):
            Memory.objects.create(
                trip=trip,
                activity=activities[i] if i < len(activities) else None,
                user=people[i % len(people)],
                caption=caption,
            )

    def make_follows(self, users):
        """A small social graph so Followers / Following aren't empty on first run."""
        edges = [
            ("prajwal", "rahul"), ("prajwal", "sneha"), ("prajwal", "meera"),
            ("rahul", "prajwal"), ("sneha", "prajwal"), ("aditya", "prajwal"),
            ("faizan", "prajwal"), ("sneha", "rahul"), ("meera", "sneha"),
        ]
        for follower, following in edges:
            Follow.objects.get_or_create(follower=users[follower], following=users[following])
        self.stdout.write(f"  · {len(edges)} follows")

    def make_tracks(self, users, source_trip):
        """Published routes other travellers can follow."""
        specs = [
            {
                "title": "Goa in 4 Days — Beaches and Old Town",
                "summary": "North Goa for the energy, South Goa for the quiet. No rushing.",
                "destination": "Goa",
                "region": "Goa",
                "cover_key": "beach",
                "days": 4,
                "trip_type": "friends",
                "difficulty": "easy",
                "best_season": "November to February",
                "estimated_cost": 14000,
                "route": ["Panaji", "Baga", "Old Goa", "Palolem"],
                "tags": ["beach", "first-timers", "budget"],
                "author": users["sneha"],
            },
            {
                "title": "Leh to Pangong on a Bike",
                "summary": "Acclimatise properly, then ride. Every stop that's actually worth it.",
                "destination": "Leh Ladakh",
                "region": "Ladakh",
                "cover_key": "road",
                "days": 6,
                "trip_type": "road",
                "difficulty": "tough",
                "best_season": "June to September",
                "estimated_cost": 38000,
                "route": ["Leh", "Khardung La", "Nubra", "Pangong"],
                "tags": ["road-trip", "bikers", "high-altitude"],
                "author": users["rahul"],
            },
            {
                "title": "Jaipur Weekend for First Timers",
                "summary": "Two days, all the big forts, and the kachori place locals go to.",
                "destination": "Jaipur",
                "region": "Rajasthan",
                "cover_key": "fort",
                "days": 2,
                "trip_type": "weekend",
                "difficulty": "easy",
                "best_season": "October to March",
                "estimated_cost": 8000,
                "route": ["Amer", "Hawa Mahal", "Nahargarh"],
                "tags": ["heritage", "weekend", "food"],
                "author": users["aditya"],
            },
            {
                "title": "Kerala Backwaters, Slowly",
                "summary": "One houseboat night, one beach day, zero alarms.",
                "destination": "Alleppey",
                "region": "Kerala",
                "cover_key": "backwater",
                "days": 3,
                "trip_type": "family",
                "difficulty": "easy",
                "best_season": "September to March",
                "estimated_cost": 16000,
                "route": ["Alleppey", "Vembanad", "Marari"],
                "tags": ["family", "relaxed", "houseboat"],
                "author": users["meera"],
            },
            {
                "title": "Rishikesh Adventure Weekend",
                "summary": "Rafting, cliff jumps and the Ganga aarti to end the day.",
                "destination": "Rishikesh",
                "region": "Uttarakhand",
                "cover_key": "river",
                "days": 2,
                "trip_type": "college",
                "difficulty": "moderate",
                "best_season": "September to June",
                "estimated_cost": 6000,
                "route": ["Laxman Jhula", "Shivpuri", "Triveni Ghat"],
                "tags": ["adventure", "budget", "college"],
                "author": users["faizan"],
            },
        ]

        everyone = list(users.values())
        for spec in specs:
            author = spec.pop("author")
            track = Track.objects.create(author=author, **spec)
            for index in range(1, track.days + 1):
                track_day = TrackDay.objects.create(
                    track=track, index=index, title=f"Day {index}"
                )
                stops = plan_for_day(track.destination, track.cover_key, index, "balanced")
                for order, stop in enumerate(stops):
                    TrackStop.objects.create(track_day=track_day, order=order, **stop)
            for fan in random.sample(everyone, random.randint(2, 5)):
                TrackLike.objects.get_or_create(track=track, user=fan)
            for fan in random.sample(everyone, random.randint(1, 3)):
                TrackSave.objects.get_or_create(track=track, user=fan)
        self.stdout.write(f"  · {len(specs)} tracks published")

    def make_posts(self, users, goa, jaipur):
        posts = [
            (users["sneha"], goa, "Palolem at 6 AM is a completely different place. Go early.", "Palolem Beach", "beach"),
            (users["rahul"], None, "Khardung La done. Cold, slow, absolutely worth it.", "Khardung La", "road"),
            (users["prajwal"], jaipur, "Amer Fort before 9 AM = no queue, no heat. Learn from my mistakes.", "Amer Fort", "fort"),
            (users["meera"], None, "Houseboat lunch on a banana leaf. Nothing beats this.", "Vembanad Lake", "backwater"),
            (users["aditya"], None, "Triund trek in one day is doable if you start by 7.", "Triund", "mountain"),
        ]
        for author, trip, caption, place, cover in posts:
            TravelPost.objects.create(
                author=author, trip=trip, caption=caption, place=place, cover_key=cover
            )
        self.stdout.write(f"  · {len(posts)} travel posts")


def timezone_for(activity):
    """A completion timestamp that matches the activity's own day."""
    from datetime import datetime, time

    from django.utils import timezone

    moment = datetime.combine(activity.day.date, activity.start_time or time(12, 0))
    return timezone.make_aware(moment, timezone.get_current_timezone())
