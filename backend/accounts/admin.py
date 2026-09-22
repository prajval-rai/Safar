from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class SafarUserAdmin(UserAdmin):
    list_display = ["username", "display_name", "home_city", "xp", "level", "is_staff"]
    search_fields = ["username", "display_name", "email"]
    fieldsets = UserAdmin.fieldsets + (
        (
            "Safar profile",
            {
                "fields": (
                    "display_name",
                    "home_city",
                    "bio",
                    "avatar_emoji",
                    "phone",
                    "xp",
                    "theme",
                    "color_mode",
                )
            },
        ),
    )
