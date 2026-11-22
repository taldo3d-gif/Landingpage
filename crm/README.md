# CRM WhatsApp — Taldo Studio 3D

CRM privado, de uma pessoa só, para o estúdio guardar quem chamou no WhatsApp, o assunto da conversa e os orçamentos ligados a esse cliente.

A landing page do site não muda. O CRM fica nesta pasta e roda na sua máquina. Ele não entra no deploy da Vercel.

## O que faz

- Guarda cada cliente com nome, WhatsApp e uma nota curta do assunto.
- Lista os clientes e os orçamentos de cada um: título, valor e situação.
- Situações: rascunho, enviado, aprovado e recusado.
- Abre a conversa num link `wa.me`, com uma mensagem pronta citando o assunto. Não usa a API do WhatsApp Business e não envia mensagem sozinho.

## Como rodar

É preciso Node.js 22.13 ou mais novo.

```bash
cd crm
npm start
```

Abra [http://127.0.0.1:4173](http://127.0.0.1:4173). O servidor escuta só em `127.0.0.1`.

Os dados ficam em `crm/data/taldo.sqlite` e continuam lá depois de fechar o app. Essa pasta está no `.gitignore`: não suba o banco, ele tem telefone de cliente.

Outra porta, se a 4173 estiver ocupada:

```bash
PORT=4180 npm start
```

## Testes

```bash
cd crm
npm test
```

## O que não entra nesta versão

- Vários usuários, login ou permissões.
- API oficial do WhatsApp Business, envio automático ou histórico da conversa.
- Publicação na internet. O app é local; a landing continua sendo o único site público.
