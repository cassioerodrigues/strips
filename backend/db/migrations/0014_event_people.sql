-- Migration 0014: related people for events
-- Allows an event to keep one primary person_id/union_id while linking
-- additional people who participated in the same event.

create table event_people (
  event_id  uuid not null references events(id)  on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  primary key (event_id, person_id)
);

create index event_people_event_idx on event_people(event_id);
create index event_people_person_idx on event_people(person_id);

alter table event_people enable row level security;

-- tree_id is derived from the event. Members can read related people for
-- events in their trees; owners/editors can add/remove those links.
create policy event_people_select on event_people
  for select using (
    is_tree_member((select tree_id from events where id = event_id))
  );

create policy event_people_write on event_people
  for all using (
    tree_role((select tree_id from events where id = event_id)) in ('owner','editor')
  )
  with check (
    tree_role((select tree_id from events where id = event_id)) in ('owner','editor')
  );
