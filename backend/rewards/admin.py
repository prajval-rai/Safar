from django.contrib import admin

from .models import Achievement, HeldXP, RewardClaim, RewardOffer, UserAchievement, XPTransaction


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


class RewardClaimInline(admin.TabularInline):
    model = RewardClaim
    extra = 0
    readonly_fields = ["user", "created_at"]


@admin.register(RewardOffer)
class RewardOfferAdmin(admin.ModelAdmin):
    list_display = ["title", "xp_required", "max_claims", "claimed", "is_active", "created_at"]
    list_filter = ["is_active"]
    inlines = [RewardClaimInline]

    @admin.display(description="Claimed")
    def claimed(self, obj):
        return obj.claims.count()
