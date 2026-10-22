import { Bot, InputFile, type Context } from "grammy";
import { responder, type Entrada } from "./agente.ts";
import * as db from "./db.ts";
import { csv, hoje, linhaGasto } from "./formato.ts";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN no .env");

const permitidos = new Set(
  (process.env.CHATS_PERMITIDOS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const bot = new Bot(token);

// O bot é só seu: qualquer outro chat recebe o próprio id e mais nada.
bot.use(async (ctx, next) => {
  const id = String(ctx.chat?.id ?? "");
  if (permitidos.has(id)) return next();
  await ctx.reply(
    `Este bot é privado.\n\nSeu chat id é ${id}. Se o bot é seu, coloque esse número em CHATS_PERMITIDOS no .env e reinicie.`,
  );
});

const AJUDA = `Me manda seus gastos do jeito que vier na cabeça:
• uber 50 saindo do rio
• almoço 32,90 no pix
• ontem mercado 230
• (ou a foto de uma nota)

E pergunta o que quiser:
• resumo do mês
• quanto gastei com transporte essa semana?
• apaga o último

Atalhos:
/resumo — resumo do mês
/ultimos — últimos 10 gastos
/desfazer — apaga o último gasto
/exportar — planilha CSV com tudo`;

bot.command(["start", "ajuda"], (ctx) => ctx.reply(AJUDA));

bot.command("resumo", (ctx) => conversar(ctx, { texto: ctx.match || "resumo do mês atual" }));

bot.command("ultimos", async (ctx) => {
  const gastos = db.ultimosRegistrados(ctx.chat.id, 10);
  await ctx.reply(gastos.length ? gastos.map(linhaGasto).join("\n") : "Nenhum gasto registrado ainda.");
});

bot.command("desfazer", async (ctx) => {
  const [ultimo] = db.ultimosRegistrados(ctx.chat.id, 1);
  if (!ultimo) return ctx.reply("Nada para desfazer.");
  db.apagar(ctx.chat.id, ultimo.id);
  await ctx.reply(`🗑️ Apagado: ${linhaGasto(ultimo)}`);
});

bot.command("exportar", async (ctx) => {
  const gastos = db.todos(ctx.chat.id);
  if (!gastos.length) return ctx.reply("Nenhum gasto registrado ainda.");
  await ctx.replyWithDocument(new InputFile(Buffer.from(csv(gastos)), `gastos-${hoje()}.csv`));
});

bot.on("message:text", (ctx) => conversar(ctx, { texto: ctx.message.text }));

bot.on("message:photo", async (ctx) => {
  // A última foto da lista é a de maior resolução.
  const foto = ctx.message.photo.at(-1)!;
  const arquivo = await ctx.api.getFile(foto.file_id);
  const resp = await fetch(`https://api.telegram.org/file/bot${token}/${arquivo.file_path}`);
  const base64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
  await conversar(ctx, {
    texto: ctx.message.caption || "Registre o gasto desta foto.",
    imagem: { base64, mediaType: "image/jpeg" },
  });
});

async function conversar(ctx: Context, entrada: Omit<Entrada, "chatId">) {
  const chatId = ctx.chat!.id;
  await ctx.replyWithChatAction("typing");
  try {
    await ctx.reply(await responder({ chatId, ...entrada }));
  } catch (erro) {
    console.error(erro);
    await ctx.reply("Deu erro aqui do meu lado 😕 Tenta de novo daqui a pouco.");
  }
}

bot.catch((err) => console.error(err.error));

await bot.api.setMyCommands([
  { command: "resumo", description: "Resumo do mês" },
  { command: "ultimos", description: "Últimos 10 gastos" },
  { command: "desfazer", description: "Apaga o último gasto" },
  { command: "exportar", description: "Planilha CSV com tudo" },
  { command: "ajuda", description: "Como usar" },
]);

// No redeploy o Coolify manda SIGTERM: parar o polling direito evita que o
// container novo e o velho disputem as mensagens no Telegram.
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.once(sinal, () => bot.stop());
}

console.log("Bot rodando. Ctrl+C para parar.");
await bot.start();
