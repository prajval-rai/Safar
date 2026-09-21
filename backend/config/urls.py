from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts import social as social_views
from accounts import views as accounts_views
from explore import views as explore_views
from rewards import views as rewards_views
from trips import views as trips_views

router = DefaultRouter()
router.register("trips", trips_views.TripViewSet, basename="trip")
router.register("days", trips_views.DayViewSet, basename="day")
router.register("activities", trips_views.ActivityViewSet, basename="activity")
router.register("expenses", trips_views.ExpenseViewSet, basename="expense")
router.register("checklist", trips_views.ChecklistItemViewSet, basename="checklistitem")
router.register("explore/tracks", explore_views.TrackViewSet, basename="track")
router.register("explore/posts", explore_views.TravelPostViewSet, basename="post")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/register/", accounts_views.register, name="register"),
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", accounts_views.me, name="me"),
    path("api/users/search/", accounts_views.search_users, name="search_users"),
    path("api/users/<str:username>/", social_views.user_profile, name="user_profile"),
    path("api/users/<str:username>/follow/", social_views.follow_user, name="follow_user"),
    path("api/users/<str:username>/followers/", social_views.user_followers, name="user_followers"),
    path("api/users/<str:username>/following/", social_views.user_following, name="user_following"),
    path("api/users/<str:username>/travel-map/", social_views.user_travel_map, name="user_travel_map"),
    path("api/home/", trips_views.home_feed, name="home_feed"),
    path("api/catalog/", trips_views.catalog, name="catalog"),
    path("api/catalog/defaults/", trips_views.destination_defaults, name="destination_defaults"),
    path("api/trips/join/", trips_views.join_trip, name="join_trip"),
    path("api/rewards/me/", rewards_views.my_rewards, name="my_rewards"),
    path("api/rewards/leaderboard/", rewards_views.leaderboard, name="leaderboard"),
    path("api/explore/tracks/from-trip/", explore_views.track_from_trip, name="track_from_trip"),
    path("api/", include(router.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    # Small-scale hosting: serve uploaded photos from the app itself. On a host with
    # a temporary disk they vanish on redeploy — use object storage for anything real.
    from django.urls import re_path
    from django.views.static import serve

    urlpatterns += [
        re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
    ]
