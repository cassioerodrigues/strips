"""
seed_from_mockup.py — carrega os dados mock do frontend no PostgreSQL do Stirps.

Uso:
    DATABASE_URL=postgresql://postgres:senha@localhost:54322/postgres \\
    python seed_from_mockup.py [--reset] [--dry-run] [--data-js PATH]

Variáveis de ambiente:
    DATABASE_URL            (obrigatório) DSN do banco PostgreSQL.
    STIRPS_OWNER_USER_ID    (opcional) UUID de um auth.users existente que será
                            dono da árvore. Se omitido, o script cria um profile
                            fictício "Helena Bertolini Albuquerque" com email
                            seed@stirps.dev. APENAS PARA DEV — em produção o
                            registro em auth.users é criado pelo Supabase Auth.
    STIRPS_TREE_NAME        (opcional, default "Família Bertolini-Albuquerque").

Flags:
    --reset     Apaga a tree existente com mesmo nome+owner antes de re-inserir.
    --dry-run   Exibe o que seria feito sem commitar nada no banco.
    --data-js   Caminho para o data.js do frontend
                (default /srv/strips/frontend/scripts/data.js).
"""

import argparse
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

try:
    import psycopg
except ImportError:
    sys.exit("Erro: instale as dependências com  pip install -r requirements-seed.txt")


# ---------------------------------------------------------------------------
# Parsing do data.js
# ---------------------------------------------------------------------------

def _extract_family_block(src: str) -> str:
    """Retorna a string do objeto JS atribuído a window.FAMILY = {...}."""
    marker = "window.FAMILY = {"
    start = src.index(marker) + len(marker) - 1  # posição do '{'
    depth = 0
    for i, ch in enumerate(src[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return src[start : i + 1]
    raise ValueError("Bloco window.FAMILY não termina corretamente.")


def _js_to_json(js: str) -> str:
    """Converte JS-object-literal em JSON válido (melhor esforço)."""
    # Remove comentários de linha  // ...
    js = re.sub(r"//[^\n]*", "", js)
    # Remove trailing commas antes de } ou ]
    js = re.sub(r",\s*([}\]])", r"\1", js)
    # Coloca aspas em chaves não-quotadas:  key: → "key":
    js = re.sub(r'(?<!["\w])([A-Za-z_][A-Za-z0-9_]*)(\s*):', r'"\1"\2:', js)
    return js


def load_family(data_js_path: str) -> dict:
    src = Path(data_js_path).read_text(encoding="utf-8")
    block = _extract_family_block(src)
    json_str = _js_to_json(block)
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        try:
            import json5  # type: ignore
            return json5.loads(block)
        except ImportError:
            pass
        raise


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def new_uuid() -> str:
    return str(uuid.uuid4())


def ensure_uuid_order(a: str, b: str):
    """Garante que partner_a_id < partner_b_id (comparação de strings de UUID)."""
    return (a, b) if a < b else (b, a)


# ---------------------------------------------------------------------------
# Pipeline de inserção
# ---------------------------------------------------------------------------

def run_seed(
    conn_str: str,
    owner_user_id: str | None,
    tree_name: str,
    data_js_path: str,
    reset: bool,
    dry_run: bool,
):
    t0 = time.monotonic()

    family = load_family(data_js_path)
    people_raw: dict = family["people"]
    unions_raw: list = family["unions"]

    # --- Determinar owner ---
    owner_id = owner_user_id
    owner_email = None
    create_auth_row = False

    if owner_id is None:
        owner_id = new_uuid()
        owner_email = "seed@stirps.dev"
        create_auth_row = True
    else:
        # Validar que o UUID fornecido existe em auth.users antes de prosseguir
        with psycopg.connect(conn_str) as _check_conn:
            row = _check_conn.execute(
                "SELECT 1 FROM auth.users WHERE id = %s", (owner_id,)
            ).fetchone()
        if row is None:
            sys.exit(
                f"ERROR: STIRPS_OWNER_USER_ID={owner_id} não existe em auth.users. "
                "Crie o usuário no Supabase Auth primeiro, ou desfina a variável "
                "para que o seed crie um usuário fictício de dev."
            )

    # --- Mapear old mock ids → novos UUIDs ---
    id_map: dict[str, str] = {old: new_uuid() for old in people_raw}

    # --- Gerar tree UUID ---
    tree_id = new_uuid()

    # --- Construir todos os statements antes de abrir a conexão (dry-run safe) ---
    stmts: list[tuple[str, tuple]] = []

    # 1. auth.users (só em dev, sem owner externo)
    if create_auth_row:
        stmts.append((
            "INSERT INTO auth.users(id, email) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (owner_id, owner_email),
        ))

    # 2. profile do dono
    # A trigger `on_auth_user_created` (migration 0009) pode já ter criado a linha
    # com um display_name derivado do email; o INSERT serve para o caso de owner
    # externo (sem auth.users novo) e o UPDATE garante que o nome escolhido aqui
    # prevaleça sobre o default da trigger.
    owner_display = "Helena Bertolini Albuquerque" if create_auth_row else f"owner:{owner_id[:8]}"
    stmts.append((
        """INSERT INTO profiles(id, display_name, locale)
           VALUES (%s, %s, 'pt-BR')
           ON CONFLICT DO NOTHING""",
        (owner_id, owner_display),
    ))
    stmts.append((
        "UPDATE profiles SET display_name = %s WHERE id = %s",
        (owner_display, owner_id),
    ))
    stmts.append((
        """INSERT INTO user_subscriptions(user_id, plan_code, status)
           VALUES (%s, 'family', 'active')
           ON CONFLICT (user_id) WHERE status = 'active'
           DO UPDATE SET plan_code = EXCLUDED.plan_code, updated_at = now()""",
        (owner_id,),
    ))

    # 3. tree
    stmts.append((
        """INSERT INTO trees(id, owner_id, name)
           VALUES (%s, %s, %s)""",
        (tree_id, owner_id, tree_name),
    ))

    # 4. tree_members (owner)
    stmts.append((
        """INSERT INTO tree_members(tree_id, user_id, role)
           VALUES (%s, %s, 'owner')
           ON CONFLICT DO NOTHING""",
        (tree_id, owner_id),
    ))

    # 5. persons
    persons_count = 0
    for old_id, p in people_raw.items():
        new_id = id_map[old_id]
        birth = p.get("birth") or {}
        death = p.get("death")
        is_living = death is None
        death = death or {}

        external_ids = json.dumps({
            "mockup_id": old_id,
            "mockup_avatar_color": p.get("photo"),
            "generation": p.get("generation"),
        })

        stmts.append((
            """INSERT INTO persons(
                id, tree_id,
                first_name, last_name,
                sex, is_living,
                birth_year, birth_place,
                death_year, death_place,
                occupation, bio, tags,
                external_ids,
                created_by
               ) VALUES (
                %s, %s,
                %s, %s,
                %s::sex_t, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s,
                %s::jsonb,
                %s
               )""",
            (
                new_id, tree_id,
                p.get("first"), p.get("last"),
                p.get("sex", "U"), is_living,
                birth.get("year"), birth.get("place"),
                death.get("year"), death.get("place"),
                p.get("occupation"), p.get("bio"),
                p.get("tags", []),
                external_ids,
                owner_id,
            ),
        ))
        persons_count += 1

    if "p_helena" in id_map:
        stmts.append((
            "UPDATE tree_members SET person_id = %s WHERE tree_id = %s AND user_id = %s",
            (id_map["p_helena"], tree_id, owner_id),
        ))

    # 6. person_parents
    parents_count = 0
    for old_id, p in people_raw.items():
        child_new_id = id_map[old_id]
        for parent_old_id in p.get("parents", []):
            parent_new_id = id_map[parent_old_id]
            stmts.append((
                """INSERT INTO person_parents(child_id, parent_id, kind)
                   VALUES (%s, %s, 'biological')
                   ON CONFLICT DO NOTHING""",
                (child_new_id, parent_new_id),
            ))
            parents_count += 1

    # 7. unions
    unions_count = 0
    for u in unions_raw:
        p1_old, p2_old = u["partners"]
        p1_new = id_map[p1_old]
        p2_new = id_map[p2_old]
        a_id, b_id = ensure_uuid_order(p1_new, p2_new)

        stmts.append((
            """INSERT INTO unions(
                id, tree_id,
                partner_a_id, partner_b_id,
                type, status,
                start_year, start_place
               ) VALUES (
                %s, %s,
                %s, %s,
                'marriage', 'ongoing',
                %s, %s
               )
               ON CONFLICT DO NOTHING""",
            (
                new_uuid(), tree_id,
                a_id, b_id,
                u.get("year"), u.get("place"),
            ),
        ))
        unions_count += 1

    # --- dry-run: imprimir e sair ---
    if dry_run:
        print(f"[dry-run] {len(stmts)} statements gerados (nada commitado).")
        print(f"  tree_id  : {tree_id}")
        print(f"  owner_id : {owner_id}")
        print(f"  persons  : {persons_count}")
        print(f"  parents  : {parents_count}")
        print(f"  unions   : {unions_count}")
        return

    # --- execução real ---
    with psycopg.connect(conn_str, autocommit=False) as conn:
        with conn.transaction():

            if reset:
                conn.execute(
                    "DELETE FROM trees WHERE owner_id = %s AND name = %s",
                    (owner_id, tree_name),
                )
                print(f"  Reset: tree '{tree_name}' removida (se existia).")

            for sql, params in stmts:
                conn.execute(sql, params)

    elapsed = time.monotonic() - t0

    label = owner_email if create_auth_row else f"id:{owner_id[:8]}"
    print(f"✓ Created profile: {label}")
    print(f"✓ Created tree: {tree_name} ({tree_id})")
    print(f"✓ Inserted {persons_count} persons")
    print(f"✓ Inserted {parents_count} parent links")
    print(f"✓ Inserted {unions_count} unions")
    print(f"Done in {elapsed:.1f}s")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Seed Stirps PostgreSQL com dados mock do frontend."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Apaga a tree com mesmo nome+owner antes de re-inserir.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Mostra o que faria sem commitar.",
    )
    parser.add_argument(
        "--data-js",
        default="/srv/strips/frontend/scripts/data.js",
        metavar="PATH",
        help="Caminho para o data.js do frontend.",
    )
    args = parser.parse_args()

    conn_str = os.environ.get("DATABASE_URL")
    if not conn_str:
        sys.exit("Erro: defina a variável de ambiente DATABASE_URL.")

    owner_user_id = os.environ.get("STIRPS_OWNER_USER_ID") or None
    tree_name = os.environ.get("STIRPS_TREE_NAME", "Família Bertolini-Albuquerque")

    run_seed(
        conn_str=conn_str,
        owner_user_id=owner_user_id,
        tree_name=tree_name,
        data_js_path=args.data_js,
        reset=args.reset,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
