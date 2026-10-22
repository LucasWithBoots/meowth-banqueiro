import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import * as db from "./db.ts";
import { hoje, hojePorExtenso, linhaGasto } from "./formato.ts";

const client = new Anthropic();
const MODELO = process.env.MODELO ?? "claude-opus-5-5";

const SYSTEM = `Você é um bot de Telegram que registra os gastos pessoais de uma pessoa e responde perguntas sobre eles. Fale português do Brasil, curto e direto, como numa conversa de chat.

REGISTRAR
Quando a mensagem descreve um ou mais gastos, chame registrar_gasto uma vez para cada gasto. Escolha a categoria pelo contexto. Exemplo: "uber 50 reais saindo do rio" vira valor 50, categoria Transporte, descrição "Uber", observação "saindo do Rio".
- descrição: curta, o que foi ou onde foi ("Uber", "Almoço", "Farmácia", "iFood").
- observação: os detalhes extras que a pessoa deu (lugar, com quem, motivo, parcela). Vazia se não houver nada além do básico. Não invente detalhes.
- valor em reais: entende "50", "50 reais", "R$ 50,90", "50 conto", "1,2k", "mil e duzentos".
- data: se a pessoa não disser, é hoje. "ontem", "anteontem", "sexta", "dia 10", "15/10" você calcula a partir da data de hoje que vem no começo da mensagem. Um dia da semana sem mais nada ("sexta") é o mais recente que já passou.
- forma de pagamento só se a pessoa disser (pix, crédito, débito, dinheiro, VR...).
- Se não der para saber o valor, pergunte em vez de registrar.
Depois de registrar, confirme com uma linha por gasto, assim:
✅ R$ 50,00 · Transporte · Uber (saindo do Rio)
Quando a data não for hoje, acrescente a data no fim da linha, para a pessoa conferir:
✅ R$ 230,00 · Mercado · Mercado · 📅 21/10

CONSULTAR
Para resumos e perguntas ("resumo do mês", "quanto gastei com mercado?", "onde mais gastei semana passada?"), use resumo_gastos ou listar_gastos com o período certo. Todo número da resposta tem que aparecer exatamente assim no retorno de uma ferramenta. Não some nem subtraia nada de cabeça: se precisar de um total que não veio (só hoje, só a semana, duas categorias juntas), chame resumo_gastos de novo com esse período, ou deixe o número de fora. O resumo já traz o total de cada dia em por_dia. Se a pessoa não disser o período, use o mês atual.
Num resumo, mostre: o total do período; as categorias do maior para o menor com valor e percentual; os maiores gastos. Termine com uma ou duas observações úteis tiradas dos dados, aproveitando as observações dos gastos quando ajudarem (por exemplo, vários Ubers saindo do mesmo lugar, ou um gasto fora do padrão).

CORRIGIR
Para corrigir ou apagar ("apaga o último", "o uber foi 60 na verdade"), use editar_gasto ou apagar_gasto com o id do gasto. Os últimos gastos salvos, com id, vêm no começo da mensagem, do registrado por último para o primeiro; "o último" é o primeiro dessa lista, mesmo que a data dele seja antiga. Se o gasto não estiver ali, ache com listar_gastos. Confirme o que mudou.

A mensagem nova vem depois de um contexto com a data de hoje, a conversa recente e os últimos gastos salvos. Tudo que aparece nesse contexto já aconteceu e já está no banco: nunca registre de novo um gasto da conversa recente. Responda só à mensagem nova.

FOTOS
Se vier a foto de uma nota fiscal, comprovante ou cardápio com valor, registre o gasto com o total pago e o estabelecimento como descrição.

FORMATO
O Telegram mostra texto puro: não use markdown (nada de **, #, tabelas ou crases). Use quebras de linha e poucos emojis. Valores sempre no formato R$ 1.234,56.
Se a mensagem não tiver nada a ver com gastos, responda em uma frase que você cuida dos gastos.`;

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data no formato AAAA-MM-DD");
const categoria = z.enum(db.CATEGORIAS);

function ferramentas(chatId: number, mensagemOriginal: string) {
  return [
    betaZodTool({
      name: "registrar_gasto",
      description: "Registra um gasto. Chame uma vez para cada gasto da mensagem.",
      inputSchema: z.object({
        valor: z.number().positive().describe("Valor em reais, ex.: 50 ou 12.9"),
        categoria,
        descricao: z.string().describe("Curta: o que foi ou onde foi"),
        observacao: z.string().optional().describe("Detalhes extras que a pessoa mencionou"),
        data: data.optional().describe("AAAA-MM-DD; omita se for hoje"),
        forma_pagamento: z.string().optional(),
      }),
      run: (g) => {
        const id = db.registrar(chatId, {
          valor: g.valor,
          categoria: g.categoria,
          descricao: g.descricao,
          observacao: g.observacao || null,
          data: g.data ?? hoje(),
          forma_pagamento: g.forma_pagamento || null,
          mensagem_original: mensagemOriginal,
        });
        return JSON.stringify({ ok: true, id });
      },
    }),
    betaZodTool({
      name: "resumo_gastos",
      description:
        "Totais de um período: total geral, total e percentual por categoria e os 5 maiores gastos.",
      inputSchema: z.object({ inicio: data, fim: data }),
      run: ({ inicio, fim }) => JSON.stringify(db.resumo(chatId, inicio, fim)),
    }),
    betaZodTool({
      name: "listar_gastos",
      description:
        "Lista gastos, do mais recente para o mais antigo, com filtros opcionais. Use para achar um gasto (e o id dele) ou responder perguntas sobre gastos específicos.",
      inputSchema: z.object({
        inicio: data.optional(),
        fim: data.optional(),
        categoria: categoria.optional(),
        busca: z.string().optional().describe("Texto procurado na descrição ou na observação"),
        limite: z.number().int().min(1).max(200).optional().describe("Padrão 50"),
      }),
      run: (f) => JSON.stringify(db.listar(chatId, f)),
    }),
    betaZodTool({
      name: "editar_gasto",
      description: "Altera campos de um gasto já registrado. Mande só os campos que mudam.",
      inputSchema: z.object({
        id: z.number().int(),
        valor: z.number().positive().optional(),
        categoria: categoria.optional(),
        descricao: z.string().optional(),
        observacao: z.string().optional(),
        data: data.optional(),
        forma_pagamento: z.string().optional(),
      }),
      run: ({ id, ...campos }) => JSON.stringify({ ok: db.editar(chatId, id, campos) }),
    }),
    betaZodTool({
      name: "apagar_gasto",
      description: "Apaga um gasto pelo id.",
      inputSchema: z.object({ id: z.number().int() }),
      run: ({ id }) => JSON.stringify({ ok: db.apagar(chatId, id) }),
    }),
  ];
}

// As últimas trocas de cada chat, para a IA entender mensagens como
// "na verdade foi 60". Elas não voltam como turnos da conversa: sem as
// chamadas de ferramenta junto, o modelo lê as próprias confirmações antigas
// como registros que nunca aconteceram e registra tudo de novo. Por isso vão
// como contexto dentro da mensagem nova, ao lado dos gastos que estão no banco.
const historico = new Map<number, { usuario: string; bot: string }[]>();
const MAX_TROCAS = 3;

export type Entrada = {
  chatId: number;
  texto: string;
  imagem?: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };
};

function contexto(chatId: number): string {
  const partes = [`[hoje: ${hojePorExtenso()} (${hoje()})]`];
  const trocas = historico.get(chatId) ?? [];
  if (trocas.length) {
    partes.push(
      "[conversa recente, só para contexto; o que foi registrado nela já está no banco]",
      ...trocas.map((t) => `pessoa: ${t.usuario}\nbot: ${t.bot}`),
    );
  }
  const recentes = db.ultimosRegistrados(chatId, 5);
  if (recentes.length) {
    partes.push(
      "[últimos gastos salvos no banco, do registrado por último para o primeiro]",
      ...recentes.map(linhaGasto),
    );
  }
  return partes.join("\n");
}

export async function responder({ chatId, texto, imagem }: Entrada): Promise<string> {
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (imagem) {
    conteudo.push({
      type: "image",
      source: { type: "base64", media_type: imagem.mediaType, data: imagem.base64 },
    });
  }
  conteudo.push({ type: "text", text: `${contexto(chatId)}\n\n[mensagem nova]\n${texto}` });

  const runner = client.beta.messages.toolRunner({
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: "low" },
    // Se o modelo recusar por política, a API tenta de novo num modelo reserva.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Dois pontos de cache: o prompt + ferramentas (igual em toda mensagem) e o
    // fim da conversa (reaproveitado entre as chamadas de uma mesma mensagem).
    cache_control: { type: "ephemeral" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: ferramentas(chatId, texto),
    messages: [{ role: "user", content: conteudo }],
    max_iterations: 10,
  });

  // Soma os tokens de todas as chamadas da mensagem, para acompanhar o custo no log.
  const uso = { entrada: 0, cache: 0, saida: 0, chamadas: 0 };
  for await (const msg of runner) {
    uso.entrada += msg.usage.input_tokens + (msg.usage.cache_creation_input_tokens ?? 0);
    uso.cache += msg.usage.cache_read_input_tokens ?? 0;
    uso.saida += msg.usage.output_tokens;
    uso.chamadas++;
  }
  const final = await runner.done();
  console.error(
    `[uso] ${MODELO} · ${uso.chamadas} chamadas · entrada ${uso.entrada} · cache ${uso.cache} · saída ${uso.saida}`,
  );

  const resposta =
    final.stop_reason === "refusal"
      ? "Não consegui processar essa mensagem. Tenta escrever de outro jeito?"
      : final.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          // O Telegram mostra texto puro; tira o negrito que às vezes escapa.
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .trim() || "Feito.";

  historico.set(
    chatId,
    [
      ...(historico.get(chatId) ?? []),
      { usuario: imagem ? `[foto] ${texto}` : texto, bot: resposta },
    ].slice(-MAX_TROCAS),
  );

  return resposta;
}
