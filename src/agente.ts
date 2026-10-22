import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import * as db from "./db.ts";
import { hoje, hojePorExtenso, linhaLancamento } from "./formato.ts";

const client = new Anthropic();
const MODELO = process.env.MODELO ?? "claude-opus-5-5";

const SYSTEM = `Você é o Meowth Banqueiro, um gato que cuida do dinheiro de uma pessoa pelo Telegram: registra o que sai (gastos) e o que entra (entradas) e responde perguntas sobre isso. Fale português do Brasil, curto e direto, como numa conversa de chat.

JEITO DE GATO
Você tem um toque felino leve, sem atrapalhar a informação:
- Use emojis de gato no começo das frases soltas: 😺 para dizer que deu certo, 😸 para notícia boa, 🙀 para susto (gasto alto, saldo negativo), 😿 quando não deu, 😼 para uma dica esperta, 🐱 para perguntas.
- No máximo um "miau" ou trocadilho de gato por mensagem, e nem toda mensagem precisa de um. Bons exemplos: "Miau, anotado!", "guardei aqui na minha patinha", "meus bigodes tremeram com esse gasto". Varie: não repita a frase da resposta anterior, que aparece na conversa recente.
- Num registro comum, a resposta é a linha de confirmação e, no máximo, uma interjeição curta antes. Comentário só quando o gasto chama atenção de verdade.
- Não termine oferecendo outra coisa ("se quiser, eu..."). A pessoa pede quando quiser.
- As linhas de confirmação e os números seguem exatamente o formato abaixo; a graça fica só em volta deles.

REGISTRAR
Quando a mensagem descreve um ou mais gastos, chame registrar_gasto uma vez para cada gasto. Quando descreve dinheiro que entrou (salário, alguém que pagou ou devolveu dinheiro, freela, venda, rendimento), chame registrar_entrada. Uma mensagem pode ter os dois.
Escolha a categoria pelo contexto. Exemplos:
- "uber 50 reais saindo do rio": gasto de 50, Transporte, descrição "Uber", observação "saindo do Rio".
- "caiu o salário, 4500": entrada de 4500, Salário, descrição "Salário".
- "o joão me pagou 80 do churrasco": entrada de 80, Reembolso, descrição "João", observação "churrasco".
Verbos como recebi, caiu, entrou, me pagou, me devolveu, me mandou, vendi indicam entrada. Comprei, paguei, gastei, ou só "coisa + valor", indicam gasto. Se não der para saber se o dinheiro entrou ou saiu, pergunte.
- descrição: curta. No gasto, o que foi ou onde foi ("Uber", "Almoço", "Farmácia"). Na entrada, de onde ou de quem veio ("Salário", "João", "Cliente X").
- observação: os detalhes extras que a pessoa deu (lugar, com quem, motivo, parcela). Vazia se não houver nada além do básico. Não invente detalhes.
- valor em reais: entende "50", "50 reais", "R$ 50,90", "50 conto", "1,2k", "mil e duzentos".
- data: se a pessoa não disser, é hoje. "ontem", "anteontem", "sexta", "dia 10", "15/10" você calcula a partir da data de hoje que vem no começo da mensagem. Um dia da semana sem mais nada ("sexta") é o mais recente que já passou.
- forma de pagamento só se a pessoa disser (pix, crédito, débito, dinheiro, VR, TED...).
- Se não der para saber o valor, pergunte em vez de registrar.
- Se a mensagem nova responde a uma pergunta que você fez na conversa recente (o valor que faltava, se o dinheiro entrou ou saiu), registre agora juntando o que veio nas duas mensagens.
- Quando alguém devolve o dinheiro de um gasto ("a ana me pagou de volta o uber"), registre uma entrada de Reembolso e deixe o gasto como está.
Depois de registrar, confirme com uma linha por lançamento. Gasto começa com 🐾, entrada com 🪙 e o valor com +:
🐾 R$ 50,00 · Transporte · Uber (saindo do Rio)
🪙 +R$ 4.500,00 · Salário · Salário
Quando a data não for hoje, acrescente a data no fim da linha, para a pessoa conferir:
🐾 R$ 230,00 · Mercado · Mercado · 📅 21/10

CONSULTAR
Para resumos e perguntas ("resumo do mês", "quanto gastei com mercado?", "quanto entrou esse mês?", "sobrou quanto?"), use resumo_periodo ou listar_lancamentos com o período certo. Todo número da resposta tem que aparecer exatamente assim no retorno de uma ferramenta. Não some, subtraia nem calcule percentual de cabeça: se precisar de um total que não veio (só hoje, só a semana, duas categorias juntas), chame resumo_periodo de novo com esse período, ou deixe o número de fora. O resumo já traz o saldo e o total de cada dia em por_dia. Se a pessoa não disser o período, use o mês atual.
Num resumo, mostre: quanto entrou, quanto saiu e o saldo; os gastos por categoria, do maior para o menor, com valor e percentual; os maiores gastos; e as entradas do período. Se não houver nenhuma entrada no período, mostre só os gastos e não fale de saldo. Termine com uma ou duas observações úteis tiradas dos dados, aproveitando as observações dos lançamentos quando ajudarem (por exemplo, vários Ubers saindo do mesmo lugar, ou um gasto fora do padrão).

CORRIGIR
Para corrigir ou apagar ("apaga o último", "o uber foi 60 na verdade", "isso era entrada"), use editar_lancamento ou apagar_lancamento com o id. Os últimos lançamentos salvos, com id, vêm no começo da mensagem, do registrado por último para o primeiro; "o último" é o primeiro dessa lista, mesmo que a data dele seja antiga. Se não estiver ali, ache com listar_lancamentos. Se trocar o tipo, troque também a categoria por uma do tipo novo. Confirme o que mudou.

A mensagem nova vem depois de um contexto com a data de hoje, a conversa recente e os últimos lançamentos salvos. O que você confirmou na conversa recente (linhas com 🐾 ou 🪙) já está no banco: nunca registre isso de novo. Responda à mensagem nova.

FOTOS
Se vier a foto de uma nota fiscal, comprovante ou cardápio com valor, registre o gasto com o total pago e o estabelecimento como descrição. Se for um comprovante de dinheiro que a pessoa recebeu (pix recebido, holerite), registre como entrada.

FORMATO
O Telegram mostra texto puro: não use markdown (nada de **, #, tabelas ou crases). Use quebras de linha; fora as linhas de confirmação, prefira os emojis de gato da lista acima aos genéricos. Valores sempre no formato R$ 1.234,56.
Se a mensagem não tiver nada a ver com dinheiro, responda em uma frase, com jeito de gato, que você só cuida dos gastos e das entradas.`;

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data no formato AAAA-MM-DD");

const camposDoRegistro = {
  valor: z.number().positive().describe("Valor em reais, ex.: 50 ou 12.9"),
  observacao: z.string().optional().describe("Detalhes extras que a pessoa mencionou"),
  data: data.optional().describe("AAAA-MM-DD; omita se for hoje"),
  forma_pagamento: z.string().optional(),
};

function ferramentas(chatId: number, mensagemOriginal: string) {
  type Registro = {
    valor: number;
    categoria: string;
    descricao: string;
    observacao?: string;
    data?: string;
    forma_pagamento?: string;
  };
  const registrar = (tipo: db.Tipo, l: Registro) => {
    const id = db.registrar(chatId, {
      tipo,
      valor: l.valor,
      categoria: l.categoria,
      descricao: l.descricao,
      observacao: l.observacao || null,
      data: l.data ?? hoje(),
      forma_pagamento: l.forma_pagamento || null,
      mensagem_original: mensagemOriginal,
    });
    return JSON.stringify({ ok: true, id });
  };

  return [
    betaZodTool({
      name: "registrar_gasto",
      description: "Registra um gasto (dinheiro que saiu). Chame uma vez para cada gasto da mensagem.",
      inputSchema: z.object({
        ...camposDoRegistro,
        categoria: z.enum(db.CATEGORIAS_GASTO),
        descricao: z.string().describe("Curta: o que foi ou onde foi"),
      }),
      run: (g) => registrar("gasto", g),
    }),
    betaZodTool({
      name: "registrar_entrada",
      description:
        "Registra dinheiro que entrou: salário, pagamento recebido, reembolso, freela, venda, rendimento. Chame uma vez para cada entrada da mensagem.",
      inputSchema: z.object({
        ...camposDoRegistro,
        categoria: z.enum(db.CATEGORIAS_ENTRADA),
        descricao: z.string().describe("Curta: de onde ou de quem veio o dinheiro"),
      }),
      run: (e) => registrar("entrada", e),
    }),
    betaZodTool({
      name: "resumo_periodo",
      description:
        "Totais de um período: total de entradas, total de gastos e saldo; para gastos e para entradas, o total por categoria com percentual, os 5 maiores e o total de cada dia.",
      inputSchema: z.object({ inicio: data, fim: data }),
      run: ({ inicio, fim }) => JSON.stringify(db.resumo(chatId, inicio, fim)),
    }),
    betaZodTool({
      name: "listar_lancamentos",
      description:
        "Lista gastos e entradas, do mais recente para o mais antigo, com filtros opcionais. Use para achar um lançamento (e o id dele) ou responder perguntas sobre lançamentos específicos.",
      inputSchema: z.object({
        tipo: z.enum(db.TIPOS).optional().describe("Omita para trazer os dois"),
        inicio: data.optional(),
        fim: data.optional(),
        categoria: z.enum(db.CATEGORIAS).optional(),
        busca: z.string().optional().describe("Texto procurado na descrição ou na observação"),
        limite: z.number().int().min(1).max(200).optional().describe("Padrão 50"),
      }),
      run: (f) => JSON.stringify(db.listar(chatId, f)),
    }),
    betaZodTool({
      name: "editar_lancamento",
      description: "Altera campos de um gasto ou entrada já registrado. Mande só os campos que mudam.",
      inputSchema: z.object({
        id: z.number().int(),
        tipo: z.enum(db.TIPOS).optional(),
        valor: z.number().positive().optional(),
        categoria: z.enum(db.CATEGORIAS).optional(),
        descricao: z.string().optional(),
        observacao: z.string().optional(),
        data: data.optional(),
        forma_pagamento: z.string().optional(),
      }),
      run: ({ id, ...campos }) => JSON.stringify({ ok: db.editar(chatId, id, campos) }),
    }),
    betaZodTool({
      name: "apagar_lancamento",
      description: "Apaga um gasto ou entrada pelo id.",
      inputSchema: z.object({ id: z.number().int() }),
      run: ({ id }) => JSON.stringify({ ok: db.apagar(chatId, id) }),
    }),
  ];
}

// As últimas trocas de cada chat, para a IA entender mensagens como
// "na verdade foi 60". Elas não voltam como turnos da conversa: sem as
// chamadas de ferramenta junto, o modelo lê as próprias confirmações antigas
// como registros que nunca aconteceram e registra tudo de novo. Por isso vão
// como contexto dentro da mensagem nova, ao lado dos lançamentos que estão no banco.
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
      "[últimos lançamentos salvos no banco, do registrado por último para o primeiro]",
      ...recentes.map(linhaLancamento),
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
      ? "😿 Não consegui processar essa mensagem. Tenta escrever de outro jeito?"
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
