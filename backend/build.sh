#!/usr/bin/env bash
# Render build step: install, collect static files, migrate.
set -o errexit
pip install -r requirements.txt
python manage.py check_storage
python manage.py collectstatic --no-input
python manage.py migrate --no-input
