# Deploy no Coolify

O bot roda como um app no Coolify, numa VM sua (a deste projeto é uma VM da Oracle no plano gratuito). Ele não precisa de domínio nem de porta aberta: é ele que busca as mensagens no Telegram.

## 0. Antes de começar

Pare o bot no seu computador (Ctrl+C no `npm start`). Se o mesmo token rodar em dois lugares ao mesmo tempo, o Telegram derruba um deles.

## 1. Subir o código para o GitHub

1. Em https://github.com/new, crie um repositório chamado `meowth-banqueiro`, sem README, sem .gitignore e sem licença (o repositório local já tem tudo).
2. Na pasta do projeto, ligue o repositório local ao do GitHub e envie (troque `SEU-USUARIO`):
   ```bash
   git remote add origin https://github.com/SEU-USUARIO/meowth-banqueiro.git
   git push -u origin main
   ```
   O `.env` e a pasta `dados/` estão no `.gitignore`: o token, a chave e o banco não vão para o GitHub.

## 2. Dar acesso ao GitHub App do Coolify

Se o Coolify já tem um GitHub App instalado na sua conta, libere o repositório novo para ele:

GitHub › Settings › Applications › Installed GitHub Apps › o app do Coolify › Configure › Repository access › Only select repositories › adicione `meowth-banqueiro` › Save.

Basta acesso de leitura.

## 3. Criar o app no Coolify

No painel do seu Coolify:

1. **Projects** › **New Project**, com o nome `meowth-banqueiro`. Um projeto separado deixa o bot longe dos outros apps.
2. No ambiente `production`, **New Resource** › **Git Repository (with GitHub App)** › o app do Coolify › repositório `meowth-banqueiro` › branch `main`.
3. Build pack: **Dockerfile**. Continue.
4. Em **General**, troque o nome do app para `meowth-banqueiro` e salve.
5. Em **Domains**, remova o domínio que o Coolify gera sozinho. O bot não recebe acesso de fora.
6. **Healthcheck**: deixe desligado. O bot não tem página para o Coolify testar.

## 4. Variáveis de ambiente

Em **Environment Variables**, cadastre as mesmas do seu `.env`. Pela **Developer view** dá para colar todas de uma vez, uma por linha.

| variável | valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | o token do @BotFather |
| `ANTHROPIC_API_KEY` | a chave da Anthropic |
| `CHATS_PERMITIDOS` | o seu chat id |
| `MODELO` | `claude-haiku-5-5` |

Depois abra o `TELEGRAM_BOT_TOKEN` e a `ANTHROPIC_API_KEY` e mude **Build time** para **Not available during build** (clique em **Update Variable**). Assim os segredos só existem no container rodando, não no build.

`DB_PATH` não precisa: o Dockerfile já aponta para `/app/dados/gastos.db`.

## 5. Volume para o banco

Sem isso, o banco some a cada deploy.

**Persistent Storage** › **Add Mount** › **Volume mount**:
- Name: `meowth-banqueiro-dados`
- Destination Path: `/app/dados`

## 6. Deploy

Clique em **Deploy**. O primeiro build leva menos de um minuto. Em **Runtime Logs**, deve aparecer:

```
Bot rodando. Ctrl+C para parar.
```

Mande uma mensagem para o bot. Cada mensagem gera uma linha `[uso] ...` no log com os tokens gastos.

Daqui para frente, cada `git push` na `main` faz deploy sozinho.

## 7. Acesso ao servidor pelo seu computador

O `npm run banco:baixar` (cópia do banco para abrir no DBeaver) entra na VM por SSH. Ele lê o endereço da VM, a chave SSH e o id do app no Coolify do seu `.env` (`VM_HOST`, `VM_CHAVE`, `COOLIFY_APP`; veja o `.env.example`). Esses dados ficam fora do repositório.

Se o SSH der timeout, confira se o firewall da VM aceita o seu IP atual (na Oracle, a regra da porta 22 na Security List). Se der "Permission denied (publickey)", carregue a chave no agente com `ssh-add`.

## 8. (Opcional) Levar os lançamentos que já estão no seu computador

Só se quiser manter o que registrou no `dados/gastos.db` local. Faça com o bot local parado. Nos comandos abaixo, troque `CHAVE`, `USUARIO@IP-DA-VM` e `NOME` pelos seus valores.

1. Copie o banco para a VM:
   ```bash
   scp -i CHAVE dados/gastos.db USUARIO@IP-DA-VM:/tmp/gastos.db
   ```
2. Entre na VM:
   ```bash
   ssh -i CHAVE USUARIO@IP-DA-VM
   ```
3. Descubra o nome do container do bot (é o que usa a imagem do `meowth-banqueiro`):
   ```bash
   sudo docker ps --format '{{.Names}}  {{.Image}}'
   ```
4. Pare o container, copie o banco e suba de novo. O `-a` mantém o dono do arquivo como o usuário 1000, que é o mesmo usuário `node` que roda o bot:
   ```bash
   sudo docker stop NOME
   sudo docker cp -a /tmp/gastos.db NOME:/app/dados/gastos.db
   sudo docker start NOME
   rm /tmp/gastos.db
   ```
5. No Telegram, `/ultimos` deve mostrar seus lançamentos.

## Backup

O backup automático do Coolify cobre bancos como o Postgres, não este arquivo SQLite. Por enquanto, use o `/exportar` de vez em quando: ele manda a planilha com tudo para o seu Telegram.
