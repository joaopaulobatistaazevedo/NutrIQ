# Rodar O Projeto Em Outro PC (Docker)

Este guia arranca toda a stack de microserviços com o mesmo comportamento:

- `mysql`
- `backend`
- `chatbot`
- `frontend`
- `supermarket-scraper`
- `orchestrator` (faz seed automático)

## 1) Pré-requisitos

- Docker + Docker Compose plugin
- Git

## 2) Clonar o repositório

```bash
git clone <URL_DO_REPO>
cd Bugsbyte
```

## 3) Configurar ambiente Docker

```bash
cp .env.docker.example .env.docker
```

Editar `.env.docker`:

- `OPENAI_API_KEY` (obrigatório para chatbot com OpenAI)
- portas (se necessário): `MYSQL_HOST_PORT`, `BACKEND_HOST_PORT`, `CHATBOT_HOST_PORT`, `FRONTEND_HOST_PORT`

## 4) Garantir seed da base de dados partilhada

O seed MySQL partilhado deve existir em:

- `data/mysql_seed.sql`

No arranque, o `orchestrator` importa automaticamente este ficheiro se a base estiver vazia (`MYSQL_SEED_MODE=if_empty`).

## 5) Arrancar tudo

```bash
docker compose --env-file .env.docker up --build -d
```

Após o primeiro build, para desenvolvimento normal (frontend reativo/hot-reload), usa:

```bash
docker compose --env-file .env.docker up -d
```

Qualquer alteração em `frontend/src` reflete no browser sem rebuild da imagem.

Modo compilado normal (sem frontend em dev):

```bash
./scripts/docker/up_prod.sh .env.docker
```

Equivalente:

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml up --build -d
```

## 6) Validar

```bash
docker compose --env-file .env.docker ps -a
docker compose --env-file .env.docker logs -f orchestrator
```

Mensagens esperadas no `orchestrator`:

- `Import de seed MySQL concluído.`
- ou `MySQL já contém dados de aplicação. A saltar import do mysql_seed.sql.`

## 7) Endpoints

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:7071`
- Chatbot: `http://localhost:8000`
- MySQL: `localhost:3307`

## 8) Ver a base MySQL

```bash
docker compose --env-file .env.docker exec mysql mysql -u bugsbyte -p bugsbyte
```

Dentro do MySQL:

```sql
SHOW TABLES;
SELECT COUNT(*) FROM recipes;
SELECT COUNT(*) FROM users;
```

## 9) Forçar reimport do seed MySQL

```bash
MYSQL_SEED_FORCE=true docker compose --env-file .env.docker up -d orchestrator
```

## 10) Parar

```bash
docker compose --env-file .env.docker down
```

Reset total (apaga volumes locais):

```bash
docker compose --env-file .env.docker down -v
```

## 11) Como partilhar com a equipa

Para os outros PCs receberem a mesma BD, é obrigatório versionar e fazer push de:

- `data/mysql_seed.sql`
- `docker-compose.yml`
- `scripts/docker/orchestrator.py`
- Dockerfiles criados
- `.env.docker.example`

Sem commit/push de `data/mysql_seed.sql`, os outros não vão receber os teus dados.
