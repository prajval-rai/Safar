#!/usr/bin/env bash
# Railway (Railpack) runs this to start the app. Railpack's Python provider
# already runs `pip install -r requirements.txt` during its build step; this
# script handles the Django-specific deploy steps and then hands off to gunicorn.
set -o errexit
python manage.py collectstatic --no-input
python manage.py migrate --no-input
python manage.py ensure_superuser
python manage.py seed_achievements
exec gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2
