# busca-passagem

Agente **pessoal** (você + esposa): monitora rotas, lista preços num **dashboard HTML**
e manda link pra comprar. Não reserva nem emite bilhete.

## Subir local

```bash
cd busca-passagem
cp .env.example .env
npx @grok/agent-sdk@0.2.29 login   # ou CURSOR_API_KEY no .env

# Cron WhatsApp (carro a cada 2h) SÓ roda sem --dev:
npx @grok/agent-sdk@0.2.29 serve --dir . --allow-anonymous
# http://127.0.0.1:3000/busca-passagem/playground

# `agent-sdk dev` NÃO dispara schedule — use só pra debug manual:
# curl -X POST http://127.0.0.1:3000/busca-passagem/v1/dev/schedules/car-price-watch
```

Digest manual agora: `npx tsx scripts/send-car-digest-now.mjs`

## Uso

1. No playground: *“Busca GRU→LIS 2026-12-01, 2 adultos, teto 2000 e abre o dashboard”*
2. O agente chama `show-deals-board` e devolve uma URL tipo  
   `http://127.0.0.1:3000/busca-passagem/v1/artifacts/.../content`
3. Cron automático só com `serve` (não `dev`). Em `dev`: `POST /busca-passagem/v1/dev/schedules/car-price-watch`

## Preços reais

Sem `TRAVELPAYOUTS_TOKEN` → **mock**. Com token → cache Aviasales real.

1. Conta em [Travelpayouts](https://www.travelpayouts.com/)
2. Profile → API token → `TRAVELPAYOUTS_TOKEN` no `.env`
3. Reinicie o `dev`

## Aluguel de carro

Tools: `upsert-car-watch`, `list-car-watches`, `show-car-deals-board`, `show-car-compare`, `run-car-price-watch`.  
Schedule: `car-price-watch` (a cada 2h; alerta WhatsApp na hora se preço ≤ teto).

- `maxPrice` = **total** da locação (BRL), não por dia.
- Sem API de preço de carro no token: board entrega **links ao vivo** + faixa estimada.
- Grave um valor visto com `lastSeenPrice` no `upsert-car-watch` para alertar abaixo do teto.
- Comparativo REC vs MCZ: `show-car-compare` — SUV/T-Cross (R$170/dia) **e** hatch Polo/HB20 (R$120/dia) + lojas.

Watches Natal/Ano Novo: **REC** e **MCZ**, retirada `2026-12-23 14:00`, devolução `2027-01-01 12:00`, **SUV / T-Cross**, teto **R$170/dia** (~R$1.530 total).
