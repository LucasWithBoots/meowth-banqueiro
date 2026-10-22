import type { Lancamento } from "./db.ts";

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

export function linhaLancamento(l: Lancamento): string {
  const obs = l.observacao ? ` (${l.observacao})` : "";
  const valor = l.tipo === "entrada" ? `🪙 +${reais(l.valor)}` : `🐾 ${reais(l.valor)}`;
  return `#${l.id} · ${dataCurta(l.data)} · ${valor} · ${l.categoria} · ${l.descricao}${obs}`;
}

// O Telegram recusa mensagens com mais de 4096 caracteres. Quebra nas linhas,
// para não cortar um lançamento no meio; só uma linha maior que o limite é
// cortada, e por caractere, para não partir um emoji ao meio.
export function dividirMensagem(texto: string, limite = 4000): string[] {
  const partes: string[] = [];
  let atual = "";
  for (const linha of texto.split("\n")) {
    const pedacos: string[] = [];
    let pedaco = "";
    for (const caractere of linha) {
      if (pedaco.length + caractere.length > limite) {
        pedacos.push(pedaco);
        pedaco = "";
      }
      pedaco += caractere;
    }
    if (pedaco) pedacos.push(pedaco);
    for (const pedaco of pedacos.length ? pedacos : [""]) {
      if (atual && atual.length + 1 + pedaco.length > limite) {
        partes.push(atual);
        atual = pedaco;
      } else {
        atual = atual ? `${atual}\n${pedaco}` : pedaco;
      }
    }
  }
  if (atual.trim()) partes.push(atual);
  return partes;
}

export function csv(lancamentos: Lancamento[]): string {
  const campo = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const linhas = lancamentos.map((l) =>
    [l.id, l.data, l.tipo, l.valor.toFixed(2), l.categoria, l.descricao, l.observacao, l.forma_pagamento]
      .map(campo)
      .join(","),
  );
  return ["id,data,tipo,valor,categoria,descricao,observacao,forma_pagamento", ...linhas].join("\n");
}
