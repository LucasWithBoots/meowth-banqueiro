# bot-gastos

Bot de Telegram só seu: você manda os gastos do jeito que falaria ("uber 50 saindo do rio") e ele registra com categoria, descrição e observação. Quando você pede, ele faz o resumo.

```
você: uber 50 reais saindo do rio
bot:  ✅ R$ 50,00 · Transporte · Uber (saindo do Rio)

você: almoço 32,90 no pix e ontem mercado 230
bot:  ✅ R$ 32,90 · Alimentação · Almoço
      ✅ R$ 230,00 · Mercado · Mercado

você: resumo do mês
bot:  Outubro até agora: R$ 1.284,30 em 23 gastos
      Mercado — R$ 512,00 (40%)
      Transporte — R$ 310,50 (24%)
      ...
```

Também entende foto de nota fiscal, correções ("o uber foi 60 na verdade", "apaga o último") e perguntas ("quanto gastei com transporte essa semana?").

Atalhos: `/resumo`, `/ultimos`, `/desfazer`, `/exportar` (planilha CSV com tudo).

## Como funciona

- **Telegram** via [grammY](https://grammy.dev), em long polling: não precisa de domínio, HTTPS nem porta aberta.
- **IA**: Claude (API da Anthropic). Cada mensagem vai para o modelo com cinco ferramentas (`registrar_gasto`, `resumo_gastos`, `listar_gastos`, `editar_gasto`, `apagar_gasto`). O modelo decide o que chamar; as contas do resumo são feitas no SQLite, não pela IA, então os números batem.
- **Banco**: SQLite num arquivo (`dados/gastos.db`), com o `node:sqlite` que já vem no Node. Os valores ficam em centavos.
- Só os chats em `CHATS_PERMITIDOS` usam o bot. Cada chat tem os gastos separados.

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

## Arquivos

- `src/bot.ts` — Telegram: comandos, texto, fotos, permissão.
- `src/agente.ts` — prompt e ferramentas da IA.
- `src/db.ts` — tabela e consultas no SQLite; a lista de categorias fica aqui.
- `src/formato.ts` — datas, R$ e CSV.
- `src/cli.ts` — conversa pelo terminal.
