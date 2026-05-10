"""stats.py — serviços de banco para agregados do dashboard (tabela `persons` + filhas).

Usa SQL bruto via psycopg com dict_row.
A conexão já está numa transação com SET LOCAL configurado pelo
get_db_authenticated de deps.py — RLS é aplicado automaticamente em
todas as subqueries.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.stats import TreeStatsOut


def get_tree_stats(conn: Connection, tree_id: uuid.UUID) -> TreeStatsOut:
    """Retorna contadores agregados para o dashboard de uma árvore.

    Faz um probe inicial em `trees` para distinguir 404 (sem acesso ou inexistente)
    de "árvore vazia". Sem isso, RLS faria todas as subqueries devolverem 0
    silenciosamente — o que mascaria erros de permissão.

    Países: heurística que combina `external_ids->>'country'` (preferencial)
    com o último segmento de `birth_place` separado por vírgula, contando
    distinct sobre a união (excluindo NULL/strings vazias).

    Gerações: count distinct de `external_ids->>'generation'`, filtrando
    pessoas cujo jsonb contém a chave.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        # Probe — RLS filtra; 404 se não visível ao usuário.
        cur.execute("SELECT 1 FROM trees WHERE id = %s", (tree_id,))
        if cur.fetchone() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Tree not found")

        cur.execute(
            """
            WITH person_country AS (
                SELECT
                    nullif(external_ids->>'country', '') AS country_explicit,
                    nullif(trim(split_part(birth_place, ',', -1)), '') AS country_heuristic
                FROM persons
                WHERE tree_id = %(tid)s
            ),
            country_union AS (
                SELECT country_explicit AS country FROM person_country
                WHERE country_explicit IS NOT NULL
                UNION
                SELECT country_heuristic FROM person_country
                WHERE country_explicit IS NULL AND country_heuristic IS NOT NULL
            )
            SELECT
                (SELECT count(*) FROM persons WHERE tree_id = %(tid)s)
                    AS total_people,
                (SELECT count(DISTINCT external_ids->>'generation')
                   FROM persons
                   WHERE tree_id = %(tid)s
                     AND external_ids ? 'generation')
                    AS generations,
                (SELECT count(DISTINCT country) FROM country_union)
                    AS countries,
                (SELECT count(*) FROM media  WHERE tree_id = %(tid)s)
                    AS media_count,
                (SELECT count(*) FROM unions WHERE tree_id = %(tid)s)
                    AS unions_count,
                (SELECT count(*) FROM events WHERE tree_id = %(tid)s)
                    AS events_count
            """,
            {"tid": tree_id},
        )
        row = cur.fetchone()
        if row is None:  # pragma: no cover — agregação sempre retorna 1 linha
            raise RuntimeError("stats aggregation returned no row")

    return TreeStatsOut.model_validate(row)
