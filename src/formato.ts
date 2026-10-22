import type { Gasto } from "./db.ts";

const FUSO = process.env.FUSO_HORARIO ?? "America/Sao_Paulo";

export function hoje(): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
}

export function hojePorExtenso(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function reais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataCurta(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

export function linhaGasto(g: Gasto): string {
  const obs = g.observacao ? ` (${g.observacao})` : "";
  return `#${g.id} · ${dataCurta(g.data)} · ${reais(g.valor)} · ${g.categoria} · ${g.descricao}${obs}`;
}

export function csv(gastos: Gasto[]): string {
  const campo = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const linhas = gastos.map((g) =>
    [g.id, g.data, g.valor.toFixed(2), g.categoria, g.descricao, g.observacao, g.forma_pagamento]
      .map(campo)
      .join(","),
  );
  return ["id,data,valor,categoria,descricao,observacao,forma_pagamento", ...linhas].join("\n");
}
