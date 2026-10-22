#!/usr/bin/env bash
# Baixa uma cópia do banco de produção para abrir no DBeaver (ou em qualquer
# leitor de SQLite). É uma foto do momento: editar a cópia não muda a produção.
#
# Uso: npm run banco:baixar            (salva em dados/producao.db)
#      npm run banco:baixar -- outro.db
set -euo pipefail

HOST=${VM_HOST:-USUARIO@IP-DA-VM}
CHAVE=${VM_CHAVE:-$HOME/.ssh/sua-chave}
# Id do app no Coolify: os containers dele começam com esse nome.
APP=${COOLIFY_APP:-ID-DO-APP}
DESTINO=${1:-dados/producao.db}

mkdir -p "$(dirname "$DESTINO")"
parcial="$DESTINO.parcial"
trap 'rm -f "$parcial"' EXIT

# O backup é feito pelo próprio SQLite dentro do container (VACUUM INTO), para
# a cópia sair inteira mesmo se o bot estiver gravando naquela hora.
falhou_ssh() {
  cat >&2 <<AJUDA

Não consegui entrar na VM por SSH. As causas de sempre:
- Timeout: a porta 22 só aceita o seu IP. Atualize a regra da porta 22 na
  Security List da Oracle com o IP de https://api.ipify.org (/32).
- "Permission denied (publickey)": rode  ssh-add --apple-load-keychain
AJUDA
}

ssh -i "$CHAVE" -o ConnectTimeout=10 "$HOST" bash -s -- "$APP" > "$parcial" <<'REMOTO' || { [ $? -eq 255 ] && falhou_ssh; exit 1; }
set -euo pipefail
c=$(sudo docker ps -q --filter "name=^$1" | head -n1)
if [ -z "$c" ]; then
  echo "Nenhum container rodando com nome $1." >&2
  exit 1
fi
tmp=/tmp/copia-$$.db
trap 'sudo docker exec "$c" rm -f "$tmp"' EXIT
sudo docker exec "$c" node -e '
  const { DatabaseSync } = require("node:sqlite");
  new DatabaseSync("/app/dados/gastos.db").prepare("VACUUM INTO ?").run(process.argv[1]);
' "$tmp"
sudo docker exec "$c" cat "$tmp"
REMOTO

if [ "$(head -c 15 "$parcial")" != "SQLite format 3" ]; then
  echo "O arquivo baixado não é um banco SQLite. Nada foi salvo." >&2
  exit 1
fi
mv "$parcial" "$DESTINO"
echo "Cópia salva em $DESTINO ($(du -h "$DESTINO" | cut -f1))."
