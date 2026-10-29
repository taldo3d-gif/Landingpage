# busca-passagem

Agente **pessoal** (você + esposa): monitora rotas, lista preços num **dashboard HTML**
e manda link pra comprar. Não reserva nem emite bilhete.

## Subir local

```bash
cd busca-passagem
cp .env.example .env
npx @grok/agent-sdk@0.2.29 login   # ou CURSOR_API_KEY no .env
npx @grok/agent-sdk@0.2.29 dev
# http://127.0.0.1:3000/busca-passagem/playground
```

## Uso

1. No playground: *“Busca GRU→LIS 2026-12-01, 2 adultos, teto 2000 e abre o dashboard”*
2. O agente chama `show-deals-board` e devolve uma URL tipo  
   `http://127.0.0.1:3000/busca-passagem/v1/artifacts/.../content`
3. Cron: `POST /busca-passagem/v1/dev/schedules/price-watch`

## Preços reais

Sem `TRAVELPAYOUTS_TOKEN` → **mock**. Com token → cache Aviasales real.

1. Conta em [Travelpayouts](https://www.travelpayouts.com/)
2. Profile → API token → `TRAVELPAYOUTS_TOKEN` no `.env`
3. Reinicie o `dev`
