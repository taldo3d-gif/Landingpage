# busca-passagem

Agente Agent SDK que monitora preços de passagens (Amadeus), cria **hold** quando o preço cai no teto, e avisa no **WhatsApp** (Evolution API) para você confirmar com SIM / NÃO.

## Subir local

```bash
cd busca-passagem
cp .env.example .env   # preencha Amadeus + Evolution quando tiver
npx @grok/agent-sdk@0.2.29 login   # credencial Cursor p/ turnos de modelo
npx @grok/agent-sdk@0.2.29 dev
# Playground: http://127.0.0.1:3000/playground
```

Sem chaves Amadeus/Evolution as tools rodam em **mock** (busca falsa + log de WhatsApp).

## Fluxo

1. No playground: peça para cadastrar um watch (`upsert-watch`).
2. Dispare o cron em dev:
   `curl -X POST http://127.0.0.1:3000/busca-passagem/v1/dev/schedules/price-watch`
3. Ou chame `run-price-watch` no chat.
4. Evolution webhook → `POST /busca-passagem/v1/channels/whatsapp/inbound`  
   Header: `x-webhook-secret: $WHATSAPP_WEBHOOK_SECRET`

## Checks

```bash
npx @grok/agent-sdk@0.2.29 validate --dir .
npx @grok/agent-sdk@0.2.29 info --dir . --json
npm run check
```
