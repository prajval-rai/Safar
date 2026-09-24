from django.contrib import admin

from .models import Achievement, HeldXP, UserAchievement, XPTransaction


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ["icon", "title", "goal_kind", "goal_value", "xp_reward"]


@admin.register(XPTransaction)
class XPTransactionAdmin(admin.ModelAdmin):
    list_display = ["user", "amount", "kind", "reason", "created_at"]
    list_filter = ["kind"]


admin.site.register(UserAchievement)


@admin.register(HeldXP)
class HeldXPAdmin(admin.ModelAdmin):
    list_display = ["user", "trip", "amount", "reason", "created_at", "released_at"]
    list_filter = ["released_at"]
