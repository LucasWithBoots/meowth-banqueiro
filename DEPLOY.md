# Deploy no Coolify (VM da Oracle)

O bot roda como mais um app no Coolify da sua VM. Ele não precisa de domínio nem de porta aberta: é ele que busca as mensagens no Telegram.

## 0. Antes de começar

Pare o bot no seu computador (Ctrl+C no `npm start`). Se o mesmo token rodar em dois lugares ao mesmo tempo, o Telegram derruba um deles.

## 1. Subir o código para o GitHub

1. Em https://github.com/new, crie um repositório **privado** chamado `bot-gastos`, sem README, sem .gitignore e sem licença (o repositório local já tem tudo).
2. Na pasta do projeto, ligue o repositório local ao do GitHub e envie (troque `SEU-USUARIO`):
   ```bash
   git remote add origin git@github.com:SEU-USUARIO/bot-gastos.git
   git push -u origin main
   ```
   O `.env` e a pasta `dados/` estão no `.gitignore`: o token, a chave e o banco não vão para o GitHub.

## 2. Dar acesso ao GitHub App do Coolify

O app `app-do-coolify` hoje só enxerga outros repositórios.

GitHub › Settings › Applications › Installed GitHub Apps › `app-do-coolify` › Configure › Repository access › Only select repositories › adicione `bot-gastos` › Save.

O acesso continua só de leitura.

## 3. Criar o app no Coolify

Em https://seu-coolify.exemplo.com:

1. Abra o projeto (pode ser o "My first project" ou um novo, "bot-gastos") › ambiente `production` › **+ New**.
2. Escolha **Private Repository (with GitHub App)** › `app-do-coolify` › repositório `bot-gastos` › branch `main`.
3. Build Pack: **Dockerfile**. Continue.
4. Na tela do app, em **General**:
   - **Domains**: apague o domínio que o Coolify sugere e deixe vazio. O bot não recebe acesso de fora.
   - **Ports Exposes**: o campo é obrigatório; pode deixar `3000`. Nada escuta nessa porta.
   - Salve.
5. **Healthcheck**: deixe desligado. O bot não tem página para o Coolify testar.

## 4. Variáveis de ambiente

Em **Environment Variables**, cadastre as mesmas do seu `.env`, só em runtime (desmarque a opção de build):

| variável | valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | o token do @BotFather |
| `ANTHROPIC_API_KEY` | a chave da Anthropic |
| `CHATS_PERMITIDOS` | o seu chat id |
| `MODELO` | `claude-haiku-5-5` |

`DB_PATH` não precisa: o Dockerfile já aponta para `/app/dados/gastos.db`.

## 5. Volume para o banco

Sem isso, o banco some a cada deploy.

**Persistent Storage** › **+ Add** › Volume:
- Name: `bot-gastos-dados`
- Destination Path: `/app/dados`

## 6. Deploy

Clique em **Deploy**. O primeiro build leva uns minutos (a VM é ARM e baixa a imagem do Node). Na aba **Logs** do app, deve aparecer:

```
Bot rodando. Ctrl+C para parar.
```

Mande uma mensagem para o bot. Cada mensagem gera uma linha `[uso] ...` no log com os tokens gastos.

Daqui para frente, cada `git push` na `main` faz deploy sozinho.

## 7. (Opcional) Levar os gastos que já estão no seu computador

Só se quiser manter o que registrou até agora no `dados/gastos.db` local. Faça com o bot local parado.

O SSH só aceita o seu IP atual: se der timeout, atualize a regra da porta 22 na Security List da Oracle com o IP de https://api.ipify.org. Se der "Permission denied (publickey)", rode `ssh-add --apple-load-keychain`.

1. Copie o banco para a VM:
   ```bash
   scp -i ~/.ssh/sua-chave dados/gastos.db USUARIO@IP-DA-VM:/tmp/gastos.db
   ```
2. Entre na VM:
   ```bash
   ssh -i ~/.ssh/sua-chave USUARIO@IP-DA-VM
   ```
3. Descubra o nome do container do bot (é o que usa a imagem do `bot-gastos`):
   ```bash
   sudo docker ps --format '{{.Names}}  {{.Image}}'
   ```
4. Pare o container, copie o banco e suba de novo (troque `NOME`). O `-a` mantém o dono do arquivo como o usuário 1000, que é o mesmo usuário `node` que roda o bot:
   ```bash
   sudo docker stop NOME
   sudo docker cp -a /tmp/gastos.db NOME:/app/dados/gastos.db
   sudo docker start NOME
   rm /tmp/gastos.db
   ```
5. No Telegram, `/ultimos` deve mostrar seus gastos.

## Backup

O backup automático do Coolify cobre o Postgres, não este arquivo SQLite. Por enquanto, use o `/exportar` de vez em quando: ele manda a planilha com tudo para o seu Telegram.
