"""timeline.py — serviço de agregação cronológica (Issue #15).

Une `events`, `persons` (birth/death) e `unions` em uma lista única
ordenada por data completa; datas parciais entram como 31/12 do ano.
Itens sem ano ficam fora da timeline. RLS filtra todas as
subqueries automaticamente — a conexão já entra com SET LOCAL ROLE
authenticated via `deps.get_db_authenticated`.

Decisões:
  - SQL devolve campos crus (display_name dos partners, event_type, etc.)
    e o Python compõe o `title` final em PT-BR. Mantém o SQL declarativo
    e o formatador testável isoladamente.
  - Probe inicial em `trees` distingue "árvore não existe / sem acesso"
    (404) de "árvore vazia" — sem o probe, todas as subqueries voltariam
    vazias por RLS e o cliente receberia 200 com lista vazia mascarando
    erros de permissão.
  - Filtros from_year/to_year são aplicados na união final via subquery,
    para não duplicar a lógica em cada SELECT da UNION ALL.
  - Filtro de kind (multi) é WHERE kind = ANY(%s) — aceita lista vazia
    como "sem filtro" (None).
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.timeline import TimelineItem, TimelineKind

# ---------------------------------------------------------------------------
# Tabelas de tradução PT-BR
# ---------------------------------------------------------------------------

# Mapeia event_type_t (definido em 0001_extensions_and_enums.sql) para um
# label legível em PT-BR. Manter aqui — futura i18n pode mover para resource
# bundle, mas hoje é overkill.
EVENT_TYPE_LABELS: dict[str, str] = {
    # religiosos / ritos de passagem
    "baptism": "Batismo",
    "christening": "Batismo cristão",
    "confirmation": "Crisma",
    "first_communion": "Primeira comunhão",
    "bar_mitzvah": "Bar Mitzvá",
    "bat_mitzvah": "Bat Mitzvá",
    "ordination": "Ordenação",
    "blessing": "Benção",
    # vida
    "adoption": "Adoção",
    "engagement": "Noivado",
    "graduation": "Formatura",
    "retirement": "Aposentadoria",
    "occupation": "Ocupação",
    "education": "Educação",
    "military": "Serviço militar",
    "residence": "Residência",
    # migração
    "immigration": "Imigração",
    "emigration": "Emigração",
    "naturalization": "Naturalização",
    # registros oficiais
    "census": "Censo",
    "will": "Testamento",
    "probate": "Inventário",
    "obituary": "Obituário",
    # pós-morte
    "burial": "Sepultamento",
    "cremation": "Cremação",
    # escape hatch
    "religion": "Religião",
    "custom": "Evento",
}

# Para uniões — issue diz que o kind=union usa palavra friendly em PT-BR
# dependendo do tipo. Engagement é "noivado", restante "casamento/união".
UNION_TYPE_LABELS: dict[str, str] = {
    "marriage": "Casamento",
    "civil_union": "União civil",
    "partnership": "União estável",
    "engagement": "Noivado",
    "other": "União",
}


# ---------------------------------------------------------------------------
# Title composers
# ---------------------------------------------------------------------------


def _display_name_or_fallback(name: str | None) -> str:
    """Retorna o nome ou um fallback genérico — nunca devolve string vazia
    no título final."""
    name = (name or "").strip()
    return name or "pessoa desconhecida"


def _person_name_sql(alias: str) -> str:
    return (
        f"COALESCE(NULLIF({alias}.display_name, ''), "
        f"NULLIF(CONCAT_WS(' ', {alias}.first_name, {alias}.middle_names, {alias}.last_name), ''))"
    )


def _compose_title(row: dict[str, Any]) -> str:
    """Compõe o `title` em PT-BR a partir dos campos crus retornados pelo SQL.

    `row` precisa conter: kind, person_display_name, partner_a_display_name,
    partner_b_display_name, event_type, custom_label, union_type.
    """
    kind = row["kind"]

    if kind == "birth":
        return f"Nascimento de {_display_name_or_fallback(row.get('person_display_name'))}"

    if kind == "death":
        return f"Falecimento de {_display_name_or_fallback(row.get('person_display_name'))}"

    if kind == "union":
        a = _display_name_or_fallback(row.get("partner_a_display_name"))
        b = _display_name_or_fallback(row.get("partner_b_display_name"))
        verb = UNION_TYPE_LABELS.get(row.get("union_type") or "", "União")
        return f"{verb} de {a} e {b}"

    # kind == "event"
    event_type = row.get("event_type") or ""
    custom_label = row.get("custom_label")
    person_name = row.get("person_display_name")

    if event_type == "custom" and custom_label:
        base = custom_label
    else:
        base = EVENT_TYPE_LABELS.get(event_type, "Evento")

    if person_name:
        return f"{base} - {_display_name_or_fallback(person_name)}"
    return base


# ---------------------------------------------------------------------------
# SQL — UNION ALL com 4 ramos: events / births / deaths / unions
# ---------------------------------------------------------------------------

# Cada ramo retorna o mesmo formato de colunas, com NULLs onde não se aplica.
# O `tree_id = %(tid)s` é repetido em cada ramo para tirar proveito do índice
# em (tree_id) ao invés de filtrar depois do UNION (Postgres não consegue
# empurrar predicados para dentro do UNION ALL nesse caso por causa do
# CASE-like join com persons).
_TIMELINE_SQL = f"""
WITH timeline AS (
    -- Events
    SELECT
        'event'::text AS kind,
        e.year, e.month, e.day,
        e.person_id, e.union_id,
        e.place,
        e.description,
        e.type::text AS event_type,
        e.custom_label,
        {_person_name_sql("p")} AS person_display_name,
        NULL::text AS partner_a_display_name,
        NULL::text AS partner_b_display_name,
        NULL::text AS union_type
    FROM events e
    LEFT JOIN persons p ON p.id = e.person_id
    WHERE e.tree_id = %(tid)s

    UNION ALL

    -- Births
    SELECT
        'birth'::text AS kind,
        p.birth_year AS year, p.birth_month AS month, p.birth_day AS day,
        p.id AS person_id,
        NULL::uuid AS union_id,
        p.birth_place AS place,
        NULL::text AS description,
        NULL::text AS event_type,
        NULL::text AS custom_label,
        {_person_name_sql("p")} AS person_display_name,
        NULL::text AS partner_a_display_name,
        NULL::text AS partner_b_display_name,
        NULL::text AS union_type
    FROM persons p
    WHERE p.tree_id = %(tid)s
      AND p.birth_year IS NOT NULL

    UNION ALL

    -- Deaths
    SELECT
        'death'::text AS kind,
        p.death_year AS year, p.death_month AS month, p.death_day AS day,
        p.id AS person_id,
        NULL::uuid AS union_id,
        p.death_place AS place,
        p.death_cause AS description,
        NULL::text AS event_type,
        NULL::text AS custom_label,
        {_person_name_sql("p")} AS person_display_name,
        NULL::text AS partner_a_display_name,
        NULL::text AS partner_b_display_name,
        NULL::text AS union_type
    FROM persons p
    WHERE p.tree_id = %(tid)s
      AND p.is_living = false
      AND p.death_year IS NOT NULL

    UNION ALL

    -- Unions
    SELECT
        'union'::text AS kind,
        u.start_year AS year, u.start_month AS month, u.start_day AS day,
        NULL::uuid AS person_id,
        u.id AS union_id,
        u.start_place AS place,
        u.notes AS description,
        NULL::text AS event_type,
        NULL::text AS custom_label,
        NULL::text AS person_display_name,
        {_person_name_sql("pa")} AS partner_a_display_name,
        {_person_name_sql("pb")} AS partner_b_display_name,
        u.type::text AS union_type
    FROM unions u
    LEFT JOIN persons pa ON pa.id = u.partner_a_id
    LEFT JOIN persons pb ON pb.id = u.partner_b_id
    WHERE u.tree_id = %(tid)s
)
SELECT *
FROM timeline
WHERE TRUE
  AND year IS NOT NULL
  {{kind_filter}}
  {{from_year_filter}}
  {{to_year_filter}}
ORDER BY year ASC,
         CASE WHEN month IS NULL OR day IS NULL THEN 12 ELSE month END ASC,
         CASE WHEN month IS NULL OR day IS NULL THEN 31 ELSE day END ASC
"""


# ---------------------------------------------------------------------------
# Public service entry-point
# ---------------------------------------------------------------------------


def get_timeline(
    conn: Connection,
    tree_id: uuid.UUID,
    from_year: int | None = None,
    to_year: int | None = None,
    kinds: list[TimelineKind] | None = None,
) -> list[TimelineItem]:
    """Retorna a timeline cronológica de uma árvore.

    Filtros:
      - from_year / to_year: aplicados sobre o ano resultante. Itens com
        year NULL são excluídos quando qualquer dos dois bounds está setado
        (semântica natural de comparação SQL com NULL → unknown).
      - kinds: lista de TimelineKind; None = sem filtro.

    Ordenação: data completa; quando mês/dia faltam, o item é tratado como
    31/12 daquele ano. Itens sem ano são excluídos.

    404 quando a árvore não é visível ao usuário (RLS filtra o probe).
    """
    params: dict[str, Any] = {"tid": tree_id}

    kind_filter = ""
    if kinds:
        kind_filter = "AND kind = ANY(%(kinds)s)"
        params["kinds"] = kinds

    from_year_filter = ""
    if from_year is not None:
        from_year_filter = "AND year >= %(from_year)s"
        params["from_year"] = from_year

    to_year_filter = ""
    if to_year is not None:
        to_year_filter = "AND year <= %(to_year)s"
        params["to_year"] = to_year

    # Safe: kind_filter/from_year_filter/to_year_filter são strings constantes
    # acima — não há interpolação de input externo no SQL.
    sql = _TIMELINE_SQL.format(
        kind_filter=kind_filter,
        from_year_filter=from_year_filter,
        to_year_filter=to_year_filter,
    )

    with conn.cursor(row_factory=dict_row) as cur:
        # Probe — RLS filtra; 404 se a árvore não for visível ao usuário.
        cur.execute("SELECT 1 FROM trees WHERE id = %s", (tree_id,))
        if cur.fetchone() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Tree not found")

        cur.execute(sql, params)
        rows = cur.fetchall()

    items: list[TimelineItem] = []
    for row in rows:
        items.append(
            TimelineItem(
                kind=row["kind"],
                year=row["year"],
                month=row["month"],
                day=row["day"],
                person_id=row["person_id"],
                union_id=row["union_id"],
                title=_compose_title(row),
                place=row["place"],
                description=row["description"],
            )
        )
    return items
