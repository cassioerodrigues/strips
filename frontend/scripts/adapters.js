// adapters.js — Pure mapping functions: backend DTOs → shape esperada pelos
// componentes (que ainda lê o "FAMILY-like" formato definido em data.js).
//
// Nenhum acesso a React / window.api / state aqui — só transformação pura.
// Carrega ANTES de tree-data.js (que importa estas funções via window.adapters).
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Pessoa
  // ---------------------------------------------------------------------
  // Backend (`PersonOut`):
  //   { id, tree_id, first_name, middle_names, last_name, maiden_name,
  //     display_name, sex, is_living, birth_year, birth_month, birth_day,
  //     birth_place, death_year, ..., death_place, death_cause, occupation,
  //     bio, tags, photo_media_id, ..., created_at, updated_at }
  //
  // Frontend (FAMILY-like) — campos que os componentes leem:
  //   { id, first, last, maiden, displayName, sex, isLiving,
  //     birth: { year, place }, death: { year, place, cause } | null,
  //     occupation, bio, tags, photoMediaId }
  function adaptPerson(p) {
    if (!p) return null;

    // first/last: preferir first_name/last_name; se ambos vazios, derivar de
    // display_name. Componentes esperam ao menos `first` para iniciais do
    // avatar e cabeçalhos.
    let first = p.first_name || "";
    let last = p.last_name || "";
    if (!first && !last && p.display_name) {
      const parts = String(p.display_name).trim().split(/\s+/);
      if (parts.length === 1) {
        first = parts[0];
      } else {
        first = parts[0];
        last = parts.slice(1).join(" ");
      }
    }

    const hasDeath =
      p.death_year != null ||
      p.death_month != null ||
      p.death_day != null ||
      (p.death_place && p.death_place.length > 0) ||
      (p.death_cause && p.death_cause.length > 0) ||
      p.is_living === false;

    return {
      id: p.id,
      first: first,
      last: last,
      maiden: p.maiden_name || "",
      maidenName: p.maiden_name || "",
      displayName: p.display_name || (first + (last ? " " + last : "")).trim(),
      sex: p.sex || "U",
      isLiving: p.is_living !== false,
      birth: {
        year: p.birth_year || null,
        month: p.birth_month || null,
        day: p.birth_day || null,
        place: p.birth_place || "",
      },
      death: hasDeath
        ? {
            year: p.death_year || null,
            month: p.death_month || null,
            day: p.death_day || null,
            place: p.death_place || "",
            cause: p.death_cause || "",
          }
        : null,
      occupation: p.occupation || "",
      bio: p.bio || "",
      tags: Array.isArray(p.tags) ? p.tags : [],
      photoMediaId: p.photo_media_id || null,
    };
  }

  // ---------------------------------------------------------------------
  // Relações
  // ---------------------------------------------------------------------
  // Backend (`RelationsResponse`):
  //   { parents: [PersonOut], spouse: PersonOut|null,
  //     siblings: [PersonOut], children: [PersonOut] }
  //
  // Frontend: mesmo formato, com cada pessoa já passada por adaptPerson.
  // Convertendo `spouse` (singular, opcional) em `partners` (array) para
  // alinhamento com o vocabulário do front (que historicamente fala em
  // "partners"/"cônjuges").
  function adaptRelations(r) {
    if (!r) {
      return { parents: [], partners: [], siblings: [], children: [] };
    }
    const parents = (r.parents || []).map(adaptPerson).filter(Boolean);
    const siblings = (r.siblings || []).map(adaptPerson).filter(Boolean);
    const children = (r.children || []).map(adaptPerson).filter(Boolean);
    const partners = [];
    if (r.spouse) {
      const sp = adaptPerson(r.spouse);
      if (sp) partners.push(sp);
    }
    return {
      parents: parents,
      partners: partners,
      siblings: siblings,
      children: children,
    };
  }

  // ---------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------
  // Backend (`TreeStatsOut`):
  //   { total_people, generations, countries, media_count,
  //     unions_count, events_count }
  function adaptStats(s) {
    if (!s) return null;
    return {
      totalPeople: s.total_people || 0,
      generations: s.generations || 0,
      countries: s.countries || 0,
      mediaCount: s.media_count || 0,
      unionsCount: s.unions_count || 0,
      eventsCount: s.events_count || 0,
    };
  }

  // ---------------------------------------------------------------------
  // Timeline
  // ---------------------------------------------------------------------
  // Backend (`TimelineItem`):
  //   { kind, year, month, day, person_id, union_id, title, place, description }
  //
  // Frontend espera (FAMILY.timeline):
  //   { year, label, place }
  //
  // Mantemos os campos originais (kind/personId/unionId/description) para
  // futuros usos.
  function adaptTimelineItem(item) {
    if (!item) return null;
    return {
      year: item.year || null,
      month: item.month || null,
      day: item.day || null,
      label: item.title || "",
      place: item.place || "",
      kind: item.kind || "event",
      personId: item.person_id || null,
      unionId: item.union_id || null,
      description: item.description || "",
    };
  }

  function adaptEvent(item) {
    if (!item) return null;
    const labelMap = {
      residence: "Mudança",
      occupation: "Carreira",
      education: "Formação",
      custom: item.custom_label || "Evento",
    };
    return {
      id: item.id,
      treeId: item.tree_id,
      personId: item.person_id || null,
      unionId: item.union_id || null,
      type: item.type || "custom",
      customLabel: item.custom_label || null,
      year: item.year || null,
      month: item.month || null,
      day: item.day || null,
      title: labelMap[item.type] || item.custom_label || item.type || "Evento",
      place: item.place || "",
      description: item.description || "",
    };
  }

  window.adapters = {
    adaptPerson: adaptPerson,
    adaptRelations: adaptRelations,
    adaptStats: adaptStats,
    adaptTimelineItem: adaptTimelineItem,
    adaptEvent: adaptEvent,
  };
})();
