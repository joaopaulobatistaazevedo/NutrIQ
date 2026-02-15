FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY recipe_import.py ./recipe_import.py
COPY recipe_scraper ./recipe_scraper
COPY scripts/docker/orchestrator.py ./scripts/docker/orchestrator.py

RUN mkdir -p /app/data

CMD ["python", "scripts/docker/orchestrator.py"]
