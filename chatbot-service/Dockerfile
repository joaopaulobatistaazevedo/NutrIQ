FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY chatbot-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY chatbot-service/ ./
COPY supermarket_scraper ./supermarket_scraper
COPY examples ./examples

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
