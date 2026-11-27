# CRM WhatsApp — Taldo Studio 3D

CRM privado, de uma pessoa só, para o estúdio guardar quem chamou no WhatsApp, o assunto da conversa e os orçamentos ligados a esse cliente.

A landing page do site não muda. O CRM fica nesta pasta. Na sua máquina ele grava em SQLite. No app publicado, o hosting chama uma função web e não consegue guardar o SQLite.

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

## App publicado

O hosting do Cursor constrói esta pasta e chama `GET`, `POST`, `PATCH` e `DELETE` em `server.js`. Ele não sobe o processo que faz `listen`, e o `node:sqlite` experimental derruba a função. Por isso a função publicada não abre o arquivo SQLite.

O painel, a ficha e os orçamentos abrem do mesmo jeito. Os dados dessa instância ficam só na memória: somem quando ela reinicia. O painel avisa isso em português. Na sua máquina, `npm start` continua gravando em `crm/data/taldo.sqlite`.

## Testes

```bash
cd crm
npm test
```

## O que não entra nesta versão

- Vários usuários, login ou permissões dentro do próprio CRM. O app privado do Cursor já pede a conta de quem abre.
- API oficial do WhatsApp Business, envio automático ou histórico da conversa.
- Banco durável no app publicado. O hosting não persiste o SQLite.
