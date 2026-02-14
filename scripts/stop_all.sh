#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RUN_DIR="$ROOT_DIR/.run-${USER:-user}"
PID_DIR="$RUN_DIR/pids"

MYSQL_CONTAINER="bugsbyte-mysql"
BACKEND_PORT="7071"
CHATBOT_PORT="8000"
FRONTEND_PORT="5173"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
CHATBOT_PID_FILE="$PID_DIR/chatbot.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

pids_on_port() {
  local port="$1"
  ss -ltnp 2>/dev/null \
    | grep -E ":${port}[[:space:]]" \
    | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
    | sort -u
}

stop_pid_file() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "- $name: sem PID file."
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    echo "- $name: PID file vazio/removido."
    return
  fi

  if ! is_pid_running "$pid"; then
    rm -f "$pid_file"
    echo "- $name: processo já não estava ativo."
    return
  fi

  echo "- $name: a terminar PID $pid..."
  kill "$pid" >/dev/null 2>&1 || true

  for _ in {1..8}; do
    if ! is_pid_running "$pid"; then
      rm -f "$pid_file"
      echo "  -> terminado com sucesso."
      return
    fi
    sleep 0.5
  done

  echo "  -> a forçar terminação (SIGKILL)..."
  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$pid_file"
}

stop_by_port() {
  local name="$1"
  local port="$2"
  local pids
  pids="$(pids_on_port "$port" || true)"

  if [[ -z "$pids" ]]; then
    echo "- $name: porta $port já livre."
    return
  fi

  echo "- $name: a terminar processo(s) na porta $port: $pids"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    kill "$pid" >/dev/null 2>&1 || true
  done <<< "$pids"

  sleep 1

  local remaining
  remaining="$(pids_on_port "$port" || true)"
  if [[ -n "$remaining" ]]; then
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      kill -9 "$pid" >/dev/null 2>&1 || true
    done <<< "$remaining"
  fi
}

echo "A desligar serviços NutrIQ..."

stop_pid_file "Frontend" "$FRONTEND_PID_FILE"
stop_pid_file "Chatbot" "$CHATBOT_PID_FILE"
stop_pid_file "Backend" "$BACKEND_PID_FILE"

stop_by_port "Frontend" "$FRONTEND_PORT"
stop_by_port "Chatbot" "$CHATBOT_PORT"
stop_by_port "Backend" "$BACKEND_PORT"

if docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
  echo "- MySQL: a parar container ${MYSQL_CONTAINER}..."
  docker stop "$MYSQL_CONTAINER" >/dev/null
  echo "  -> MySQL parado."
else
  echo "- MySQL: container já estava parado."
fi

echo "Tudo desligado."
