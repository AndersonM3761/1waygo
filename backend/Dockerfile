FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Start server directly (tables are auto-created in main.py)
# The $PORT variable is injected by Railway automatically
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port $PORT"]
