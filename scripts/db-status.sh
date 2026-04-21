#!/usr/bin/env bash
# db-status.sh — mostra estado resumido do banco local (tabelas + última migration)
#
# Uso: ./scripts/db-status.sh
#
# Saída típica: ~18 linhas (12 tabelas com contagem + última migration).
# Útil pra diagnóstico rápido sem precisar abrir psql interativo.
#
# Roda no container nocrato_postgres (dev). Para prod, abrir SSH + usar container de prod.

set -eo pipefail

CONTAINER="${POSTGRES_CONTAINER:-nocrato_postgres}"
DB_USER="${POSTGRES_USER:-nocrato}"
DB_NAME="${POSTGRES_DB:-nocrato_health}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "✗ Container ${CONTAINER} não está rodando"
    echo "  Subir com: docker compose -f docker/docker-compose.dev.yml up -d"
    exit 1
fi

echo "--- Contagem por tabela ---"
docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -A -F ' ' -c "
    SELECT table_name || ' ' || (
        xpath('/row/count/text()', xml_count)
    )[1]::text AS line
    FROM (
        SELECT table_name,
            query_to_xml(format('select count(*) from %I.%I', table_schema, table_name),
                         false, true, '') as xml_count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            AND table_name NOT LIKE 'knex_migrations%'
        ORDER BY table_name
    ) t;
" | awk '{ printf "%-20s %s\n", $1, $2 }'

echo ""
echo "--- Última migration aplicada ---"
docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -c "
    SELECT name, batch FROM knex_migrations ORDER BY id DESC LIMIT 1
" | sed 's/^ *//;s/ *| */ | batch /' | grep -v "^$"
