from django.contrib import admin

from .models import PostLike, Track, TrackDay, TrackLike, TrackSave, TrackStop, TravelPost


class StopInline(admin.TabularInline):
    model = TrackStop
    extra = 0


@admin.register(TrackDay)
class TrackDayAdmin(admin.ModelAdmin):
    list_display = ["track", "index", "title"]
    inlines = [StopInline]


@admin.register(Track)
class TrackAdmin(admin.ModelAdmin):
    list_display = ["title", "destination", "days", "author", "is_published"]
    list_filter = ["region", "difficulty", "is_published"]


@admin.register(TravelPost)
class TravelPostAdmin(admin.ModelAdmin):
    list_display = ["author", "place", "created_at"]


admin.site.register([TrackLike, TrackSave, PostLike])
