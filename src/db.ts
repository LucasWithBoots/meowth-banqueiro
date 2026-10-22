import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const CATEGORIAS = [
  "Alimentação",
  "Mercado",
  "Transporte",
  "Moradia",
  "Contas",
  "Saúde",
  "Lazer",
  "Compras",
  "Educação",
  "Assinaturas",
  "Viagem",
  "Pets",
  "Presentes",
  "Outros",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export type Gasto = {
  id: number;
  valor: number;
  categoria: Categoria;
  descricao: string;
  observacao: string | null;
  data: string;
  forma_pagamento: string | null;
};

export type NovoGasto = Omit<Gasto, "id"> & { mensagem_original: string };

const caminho = process.env.DB_PATH ?? "dados/gastos.db";
mkdirSync(dirname(caminho), { recursive: true });
const db = new DatabaseSync(caminho);

db.exec(`
  CREATE TABLE IF NOT EXISTS gastos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    valor_centavos INTEGER NOT NULL,
    categoria TEXT NOT NULL,
    descricao TEXT NOT NULL,
    observacao TEXT,
    data TEXT NOT NULL,
    forma_pagamento TEXT,
    mensagem_original TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gastos_chat_data ON gastos (chat_id, data);
`);

// Valores ficam em centavos no banco para não acumular erro de ponto flutuante.
const SELECT_GASTO = `
  SELECT id, valor_centavos / 100.0 AS valor, categoria, descricao, observacao, data, forma_pagamento
  FROM gastos`;

export function registrar(chatId: number, g: NovoGasto): number {
  const r = db
    .prepare(
      `INSERT INTO gastos (chat_id, valor_centavos, categoria, descricao, observacao, data, forma_pagamento, mensagem_original)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      chatId,
      Math.round(g.valor * 100),
      g.categoria,
      g.descricao,
      g.observacao,
      g.data,
      g.forma_pagamento,
      g.mensagem_original,
    );
  return Number(r.lastInsertRowid);
}

export type Filtro = {
  inicio?: string;
  fim?: string;
  categoria?: Categoria;
  busca?: string;
  limite?: number;
};

export function listar(chatId: number, f: Filtro = {}): Gasto[] {
  const where = ["chat_id = ?"];
  const params: (string | number)[] = [chatId];
  if (f.inicio) {
    where.push("data >= ?");
    params.push(f.inicio);
  }
  if (f.fim) {
    where.push("data <= ?");
    params.push(f.fim);
  }
  if (f.categoria) {
    where.push("categoria = ?");
    params.push(f.categoria);
  }
  if (f.busca) {
    where.push("(descricao LIKE ? OR observacao LIKE ?)");
    params.push(`%${f.busca}%`, `%${f.busca}%`);
  }
  params.push(f.limite ?? 50);
  return db
    .prepare(`${SELECT_GASTO} WHERE ${where.join(" AND ")} ORDER BY data DESC, id DESC LIMIT ?`)
    .all(...params) as Gasto[];
}

// Na ordem em que foram registrados: é o que "o último" quer dizer para quem
// acabou de mandar um gasto com data de semana passada.
export function ultimosRegistrados(chatId: number, limite: number): Gasto[] {
  return db.prepare(`${SELECT_GASTO} WHERE chat_id = ? ORDER BY id DESC LIMIT ?`).all(chatId, limite) as Gasto[];
}

export function resumo(chatId: number, inicio: string, fim: string) {
  const porCategoria = db
    .prepare(
      `SELECT categoria, SUM(valor_centavos) / 100.0 AS total, COUNT(*) AS quantidade
       FROM gastos WHERE chat_id = ? AND data BETWEEN ? AND ?
       GROUP BY categoria ORDER BY total DESC`,
    )
    .all(chatId, inicio, fim) as { categoria: Categoria; total: number; quantidade: number }[];

  const total = porCategoria.reduce((s, c) => s + c.total, 0);
  const maiores = db
    .prepare(`${SELECT_GASTO} WHERE chat_id = ? AND data BETWEEN ? AND ? ORDER BY valor_centavos DESC LIMIT 5`)
    .all(chatId, inicio, fim) as Gasto[];

  const porDia = db
    .prepare(
      `SELECT data, SUM(valor_centavos) / 100.0 AS total, COUNT(*) AS quantidade
       FROM gastos WHERE chat_id = ? AND data BETWEEN ? AND ?
       GROUP BY data ORDER BY data`,
    )
    .all(chatId, inicio, fim) as { data: string; total: number; quantidade: number }[];

  return {
    periodo: { inicio, fim },
    total: arredondar(total),
    quantidade: porCategoria.reduce((s, c) => s + c.quantidade, 0),
    por_dia: porDia.map((d) => ({ ...d, total: arredondar(d.total) })),
    por_categoria: porCategoria.map((c) => ({
      ...c,
      total: arredondar(c.total),
      percentual: total ? arredondar((c.total / total) * 100) : 0,
    })),
    maiores_gastos: maiores,
  };
}

export function editar(chatId: number, id: number, campos: Partial<Omit<Gasto, "id">>): boolean {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [campo, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    if (campo === "valor") {
      sets.push("valor_centavos = ?");
      params.push(Math.round((valor as number) * 100));
    } else {
      sets.push(`${campo} = ?`);
      params.push(valor as string | null);
    }
  }
  if (!sets.length) return false;
  const r = db
    .prepare(`UPDATE gastos SET ${sets.join(", ")} WHERE id = ? AND chat_id = ?`)
    .run(...params, id, chatId);
  return r.changes > 0;
}

export function apagar(chatId: number, id: number): boolean {
  return db.prepare("DELETE FROM gastos WHERE id = ? AND chat_id = ?").run(id, chatId).changes > 0;
}

export function todos(chatId: number): Gasto[] {
  return db.prepare(`${SELECT_GASTO} WHERE chat_id = ? ORDER BY data, id`).all(chatId) as Gasto[];
}

function arredondar(n: number) {
  return Math.round(n * 100) / 100;
}
