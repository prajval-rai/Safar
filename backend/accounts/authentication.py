from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class OptionalJWTAuthentication(JWTAuthentication):
    """For pages anyone may read (the Feed, a shared post, an invite link): a
    valid token identifies you, but a stale or broken one just means "signed
    out" instead of a 401."""

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except InvalidToken:
            return None
