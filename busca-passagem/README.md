# busca-passagem

Agente **pessoal** (você + esposa): monitora rotas, acha preço baixo e manda
**link pra comprar** no Google Flights / Kayak / Skyscanner / Decolar.
Não reserva nem emite bilhete.

## Subir local

```bash
cd busca-passagem
cp .env.example .env
npx @grok/agent-sdk@0.2.29 login
npx @grok/agent-sdk@0.2.29 dev
# http://127.0.0.1:3000/playground
```

Sem `TRAVELPAYOUTS_TOKEN` as cotações são mock; os **links de compra são reais**.

## Uso

1. No playground: *“Monitora GRU→LIS em 2026-12-01, 2 adultos, teto 2000 BRL”*
2. *“Busca o preço agora”* ou dispare o cron:
   `curl -X POST http://127.0.0.1:3000/busca-passagem/v1/dev/schedules/price-watch`
3. WhatsApp (opcional): Evolution → `POST .../v1/channels/whatsapp/inbound`

## Preços reais (opcional)

Conta grátis em [Travelpayouts](https://www.travelpayouts.com/) → Profile → API token →
`TRAVELPAYOUTS_TOKEN` no `.env`.
