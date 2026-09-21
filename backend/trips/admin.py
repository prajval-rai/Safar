from django.contrib import admin

from .models import Activity, ChatMessage, ChecklistItem, Day, Expense, Memory, Trip, TripMember


class DayInline(admin.TabularInline):
    model = Day
    extra = 0


class MemberInline(admin.TabularInline):
    model = TripMember
    extra = 0


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ["title", "destination", "start_date", "status", "created_by"]
    list_filter = ["status", "trip_type", "region"]
    search_fields = ["title", "destination"]
    inlines = [DayInline, MemberInline]


class ActivityInline(admin.TabularInline):
    model = Activity
    extra = 0


@admin.register(Day)
class DayAdmin(admin.ModelAdmin):
    list_display = ["trip", "index", "date", "title"]
    inlines = [ActivityInline]


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ["title", "day", "start_time", "status", "xp_value"]
    list_filter = ["status", "category"]
    search_fields = ["title", "place_name"]


admin.site.register([TripMember, Expense, ChecklistItem, Memory, ChatMessage])
admin.site.site_header = "Safar admin"
admin.site.site_title = "Safar"
