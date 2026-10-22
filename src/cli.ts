// Conversa com o bot pelo terminal, sem Telegram. Útil para testar a IA.
// Uso: npm run cli            (modo interativo)
//      npm run cli -- "uber 50 saindo do rio"
import { createInterface } from "node:readline/promises";
import { responder } from "./agente.ts";

const CHAT_ID = 0;
const argumento = process.argv.slice(2).join(" ");

if (argumento) {
  console.log(await responder({ chatId: CHAT_ID, texto: argumento }));
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for await (const linha of rl) {
    if (!linha.trim()) continue;
    if (!process.stdin.isTTY) console.log(`> ${linha}`);
    console.log(`\n${await responder({ chatId: CHAT_ID, texto: linha })}\n`);
  }
}
