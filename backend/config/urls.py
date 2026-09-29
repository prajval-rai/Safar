from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from accounts import social as social_views
from accounts import views as accounts_views
from explore import views as explore_views
from notifications import views as notifications_views
from rewards import views as rewards_views
from trips import past as past_trips
from trips import views as trips_views

router = DefaultRouter()
router.register("trips", trips_views.TripViewSet, basename="trip")
router.register("days", trips_views.DayViewSet, basename="day")
router.register("activities", trips_views.ActivityViewSet, basename="activity")
router.register("expenses", trips_views.ExpenseViewSet, basename="expense")
router.register("checklist", trips_views.ChecklistItemViewSet, basename="checklistitem")
router.register("rewards/catalog", rewards_views.RewardOfferViewSet, basename="rewardoffer")
router.register("explore/tracks", explore_views.TrackViewSet, basename="track")
router.register("explore/posts", explore_views.TravelPostViewSet, basename="post")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/google/", accounts_views.google_login, name="google_login"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", accounts_views.me, name="me"),
    path("api/auth/deactivate/", accounts_views.deactivate_account, name="deactivate_account"),
    path("api/auth/delete/", accounts_views.delete_account, name="delete_account"),
    path("api/users/search/", accounts_views.search_users, name="search_users"),
    path("api/users/<str:username>/", social_views.user_profile, name="user_profile"),
    path("api/users/<str:username>/follow/", social_views.follow_user, name="follow_user"),
    path("api/users/<str:username>/followers/", social_views.user_followers, name="user_followers"),
    path("api/users/<str:username>/following/", social_views.user_following, name="user_following"),
    path("api/users/<str:username>/travel-map/", social_views.user_travel_map, name="user_travel_map"),
    path("api/home/", trips_views.home_feed, name="home_feed"),
    path("api/theme/active/", trips_views.active_theme, name="active_theme"),
    path("api/catalog/", trips_views.catalog, name="catalog"),
    path("api/catalog/defaults/", trips_views.destination_defaults, name="destination_defaults"),
    path("api/trips/join/", trips_views.join_trip, name="join_trip"),
    path("api/invites/", trips_views.invite_list, name="invite_list"),
    path(
        "api/invites/<int:pk>/<str:decision>/",
        trips_views.respond_to_invite,
        name="invite_respond",
    ),
    path("api/trips/invite/<str:code>/", trips_views.invite_preview, name="invite_preview"),
    path("api/rewards/me/", rewards_views.my_rewards, name="my_rewards"),
    path("api/rewards/leaderboard/", rewards_views.leaderboard, name="leaderboard"),
    path("api/rewards/admin/overview/", rewards_views.admin_overview, name="rewards_admin_overview"),
    path("api/rewards/admin/claims/", rewards_views.admin_claims, name="rewards_admin_claims"),
    path("api/rewards/admin/claims/<int:pk>/", rewards_views.admin_update_claim, name="rewards_admin_claim"),
    path("api/past-trips/config/", past_trips.past_trip_config, name="past_trip_config"),
    path("api/admin/past-trips/", past_trips.admin_past_trips, name="admin_past_trips"),
    path("api/admin/past-trips/<uuid:pk>/", past_trips.admin_past_trip_detail, name="admin_past_trip"),
    path(
        "api/admin/past-trips/<uuid:pk>/review/",
        past_trips.admin_review_past_trip,
        name="admin_past_trip_review",
    ),
    path("api/explore/tracks/from-trip/", explore_views.track_from_trip, name="track_from_trip"),
    path("api/music/search/", explore_views.music_search, name="music_search"),
    path("api/notifications/", notifications_views.notification_list, name="notification_list"),
    path("api/notifications/unread-count/", notifications_views.unread_count, name="notification_unread_count"),
    path("api/notifications/read-all/", notifications_views.mark_all_read, name="notification_read_all"),
    path("api/notifications/<uuid:pk>/read/", notifications_views.mark_read, name="notification_read"),
    path("api/push/config/", notifications_views.push_config, name="push_config"),
    path("api/push/subscribe/", notifications_views.push_subscribe, name="push_subscribe"),
    path("api/push/unsubscribe/", notifications_views.push_unsubscribe, name="push_unsubscribe"),
    path("api/push/expo/register/", notifications_views.expo_push_register, name="expo_push_register"),
    path("api/push/expo/unregister/", notifications_views.expo_push_unregister, name="expo_push_unregister"),
    path("api/", include(router.urls)),
]

if settings.GS_BUCKET_NAME:
    pass  # Uploads are served straight from the Google Cloud Storage bucket.
elif settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    # Small-scale hosting: serve uploaded photos from the app itself. On a host with
    # a temporary disk they vanish on redeploy — use object storage for anything real.
    from django.urls import re_path
    from django.views.static import serve

    urlpatterns += [
        re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
    ]
