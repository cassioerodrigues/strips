"""Serviço para atividade recente derivada do dashboard."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.dashboard_activity import DashboardActivityItem


def get_dashboard_activity(
    conn: Connection,
    tree_id: uuid.UUID,
    limit: int,
) -> list[DashboardActivityItem]:
    """Retorna atividade recente derivada de tabelas já existentes.

    Este feed não é auditoria formal. Ele sintetiza eventos úteis para o
    dashboard a partir de timestamps atuais e respeita RLS via conexão
    autenticada.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT 1 FROM trees WHERE id = %s", (tree_id,))
        if cur.fetchone() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Tree not found")

        cur.execute(
            """
            WITH activity AS (
                SELECT
                    'person:' || p.id::text || ':created' AS id,
                    'person_created'::text AS kind,
                    p.id AS person_id,
                    COALESCE(NULLIF(p.display_name, ''), NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Pessoa') || ' foi adicionada' AS title,
                    NULLIF(p.birth_place, '') AS subtitle,
                    pr.display_name AS actor_name,
                    p.created_at AS occurred_at
                FROM persons p
                LEFT JOIN profiles pr ON pr.id = p.created_by
                WHERE p.tree_id = %(tid)s
                  AND p.created_at IS NOT NULL

                UNION ALL

                SELECT
                    'person:' || p.id::text || ':updated' AS id,
                    'person_updated'::text AS kind,
                    p.id AS person_id,
                    COALESCE(NULLIF(p.display_name, ''), NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Pessoa') || ' foi atualizada' AS title,
                    'Perfil atualizado' AS subtitle,
                    pr.display_name AS actor_name,
                    p.updated_at AS occurred_at
                FROM persons p
                LEFT JOIN profiles pr ON pr.id = p.created_by
                WHERE p.tree_id = %(tid)s
                  AND p.updated_at IS NOT NULL
                  AND p.updated_at > p.created_at + interval '1 second'

                UNION ALL

                SELECT
                    'media:' || m.id::text AS id,
                    'media_uploaded'::text AS kind,
                    pm.person_id AS person_id,
                    COALESCE(NULLIF(m.title, ''), 'Mídia arquivada') AS title,
                    CASE m.kind
                        WHEN 'photo' THEN 'Foto enviada'
                        WHEN 'document' THEN 'Documento enviado'
                        WHEN 'audio' THEN 'Áudio enviado'
                        WHEN 'video' THEN 'Vídeo enviado'
                        ELSE 'Mídia enviada'
                    END AS subtitle,
                    pr.display_name AS actor_name,
                    m.uploaded_at AS occurred_at
                FROM media m
                LEFT JOIN LATERAL (
                    SELECT person_id
                    FROM person_media
                    WHERE media_id = m.id
                    ORDER BY is_primary DESC, person_id
                    LIMIT 1
                ) pm ON TRUE
                LEFT JOIN profiles pr ON pr.id = m.uploaded_by
                WHERE m.tree_id = %(tid)s
                  AND m.uploaded_at IS NOT NULL

                UNION ALL

                SELECT
                    'external_record:' || er.id::text || ':created' AS id,
                    'suggestion_created'::text AS kind,
                    er.person_id AS person_id,
                    COALESCE(NULLIF(er.title, ''), 'Nova sugestão encontrada') AS title,
                    NULLIF(er.subtitle, '') AS subtitle,
                    NULL::text AS actor_name,
                    er.created_at AS occurred_at
                FROM external_records er
                WHERE er.tree_id = %(tid)s
                  AND er.created_at IS NOT NULL

                UNION ALL

                SELECT
                    'external_record:' || er.id::text || ':reviewed' AS id,
                    'suggestion_reviewed'::text AS kind,
                    er.person_id AS person_id,
                    COALESCE(NULLIF(er.title, ''), 'Sugestão revisada') AS title,
                    'Sugestão ' || er.status::text AS subtitle,
                    pr.display_name AS actor_name,
                    er.reviewed_at AS occurred_at
                FROM external_records er
                LEFT JOIN profiles pr ON pr.id = er.reviewed_by
                WHERE er.tree_id = %(tid)s
                  AND er.reviewed_at IS NOT NULL
            )
            SELECT id, kind, person_id, title, subtitle, actor_name, occurred_at
            FROM activity
            ORDER BY occurred_at DESC
            LIMIT %(limit)s
            """,
            {"tid": tree_id, "limit": limit},
        )
        return [DashboardActivityItem.model_validate(row) for row in cur.fetchall()]
