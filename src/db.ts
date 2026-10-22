import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const TIPOS = ["gasto", "entrada"] as const;
export type Tipo = (typeof TIPOS)[number];

export const CATEGORIAS_GASTO = [
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

export const CATEGORIAS_ENTRADA = [
  "Salário",
  "Freelance",
  "Pagamento recebido",
  "Reembolso",
  "Rendimentos",
  "Vendas",
  "Presente recebido",
  "Outros",
] as const;

export const CATEGORIAS = [...new Set([...CATEGORIAS_GASTO, ...CATEGORIAS_ENTRADA])] as [
  string,
  ...string[],
];

export type Lancamento = {
  id: number;
  tipo: Tipo;
  valor: number;
  categoria: string;
  descricao: string;
  observacao: string | null;
  data: string;
  forma_pagamento: string | null;
};

export type NovoLancamento = Omit<Lancamento, "id"> & { mensagem_original: string };

const caminho = process.env.DB_PATH ?? "dados/gastos.db";
mkdirSync(dirname(caminho), { recursive: true });
const db = new DatabaseSync(caminho);

// Até outubro/2026 a tabela se chamava "gastos" e só guardava saídas.
const tabelas = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
  (t) => t.name,
);
if (tabelas.includes("gastos") && !tabelas.includes("lancamentos")) {
  db.exec(`
    BEGIN;
    ALTER TABLE gastos RENAME TO lancamentos;
    ALTER TABLE lancamentos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'gasto';
    DROP INDEX IF EXISTS idx_gastos_chat_data;
    COMMIT;
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS lancamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    valor_centavos INTEGER NOT NULL,
    categoria TEXT NOT NULL,
    descricao TEXT NOT NULL,
    observacao TEXT,
    data TEXT NOT NULL,
    forma_pagamento TEXT,
    mensagem_original TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    tipo TEXT NOT NULL DEFAULT 'gasto'
  );
  CREATE INDEX IF NOT EXISTS idx_lancamentos_chat_data ON lancamentos (chat_id, data);
`);

// Valores ficam em centavos no banco para não acumular erro de ponto flutuante.
const SELECT_LANCAMENTO = `
  SELECT id, tipo, valor_centavos / 100.0 AS valor, categoria, descricao, observacao, data, forma_pagamento
  FROM lancamentos`;

export function registrar(chatId: number, l: NovoLancamento): number {
  const r = db
    .prepare(
      `INSERT INTO lancamentos (chat_id, tipo, valor_centavos, categoria, descricao, observacao, data, forma_pagamento, mensagem_original)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      chatId,
      l.tipo,
      Math.round(l.valor * 100),
      l.categoria,
      l.descricao,
      l.observacao,
      l.data,
      l.forma_pagamento,
      l.mensagem_original,
    );
  return Number(r.lastInsertRowid);
}

export type Filtro = {
  tipo?: Tipo;
  inicio?: string;
  fim?: string;
  categoria?: string;
  busca?: string;
  limite?: number;
};

export function listar(chatId: number, f: Filtro = {}): Lancamento[] {
  const where = ["chat_id = ?"];
  const params: (string | number)[] = [chatId];
  if (f.tipo) {
    where.push("tipo = ?");
    params.push(f.tipo);
  }
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
    .prepare(`${SELECT_LANCAMENTO} WHERE ${where.join(" AND ")} ORDER BY data DESC, id DESC LIMIT ?`)
    .all(...params) as Lancamento[];
}

// Na ordem em que foram registrados: é o que "o último" quer dizer para quem
// acabou de mandar um gasto com data de semana passada.
export function ultimosRegistrados(chatId: number, limite: number): Lancamento[] {
  return db
    .prepare(`${SELECT_LANCAMENTO} WHERE chat_id = ? ORDER BY id DESC LIMIT ?`)
    .all(chatId, limite) as Lancamento[];
}

function resumoDoTipo(chatId: number, tipo: Tipo, inicio: string, fim: string) {
  const porCategoria = db
    .prepare(
      `SELECT categoria, SUM(valor_centavos) / 100.0 AS total, COUNT(*) AS quantidade
       FROM lancamentos WHERE chat_id = ? AND tipo = ? AND data BETWEEN ? AND ?
       GROUP BY categoria ORDER BY total DESC`,
    )
    .all(chatId, tipo, inicio, fim) as { categoria: string; total: number; quantidade: number }[];

  const total = porCategoria.reduce((s, c) => s + c.total, 0);
  const maiores = db
    .prepare(
      `${SELECT_LANCAMENTO} WHERE chat_id = ? AND tipo = ? AND data BETWEEN ? AND ? ORDER BY valor_centavos DESC LIMIT 5`,
    )
    .all(chatId, tipo, inicio, fim) as Lancamento[];

  const porDia = db
    .prepare(
      `SELECT data, SUM(valor_centavos) / 100.0 AS total, COUNT(*) AS quantidade
       FROM lancamentos WHERE chat_id = ? AND tipo = ? AND data BETWEEN ? AND ?
       GROUP BY data ORDER BY data`,
    )
    .all(chatId, tipo, inicio, fim) as { data: string; total: number; quantidade: number }[];

  return {
    total: arredondar(total),
    quantidade: porCategoria.reduce((s, c) => s + c.quantidade, 0),
    por_dia: porDia.map((d) => ({ ...d, total: arredondar(d.total) })),
    por_categoria: porCategoria.map((c) => ({
      ...c,
      total: arredondar(c.total),
      percentual: total ? arredondar((c.total / total) * 100) : 0,
    })),
    maiores,
  };
}

export function resumo(chatId: number, inicio: string, fim: string) {
  const gastos = resumoDoTipo(chatId, "gasto", inicio, fim);
  const entradas = resumoDoTipo(chatId, "entrada", inicio, fim);
  return {
    periodo: { inicio, fim },
    total_entradas: entradas.total,
    total_gastos: gastos.total,
    saldo: arredondar(entradas.total - gastos.total),
    gastos,
    entradas,
  };
}

export function editar(chatId: number, id: number, campos: Partial<Omit<Lancamento, "id">>): boolean {
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
    .prepare(`UPDATE lancamentos SET ${sets.join(", ")} WHERE id = ? AND chat_id = ?`)
    .run(...params, id, chatId);
  return r.changes > 0;
}

export function apagar(chatId: number, id: number): boolean {
  return db.prepare("DELETE FROM lancamentos WHERE id = ? AND chat_id = ?").run(id, chatId).changes > 0;
}

export function todos(chatId: number): Lancamento[] {
  return db.prepare(`${SELECT_LANCAMENTO} WHERE chat_id = ? ORDER BY data, id`).all(chatId) as Lancamento[];
}

function arredondar(n: number) {
  return Math.round(n * 100) / 100;
}
