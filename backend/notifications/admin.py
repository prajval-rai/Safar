from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["user", "kind", "title", "read", "created_at"]
    list_filter = ["kind", "read"]
    search_fields = ["user__username", "title", "body"]
    autocomplete_fields = ["user", "actor"]
