# Chatbot Service (Groq)

Serviço independente do frontend/backend para onboarding e assistência de meal planning.

## Escopo atual

- O chatbot **não recolhe dados pessoais base** (nome, idade, localização, altura, sexo, alergénicos clínicos).
- Esses dados vêm do perfil no backend (fora deste serviço).
- O chatbot recolhe e processa:
  - comidas favoritas
  - ingredientes que não gosta (opcional)
  - preço máximo semanal
  - número de dias para planear
- Em utilizador recorrente, faz follow-up sobre novos ingredientes gostados e ingredientes a incluir nos próximos planos.
- Meal planning final com receitas scraped do backend está preparado via `meal_plan_draft` (integração ainda pendente).

## Setup

1. Criar ambiente virtual:

```bash
python -m venv .venv
source .venv/bin/activate
```

2. Instalar dependências:

```bash
pip install -r requirements.txt
```

3. Configurar `.env` com a tua chave Groq:

```env
GROQ_API_KEY=...
MODEL_NAME=llama-3.1-8b-instant
```

4. Executar API:

```bash
python main.py
```

## Endpoints

- `GET /` status
- `GET /health` healthcheck
- `POST /chat/onboarding`
- `POST /chat/assistant`

## Campos de resposta

`POST /chat/onboarding`:
- `response`
- `onboarding_complete`
- `extracted_preferences` (quando completo)

`POST /chat/assistant`:
- `response`
- `meal_plan_draft` (quando pedido de planeamento é detetado)

## Exemplo onboarding

```bash
curl -X POST http://localhost:8000/chat/onboarding \
  -H "Content-Type: application/json" \
  -d '{"message":"Gosto de frango, aveia e ovos. Quero gastar no máximo 45 euros e planear 5 dias.","user_id":"u1"}'
```
