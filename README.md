# Bugsbyte

Scraper de supermercados orientado por meal planner.

## O que este projeto faz

1. Lê um `meal_plan.json`.
2. Junta todos os ingredientes necessários.
3. Pesquisa cada ingrediente em cada supermercado configurado.
4. Escolhe a melhor opção por quantidade (ex.: 6 ovos em vez de pack 12 mais caro para a necessidade).
5. Gera um comparativo de preços e calorias (quando disponíveis), com total estimado por supermercado.

## Estrutura

- `main.py`: CLI principal.
- `supermarket_scraper/`: lógica do parser, scraper e relatório.
- `examples/meal_plan.json`: exemplo de meal planner.
- `examples/markets.json`: exemplo de supermercados/config de scraping.

## Requisitos

```bash
pip install -r requirements.txt
```

## Docker (Microserviços)

Stack dockerizada com containers separados:

- `mysql`
- `backend`
- `chatbot`
- `frontend`
- `supermarket-scraper`
- `orchestrator` (container que sincroniza/arranca seed inicial de forma consistente)

### Arranque único (igual para toda a equipa)

```bash
cp .env.docker.example .env.docker
# editar OPENAI_API_KEY no ficheiro .env.docker

docker compose --env-file .env.docker up --build -d
```

Depois do primeiro arranque, para desenvolvimento diário do frontend (hot-reload), podes usar:

```bash
docker compose --env-file .env.docker up -d
```

O serviço `frontend` corre Vite em modo dev dentro do container e recarrega automaticamente quando alteras ficheiros em `frontend/src`.

Para correr em modo compilado normal (sem frontend dev/hot-reload):

```bash
./scripts/docker/up_prod.sh .env.docker
```

Comando equivalente direto:

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml up --build -d
```

Endpoints:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:7071`
- Chatbot: `http://localhost:8000`
- MySQL: `localhost:3307`

Se já tiveres portas ocupadas, altera em `.env.docker`:
`FRONTEND_HOST_PORT`, `BACKEND_HOST_PORT`, `CHATBOT_HOST_PORT`, `MYSQL_HOST_PORT`.

Logs do orquestrador:

```bash
docker compose --env-file .env.docker logs -f orchestrator
```

Executar novamente apenas o scraper de supermercados:

```bash
docker compose --env-file .env.docker run --rm supermarket-scraper
```

`supermarket-scraper` escreve o relatório em `data/report.json` e o `orchestrator` importa-o para o backend quando disponível.

Partilha da BD MySQL entre equipa:

- coloca o dump partilhado em `data/mysql_seed.sql`
- no arranque, o `orchestrator` importa automaticamente esse ficheiro quando a BD estiver vazia (`MYSQL_SEED_MODE=if_empty`)

Gerar dump da tua BD docker atual:

```bash
docker compose --env-file .env.docker exec -T mysql \
  sh -lc 'mysqldump --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  > data/mysql_seed.sql
```

Para forçar reimport do seed na próxima subida:

```bash
MYSQL_SEED_FORCE=true docker compose --env-file .env.docker up -d orchestrator
```

Parar tudo:

```bash
docker compose --env-file .env.docker down
```

## Como usar

```bash
python3 main.py \
  --meal-plan examples/meal_plan.json \
  --markets examples/markets.json \
  --output report.json
```

Isso imprime uma tabela Markdown no terminal e salva os dados completos em `report.json`, incluindo `price` e `calories` quando encontrados.

## Scraper de Receitas (Track A)

Fluxo implementado:

1. Scrape de TeleCulinaria.
2. Extração de título, ingredientes, passos, tempo e porções.
3. Import/upsert em SQLite.
4. Sync automático para `backend` MySQL na tabela `recipes`.
5. Matching por ingredientes para sugerir refeições possíveis (print no terminal).

### 1) Scrape + import em SQLite

```bash
python3 recipe_main.py scrape \
  --db data/recipes.db \
  --output-json data/recipes_scraped.json \
  --max-recipes-per-source 60 \
  --max-pages-per-list 2 \
  --debug
```

Por padrão, no fim do scrape as receitas também são sincronizadas para a tabela
`recipes` do MySQL (credenciais lidas de `backend/.env`).

Para desativar:

```bash
python3 recipe_main.py scrape --db data/recipes.db --output-json data/recipes_scraped.json --skip-backend-sync
```

### 2) Import explícito JSON -> SQLite (script separado)

```bash
python3 recipe_import.py --input data/recipes_scraped.json --db data/recipes.db
```

### 3) Sugerir refeições com os ingredientes disponíveis

```bash
python3 recipe_main.py suggest \
  --db data/recipes.db \
  --report report.json
```

Modo estrito (apenas receitas 100% possíveis com os ingredientes disponíveis):

```bash
python3 recipe_main.py suggest \
  --db data/recipes.db \
  --report report.json \
  --only-possible
```

### 4) Fazer tudo de uma vez (scrape + sugestões)

```bash
python3 recipe_main.py run \
  --db data/recipes.db \
  --report report.json \
  --debug
```

## Diagnóstico de erros

Na tabela, quando não há preço, o projeto mostra códigos de erro:

- `DNS_ERR`: falha de resolução DNS (host não resolve).
- `NET_ERR`: bloqueio/conexão de rede.
- `HTTP_ERR`: site respondeu com erro HTTP (ex: 403).
- `TIMEOUT`: request excedeu timeout.
- `N/A`: request ok, mas produto/preço não foi encontrado com os seletores atuais.

Se aparecer `DNS_ERR`, valide a tua rede com:

```bash
nslookup www.google.com
```

Se falhar, corrige DNS no sistema/WSL/VPN (ex.: `1.1.1.1` e `8.8.8.8`) e executa novamente.

## Formato do meal planner

Você pode usar:

1. Lista direta em `ingredients`
2. Lista de `meals`, cada uma com seus `ingredients`

Exemplo:

```json
{
  "meals": [
    {
      "name": "Omelete",
      "ingredients": [
        {"name": "ovos", "quantity": 6, "unit": "un"},
        {"name": "queijo ralado", "quantity": 100, "unit": "g"}
      ]
    },
    {
      "name": "Salada",
      "ingredients": [
        {"name": "tomate", "quantity": 4, "unit": "un"},
        {"name": "alface", "quantity": 1, "unit": "un"}
      ]
    }
  ]
}
```

## Formato de supermercados

Cada supermercado precisa de:

- `name`
- `search_url` com placeholders:
  - `{query}`: ingrediente URL-encoded (ex.: `queijo+ralado`)
  - `{query_compact}`: ingrediente sem espaços (ex.: `queijoralado`)
  - `{query_raw}`: ingrediente original

Campos de scraping por seletor CSS são opcionais, mas recomendados:

- `result_selector`
- `title_selector`
- `price_selector`
- `link_selector`
- `product_url_patterns`: padrões de link de produto para fallback

O scraper tenta:

1. `JSON-LD` da página de busca (`Product`/`offers.price`)
2. seletores CSS configurados
3. fallback por link de produto (abre a página do produto e extrai preço por JSON-LD/meta)

## Observações importantes

- Sites podem bloquear scraping com frequência; use com responsabilidade.
- Seletores CSS mudam com o tempo e podem exigir manutenção.
- Preço retornado é o primeiro match encontrado na busca do supermercado.
