# Meowth Banqueiro

Bot de Telegram só seu: você manda os gastos e o dinheiro que entrou do jeito que falaria ("uber 50 saindo do rio", "caiu o salário, 4500") e ele registra com categoria, descrição e observação. Quando você pede, ele faz o resumo com quanto entrou, quanto saiu e o saldo.

```
você: uber 50 reais saindo do rio
bot:  ✅ R$ 50,00 · Transporte · Uber (saindo do Rio)

você: almoço 32,90 no pix e ontem mercado 230
bot:  ✅ R$ 32,90 · Alimentação · Almoço
      ✅ R$ 230,00 · Mercado · Mercado · 📅 21/10

você: o joão me pagou 80 do churrasco
bot:  💰 +R$ 80,00 · Reembolso · João (churrasco)

você: resumo do mês
bot:  💰 Entradas: R$ 4.880,00
      ✅ Gastos: R$ 1.284,30
      Saldo: R$ 3.595,70
      ...
```

Também entende foto de nota fiscal, correções ("o uber foi 60 na verdade", "apaga o último") e perguntas ("quanto gastei com transporte essa semana?", "quanto entrou esse mês?").

Atalhos: `/resumo`, `/ultimos`, `/desfazer`, `/exportar` (planilha CSV com tudo).

## Como funciona

- **Telegram** via [grammY](https://grammy.dev), em long polling: não precisa de domínio, HTTPS nem porta aberta.
- **IA**: Claude (API da Anthropic). Cada mensagem vai para o modelo com seis ferramentas (`registrar_gasto`, `registrar_entrada`, `resumo_periodo`, `listar_lancamentos`, `editar_lancamento`, `apagar_lancamento`). O modelo decide o que chamar; as contas do resumo são feitas no SQLite, não pela IA, então os números batem.
- **Banco**: SQLite num arquivo (`dados/gastos.db`), com o `node:sqlite` que já vem no Node. Gastos e entradas ficam na tabela `lancamentos`, separados pela coluna `tipo` (`gasto` ou `entrada`). Os valores ficam em centavos (`valor_centavos`). Um banco antigo, com a tabela `gastos`, é convertido sozinho na primeira vez que o bot sobe.
- Só os chats em `CHATS_PERMITIDOS` usam o bot. Cada chat tem os lançamentos separados.

## Rodando

Precisa de Node 22.18 ou mais novo (roda o TypeScript direto, sem build).

1. **Crie o bot**: no Telegram, fale com o [@BotFather](https://t.me/BotFather), mande `/newbot` e guarde o token.
2. **Pegue uma chave da API** em [console.anthropic.com](https://console.anthropic.com) → API Keys.
3. Configure:
   ```bash
   cp .env.example .env
   ```
   Preencha `TELEGRAM_BOT_TOKEN` e `ANTHROPIC_API_KEY`. Deixe `CHATS_PERMITIDOS` vazio por enquanto.
4. Instale e suba:
   ```bash
   npm install
   npm start
   ```
5. Mande qualquer coisa para o bot. Ele responde com o seu chat id; coloque esse número em `CHATS_PERMITIDOS`, pare o bot (Ctrl+C) e rode `npm start` de novo.

Para testar a IA sem o Telegram: `npm run cli -- "uber 50 saindo do rio"` (ou só `npm run cli` para conversar). Use `DB_PATH=dados/teste.db` na frente para não sujar o banco de verdade.

## Custo

Cada mensagem dá duas chamadas curtas (registrar + confirmar), e o log mostra os tokens de cada uma (`[uso] ...`). Medido com as mensagens de teste, por mensagem:

| modelo | custo por mensagem | 300 mensagens/mês |
|---|---|---|
| `claude-haiku-5-5` | ~US$ 0,0005 | ~US$ 0,15 |
| `claude-opus-5-5` (padrão do código) | ~US$ 0,02 | ~US$ 6 |

Os dois acertaram os mesmos testes (registro, datas, correção, foto de nota, resumo). O Opus comenta melhor no resumo (por exemplo, avisou que uma nota podia estar duplicada); para registrar gasto o Haiku basta. Escolha no `.env`:

```
MODELO=claude-haiku-5-5
```

## Deixando no ar

O bot roda no Coolify da VM da Oracle, com o `Dockerfile` do projeto e um volume para o banco. O passo a passo está em [DEPLOY.md](DEPLOY.md).

Faça backup do banco de vez em quando, ou use `/exportar`.

## Olhando o banco de produção

O banco de produção é um arquivo SQLite dentro do volume do Coolify, sem porta para conectar. Para consultar no DBeaver, baixe uma cópia:

```bash
npm run banco:baixar
```

A cópia vai para `dados/producao.db`. No DBeaver, abra uma conexão SQLite apontando para esse arquivo; os dados estão na tabela `lancamentos`. É uma foto do momento: rode de novo para ver lançamentos novos, e corrija dados pelo bot, não pela cópia.

O script entra na VM por SSH, então vale a mesma regra do resto: a porta 22 só aceita o seu IP atual.

## Arquivos

- `src/bot.ts` — Telegram: comandos, texto, fotos, permissão.
- `src/agente.ts` — prompt e ferramentas da IA.
- `src/db.ts` — tabela e consultas no SQLite; a lista de categorias fica aqui.
- `src/formato.ts` — datas, R$ e CSV.
- `src/cli.ts` — conversa pelo terminal.
- `scripts/baixar-banco.sh` — baixa a cópia do banco de produção (`npm run banco:baixar`).
