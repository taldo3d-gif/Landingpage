# CRM WhatsApp — Taldo Studio 3D

CRM de uma pessoa só, para o estúdio guardar quem chamou no WhatsApp, o assunto da conversa e os orçamentos ligados a esse cliente.

A landing page do site não muda. Ela continua no deploy da Vercel a partir da raiz do repositório. O CRM é outro projeto Vercel, com **Root Directory** `crm`.

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

Abra [http://127.0.0.1:4173](http://127.0.0.1:4173). Sem a variável `PORT`, o servidor escuta só em `127.0.0.1`.

Na sua máquina, os dados ficam em `crm/data/taldo.sqlite` e continuam lá depois de fechar o app. Essa pasta está no `.gitignore`: não suba o banco, ele tem telefone de cliente.

Outra porta, se a 4173 estiver ocupada:

```bash
PORT=4180 npm start
```

Com `PORT` definida, o processo escuta em `0.0.0.0` nessa porta. A Vercel define `PORT` e precisa desse endereço. Sem `PORT`, `npm start` segue em `127.0.0.1:4173`.

## Deploy na Vercel

O projeto do CRM usa a pasta `crm` como raiz. O `.vercelignore` da raiz do repositório não pode listar `crm`: a Vercel aplica esse arquivo no clone inteiro, antes do Root Directory, e o build fica sem `server.js`.

O entrypoint é `server.js`.

## Os dados não sobrevivem a um restart na Vercel

O programa continua com o SQLite de hoje. Não há outro banco. Na Vercel o disco da função é efêmero e não é compartilhado entre instâncias: clientes e orçamentos somem quando a instância reinicia, quando outra instância atende o pedido, ou quando um deploy novo entra no lugar. Se a pasta do app não puder ser gravada, o processo usa um SQLite em diretório temporário, com o mesmo fim.

Na sua máquina, `crm/data/taldo.sqlite` continua depois de fechar o programa.

## Testes

```bash
cd crm
npm test
```

## O que não entra nesta versão

- Vários usuários, login ou permissões.
- API oficial do WhatsApp Business, envio automático ou histórico da conversa.
- Banco que permaneça depois de um restart na Vercel.
