FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./main.py
COPY supermarket_scraper ./supermarket_scraper
COPY examples ./examples

RUN mkdir -p /app/data

CMD ["python", "main.py", "--meal-plan", "examples/meal_plan.json", "--markets", "examples/markets.json", "--output", "data/report.json"]
