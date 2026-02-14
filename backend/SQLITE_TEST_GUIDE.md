# Bugsbyte Backend + SQLite (Guia de Execucao e Testes)

Este backend agora usa persistencia real em SQLite para:
- autenticacao (`users`)
- perfil (`user_profiles`)
- restricoes (`user_profile_restrictions`)
- alergenios (`user_profile_allergens`)

## 1. Requisitos

- Java 21+
- Maven
- `curl`
- Opcional: `sqlite3` para inspecionar a base de dados

## 2. Arranque

No terminal:

```bash
cd /home/dahmer/Bugsbyte/Bugsbyte/backend
mvn -q -DskipTests compile
PORT=7071 mvn exec:java -Dexec.mainClass=alnak.Main
```

Notas:
- Se quiseres usar a porta default, omite `PORT=7071`.
- Se der `Address already in use`, muda a porta (`PORT=7072`) ou termina o processo que esta a usar a porta atual.

## 3. Fluxo de teste rapido (API)

### 3.1 Registar utilizador

```bash
curl -s -X POST http://localhost:7071/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana","email":"ana@example.com","password":"123456"}'
```

Resposta esperada (exemplo):

```json
{"userId":1,"token":"stub-token-1"}
```

### 3.2 Login

```bash
curl -s -X POST http://localhost:7071/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@example.com","password":"123456"}'
```

### 3.3 Guardar token numa variavel

```bash
TOKEN=$(curl -s -X POST http://localhost:7071/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@example.com","password":"123456"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

echo "$TOKEN"
```

### 3.4 Atualizar perfil

```bash
curl -s -X PUT http://localhost:7071/api/users/me/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "age":24,
    "sex":"F",
    "heightCm":165,
    "weightKg":58.5,
    "goal":"MAINTAIN",
    "restrictions":["VEGETARIAN","LOW_CARB"],
    "allergens":["GLUTEN","EGGS"],
    "maxWeeklyBudget":55.0
  }'
```

### 3.5 Ler perfil autenticado

```bash
curl -s http://localhost:7071/api/users/me \
  -H "Authorization: Bearer $TOKEN"
```

### 3.6 Endpoints de debug

```bash
curl -s http://localhost:7071/api/debug/users
curl -s http://localhost:7071/api/debug/users/1
```

## 4. Confirmar persistencia no SQLite

Base de dados criada em:

- `backend/database/meal_planner.db`

Com `sqlite3`:

```bash
cd /home/dahmer/Bugsbyte/Bugsbyte/backend
sqlite3 database/meal_planner.db ".tables"

sqlite3 database/meal_planner.db "SELECT id, name, email, created_at FROM users;"
sqlite3 database/meal_planner.db "SELECT user_id, age, sex, height_cm, weight_kg, goal, daily_calories, budget_weekly FROM user_profiles;"
sqlite3 database/meal_planner.db "SELECT user_id, restriction FROM user_profile_restrictions ORDER BY user_id, restriction;"
sqlite3 database/meal_planner.db "SELECT user_id, allergen FROM user_profile_allergens ORDER BY user_id, allergen;"
```

## 5. Limpar estado de testes (opcional)

Se quiseres reiniciar do zero:

```bash
cd /home/dahmer/Bugsbyte/Bugsbyte/backend
rm -rf database
```

Depois volta a arrancar o servidor.

## 6. Erros comuns

- `Email ja registado`:
  - o email ja existe na tabela `users`.
- `Credenciais invalidas`:
  - email inexistente ou password errada.
- `Header Authorization invalido`:
  - falta `Bearer <token>`.
- `Alergenio invalido: ...`:
  - valor nao existe no enum `Allergen`.
