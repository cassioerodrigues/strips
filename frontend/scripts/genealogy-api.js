// genealogy-api.js — ações CRUD da genealogia sobre window.api.fetch.
//
// Mantém conversões de formulário em um lugar testável, deixando os
// componentes focados em estado visual.
(function () {
  "use strict";

  function cleanText(value) {
    if (value == null) return null;
    const text = String(value).trim();
    return text ? text : null;
  }

  function cleanInt(value) {
    if (value == null || value === "") return null;
    const n = Number.parseInt(String(value), 10);
    return Number.isFinite(n) ? n : null;
  }

  function cleanTags(tags) {
    if (!Array.isArray(tags)) return [];
    return tags.map(cleanText).filter(Boolean);
  }

  function normalizeSex(value) {
    return value === "M" || value === "F" || value === "O" || value === "U" ? value : "U";
  }

  function personPayloadFromForm(form) {
    const living = form && form.living !== false;
    return {
      first_name: cleanText(form && form.first),
      middle_names: cleanText(form && form.middle),
      last_name: cleanText(form && form.last),
      maiden_name: cleanText((form && (form.maidenName || form.maiden)) || null),
      sex: normalizeSex(form && form.sex),
      is_living: living,
      birth_year: cleanInt(form && form.birthYear),
      birth_month: cleanInt(form && form.birthMonth),
      birth_day: cleanInt(form && form.birthDay),
      birth_place: cleanText(form && form.birthPlace),
      death_year: living ? null : cleanInt(form && form.deathYear),
      death_month: living ? null : cleanInt(form && form.deathMonth),
      death_day: living ? null : cleanInt(form && form.deathDay),
      death_place: living ? null : cleanText(form && form.deathPlace),
      death_cause: living ? null : cleanText(form && form.cause),
      occupation: cleanText(form && form.occupation),
      bio: cleanText(form && form.bio),
      tags: cleanTags(form && form.tags),
    };
  }

  function unionPayloadFromForm(form, personId) {
    return {
      partner_a_id: personId || cleanText(form && form.partnerAId),
      partner_b_id: cleanText((form && (form.marriageWith || form.partnerBId)) || null),
      type: "marriage",
      status: "ongoing",
      start_year: cleanInt(form && form.year),
      start_month: cleanInt(form && form.month),
      start_day: cleanInt(form && form.day),
      start_place: cleanText(form && form.place),
      notes: cleanText(form && (form.description || form.sources)),
    };
  }

  const EVENT_TYPE_MAP = {
    move: "residence",
    education: "education",
    career: "occupation",
  };

  const CUSTOM_EVENT_LABELS = {
    birth: "Nascimento",
    death: "Falecimento",
    child: "Filho(a)",
    honor: "Conquista",
    custom: "Evento",
  };

  function eventPayloadFromForm(form, personId, unionId) {
    const rawType = (form && form.type) || "custom";
    const mappedType = EVENT_TYPE_MAP[rawType] || (rawType === "marriage" ? "custom" : "custom");
    const title = cleanText(form && form.title);
    const customLabel = mappedType === "custom"
      ? (title || CUSTOM_EVENT_LABELS[rawType] || "Evento")
      : null;
    return {
      person_id: personId || null,
      union_id: unionId || null,
      type: mappedType,
      custom_label: customLabel,
      year: cleanInt(form && form.year),
      month: cleanInt(form && form.month),
      day: cleanInt(form && form.day),
      place: cleanText(form && form.place),
      description: cleanText(form && form.description),
    };
  }

  function apiFetch(path, options) {
    if (!window.api || typeof window.api.fetch !== "function") {
      throw new Error("API indisponível para salvar alterações.");
    }
    return window.api.fetch(path, options);
  }

  async function addParent(childId, parentId, kind) {
    if (!childId || !parentId) return null;
    return apiFetch("/people/" + childId + "/parents", {
      method: "POST",
      body: { parent_id: parentId, kind: kind || "biological" },
    });
  }

  async function removeParent(childId, parentId) {
    return apiFetch("/people/" + childId + "/parents/" + parentId, { method: "DELETE" });
  }

  async function createUnion(treeId, payload) {
    return apiFetch("/trees/" + treeId + "/unions", { method: "POST", body: payload });
  }

  async function updateUnion(unionId, payload) {
    return apiFetch("/unions/" + unionId, { method: "PATCH", body: payload });
  }

  async function deleteUnion(unionId) {
    return apiFetch("/unions/" + unionId, { method: "DELETE" });
  }

  async function createEvent(treeId, payload) {
    return apiFetch("/trees/" + treeId + "/events", { method: "POST", body: payload });
  }

  async function updateEvent(eventId, payload) {
    return apiFetch("/events/" + eventId, { method: "PATCH", body: payload });
  }

  async function deleteEvent(eventId) {
    return apiFetch("/events/" + eventId, { method: "DELETE" });
  }

  async function createPersonWithRelation(treeId, form) {
    const person = await apiFetch("/trees/" + treeId + "/people", {
      method: "POST",
      body: personPayloadFromForm(form),
    });
    const newId = person && person.id;
    if (!newId) return person;

    if (form.relType === "child") {
      await addParent(newId, form.relTo);
      await addParent(newId, form.spouseId);
    } else if (form.relType === "parent") {
      await addParent(form.relTo, newId);
    } else if (form.relType === "spouse") {
      await createUnion(treeId, {
        partner_a_id: form.relTo,
        partner_b_id: newId,
        type: "marriage",
        status: "ongoing",
      });
    } else if (form.relType === "sibling") {
      const relations = await apiFetch("/people/" + form.relTo + "/relations", { method: "GET" });
      const parents = relations && Array.isArray(relations.parents) ? relations.parents : [];
      await Promise.all(parents.map(function (parent) {
        return addParent(newId, parent.id);
      }));
    }
    return person;
  }

  async function updatePerson(personId, form) {
    return apiFetch("/people/" + personId, {
      method: "PATCH",
      body: personPayloadFromForm(form),
    });
  }

  async function deletePerson(personId) {
    return apiFetch("/people/" + personId, { method: "DELETE" });
  }

  window.genealogyApi = {
    personPayloadFromForm: personPayloadFromForm,
    unionPayloadFromForm: unionPayloadFromForm,
    eventPayloadFromForm: eventPayloadFromForm,
    createPersonWithRelation: createPersonWithRelation,
    updatePerson: updatePerson,
    deletePerson: deletePerson,
    addParent: addParent,
    removeParent: removeParent,
    createUnion: createUnion,
    updateUnion: updateUnion,
    deleteUnion: deleteUnion,
    createEvent: createEvent,
    updateEvent: updateEvent,
    deleteEvent: deleteEvent,
  };
})();
