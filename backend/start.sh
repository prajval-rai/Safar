#!/usr/bin/env bash
# Railway (Railpack) runs this to start the app. Railpack's Python provider
# already runs `pip install -r requirements.txt` during its build step; this
# script handles the Django-specific deploy steps and then hands off to gunicorn.
set -o errexit
# Where uploads and static files go (Google Cloud Storage or this server),
# with a real test upload — the answer lands in the deploy logs. If the bucket
# isn't reachable, static files fall back to the app so the site still starts.
if ! python manage.py check_storage --strict; then
  echo "Google Cloud Storage isn't working (see above) - serving static files from the app for now."
  export GS_STATIC=0
fi
python manage.py collectstatic --no-input
python manage.py migrate --no-input
python manage.py ensure_superuser
python manage.py seed_achievements
exec gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2
