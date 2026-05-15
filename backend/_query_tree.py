"""Query real tree data from Supabase to understand family structure."""
import json
import ssl
import urllib.request

SUPABASE_URL = "https://onbjspsksvpmhtpbicio.supabase.co"
SERVICE_KEY = "sb_secret_7tTE_iL4z4rvl4Npla9xqg_QBZQpzHi"
TREE_ID = "dc8ac34d-e15c-4376-842f-d9af2a944c9d"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def rest_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read())

# 1) All persons
persons = rest_get("persons", f"tree_id=eq.{TREE_ID}&select=id,first_name,last_name,sex,birth_year&order=first_name")
print("=== PERSONS ===")
for p in persons:
    print(f"  {p['id'][:8]}  {p['first_name']:20s} {(p['last_name'] or ''):20s} {(p['sex'] or ''):3s} {p.get('birth_year') or ''}")
print(f"Total: {len(persons)}")

# 2) All unions
unions = rest_get("unions", f"tree_id=eq.{TREE_ID}&select=id,partner_a_id,partner_b_id,type,status")
print("\n=== UNIONS ===")
for u in unions:
    a_name = next((p['first_name'] for p in persons if p['id'] == u['partner_a_id']), '?')
    b_name = next((p['first_name'] for p in persons if p['id'] == u['partner_b_id']), '?')
    print(f"  {a_name} + {b_name}  ({u['type']}, {u['status']})")

# 3) All parent-child relationships
parents = rest_get("person_parents", f"select=child_id,parent_id&order=child_id")
# Filter to persons in this tree
person_ids = {p['id'] for p in persons}
parents = [r for r in parents if r['child_id'] in person_ids]
print("\n=== PARENT-CHILD ===")
for r in parents:
    child_name = next((p['first_name'] + ' ' + (p['last_name'] or '') for p in persons if p['id'] == r['child_id']), '?')
    parent_name = next((p['first_name'] + ' ' + (p['last_name'] or '') for p in persons if p['id'] == r['parent_id']), '?')
    print(f"  {child_name:30s} <- parent: {parent_name}")

# 4) Build relationsByChild
print("\n=== RELATIONS BY CHILD ===")
relations_by_child = {}
for r in parents:
    cid = r['child_id']
    if cid not in relations_by_child:
        relations_by_child[cid] = []
    relations_by_child[cid].append(r['parent_id'])
for cid, pids in relations_by_child.items():
    child_name = next((p['first_name'] + ' ' + (p['last_name'] or '') for p in persons if p['id'] == cid), '?')
    parent_names = [next((p['first_name'] for p in persons if p['id'] == pid), '?') for pid in pids]
    print(f"  {child_name:30s} parents: {parent_names}")

# 5) Find Cassio Eduardo
print("\n=== CASSIO SEARCH ===")
for p in persons:
    if 'cassio' in (p['first_name'] or '').lower() or 'cássio' in (p['first_name'] or '').lower():
        print(f"  FOUND: {p['id']} {p['first_name']} {p['last_name']}")

# 6) Find Karine
print("\n=== KARINE SEARCH ===")
for p in persons:
    if 'karine' in (p['first_name'] or '').lower():
        print(f"  FOUND: {p['id']} {p['first_name']} {p['last_name']}")

# 7) Output JSON for test
print("\n=== JSON FOR TEST ===")
print(json.dumps({
    "people": [{
        "id": p["id"],
        "first_name": p["first_name"],
        "last_name": p["last_name"],
        "sex": p["sex"],
        "birth_year": p.get("birth_year"),
    } for p in persons],
    "unions": [{
        "id": u["id"],
        "partner_a_id": u["partner_a_id"],
        "partner_b_id": u["partner_b_id"],
        "type": u["type"],
    } for u in unions],
    "relationsByChild": relations_by_child,
}, indent=2))
