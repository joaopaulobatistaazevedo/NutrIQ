#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Sempre usar pasta de runtime baseada no utilizador
RUN_DIR="$ROOT_DIR/.run-${USER:-user}"
LOG_DIR="$RUN_DIR/logs"
PID_DIR="$RUN_DIR/pids"

mkdir -p "$LOG_DIR" "$PID_DIR"

MYSQL_CONTAINER="bugsbyte-mysql"
MYSQL_PORT="3307"
BACKEND_PORT="7071"
CHATBOT_PORT="8000"
FRONTEND_PORT="5173"

BACKEND_LOG="$LOG_DIR/backend.log"
CHATBOT_LOG="$LOG_DIR/chatbot.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
CHATBOT_PID_FILE="$PID_DIR/chatbot.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"

PYTHON_BIN="$ROOT_DIR/.venv/bin/python"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "[ERRO] Python da venv não encontrado em $PYTHON_BIN"
  echo "Cria primeiro a venv no root: python -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

is_port_listening() {
  local port="$1"
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ":${port}$"
}

wait_for_http() {
  local url="$1"
  local timeout_sec="${2:-45}"
  local start_ts
  start_ts="$(date +%s)"
  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    if (( $(date +%s) - start_ts >= timeout_sec )); then return 1; fi
    sleep 1
  done
}

start_mysql() {
  echo "[1/4] A garantir MySQL em Docker..."
  if docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
    echo "- MySQL já está a correr."
    return
  fi
  if docker ps -a --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
    docker start "$MYSQL_CONTAINER" >/dev/null
    echo "- MySQL container iniciado."
  else
    docker run -d \
      --name "$MYSQL_CONTAINER" \
      -e MYSQL_ROOT_PASSWORD=rootpass \
      -e MYSQL_DATABASE=bugsbyte \
      -e MYSQL_USER=bugsbyte \
      -e MYSQL_PASSWORD=uma_password_forte \
      -p "${MYSQL_PORT}:3306" \
      mysql:8.0 \
      --default-authentication-plugin=mysql_native_password >/dev/null
    echo "- MySQL container criado e iniciado."
  fi
  sleep 4
}

start_backend() {
  echo "[2/4] A garantir backend na porta ${BACKEND_PORT}..."
  if is_port_listening "$BACKEND_PORT"; then echo "- Backend já está ativo."; return; fi
  cd "$ROOT_DIR/backend"
  nohup env \
    MYSQL_HOST=127.0.0.1 \
    MYSQL_PORT="$MYSQL_PORT" \
    MYSQL_DB=bugsbyte \
    MYSQL_USER=bugsbyte \
    MYSQL_PASS=uma_password_forte \
    MYSQL_PARAMS='useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC' \
    PORT="$BACKEND_PORT" \
    mvn exec:java -Dexec.mainClass=alnak.Main \
    >"$BACKEND_LOG" 2>&1 &
  echo $! > "$BACKEND_PID_FILE"
  if wait_for_http "http://127.0.0.1:${BACKEND_PORT}/api/recipes" 90; then
    echo "- Backend iniciado com sucesso."
  else
    echo "[ERRO] Backend não ficou pronto. Ver log: $BACKEND_LOG"
    exit 1
  fi
}

seed_recipes_if_needed() {
  echo "- A verificar seed de receitas..."
  local recipe_count
  recipe_count="$($PYTHON_BIN - <<'PY'
import json, urllib.request
url = 'http://127.0.0.1:7071/api/recipes'
with urllib.request.urlopen(url, timeout=10) as r: data = json.loads(r.read().decode('utf-8'))
print(len(data) if isinstance(data, list) else 0)
PY
)"
  if [[ "$recipe_count" -gt 0 ]]; then echo "- Seed já existe (${recipe_count} receitas)."; return; fi
  echo "- Base vazia, a semear receitas de recipes_scraped.json..."
  cd "$ROOT_DIR"
  local seed_json="$ROOT_DIR/data/recipes_scraped.json"
  if [[ ! -f "$seed_json" ]]; then
    seed_json="$ROOT_DIR/recipes_scraped.json"
  fi
  if [[ ! -f "$seed_json" ]]; then
    echo "[ERRO] Ficheiro de seed não encontrado. Procurei em:"
    echo "       - $ROOT_DIR/data/recipes_scraped.json"
    echo "       - $ROOT_DIR/recipes_scraped.json"
    exit 1
  fi

  MYSQL_HOST=127.0.0.1 \
  MYSQL_PORT="$MYSQL_PORT" \
  MYSQL_DB=bugsbyte \
  MYSQL_USER=bugsbyte \
  MYSQL_PASS=uma_password_forte \
  MYSQL_PARAMS='useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC' \
  "$PYTHON_BIN" recipe_import.py --input "$seed_json" --db data/recipes.db
}

start_chatbot() {
  echo "[3/4] A garantir chatbot na porta ${CHATBOT_PORT}..."
  if is_port_listening "$CHATBOT_PORT"; then echo "- Chatbot já está ativo."; return; fi
  cd "$ROOT_DIR/chatbot-service"
  nohup "$PYTHON_BIN" main.py >"$CHATBOT_LOG" 2>&1 &
  echo $! > "$CHATBOT_PID_FILE"
  if wait_for_http "http://127.0.0.1:${CHATBOT_PORT}/health" 45; then
    echo "- Chatbot iniciado com sucesso."
  else
    echo "[ERRO] Chatbot não ficou pronto. Ver log: $CHATBOT_LOG"
    exit 1
  fi
}

start_frontend() {
  echo "[4/4] A garantir frontend na porta ${FRONTEND_PORT}..."
  if is_port_listening "$FRONTEND_PORT"; then echo "- Frontend já está ativo."; return; fi
  cd "$ROOT_DIR/frontend"
  nohup npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" >"$FRONTEND_LOG" 2>&1 &
  echo $! > "$FRONTEND_PID_FILE"
  if wait_for_http "http://127.0.0.1:${FRONTEND_PORT}" 45; then
    echo "- Frontend iniciado com sucesso."
  else
    echo "[ERRO] Frontend não ficou pronto. Ver log: $FRONTEND_LOG"
    exit 1
  fi
}

start_mysql
start_backend
seed_recipes_if_needed
start_chatbot
start_frontend

echo
echo "Tudo a correr:"
echo "- MySQL:    127.0.0.1:${MYSQL_PORT}"
echo "- Backend:  http://127.0.0.1:${BACKEND_PORT}"
echo "- Chatbot:  http://127.0.0.1:${CHATBOT_PORT}"
echo "- Frontend: http://127.0.0.1:${FRONTEND_PORT}"
echo "Logs em: $LOG_DIR"
