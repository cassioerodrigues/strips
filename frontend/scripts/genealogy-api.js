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
    const externalIds = Object.assign({}, (form && form.externalIds) || {});
    const birthNote = cleanText(form && form.birthNote);
    const birthSource = cleanText(form && form.birthSource);
    if (birthNote) externalIds.birth_note = birthNote;
    else delete externalIds.birth_note;
    if (birthSource) externalIds.birth_source = birthSource;
    else delete externalIds.birth_source;
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
      external_ids: externalIds,
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
    const relatedPersonIds = uniqueIds(form && form.relatedPeople)
      .filter(function (id) { return id !== personId; });
    return {
      person_id: personId || null,
      union_id: unionId || null,
      related_person_ids: relatedPersonIds,
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

  class MediaStepError extends Error {
    constructor(step, message, cause) {
      super(message);
      this.name = "MediaStepError";
      this.step = step;
      this.cause = cause || null;
    }
  }

  function mediaKindFromFile(file) {
    const mime = (file && file.type) || "";
    if (mime.indexOf("image/") === 0) return "photo";
    if (mime.indexOf("audio/") === 0) return "audio";
    if (mime.indexOf("video/") === 0) return "video";
    if (mime === "application/pdf" || mime.indexOf("text/") === 0) return "document";
    return "other";
  }

  function mediaTitleFromFile(file) {
    const name = (file && file.name) || "Arquivo";
    return name.replace(/\.[^.]+$/, "") || name;
  }

  function stepMessage(step, e) {
    const detail = e && e.message ? e.message : String(e || "");
    if (step === "upload-url") return "Nao foi possivel criar a URL assinada de upload. " + detail;
    if (step === "storage-upload") return "Nao foi possivel enviar o arquivo ao Storage. " + detail;
    if (step === "metadata") return "O arquivo foi enviado, mas a metadata nao foi registrada. " + detail;
    if (step === "delete") return "Nao foi possivel remover a midia. " + detail;
    if (step === "download-url") return "Nao foi possivel assinar a URL de download. " + detail;
    return detail || "Falha na operacao de midia.";
  }

  async function requestMediaUploadUrl(treeId, file, entityType, entityId) {
    try {
      return await apiFetch("/trees/" + treeId + "/media/upload-url", {
        method: "POST",
        body: {
          filename: file && file.name ? file.name : "file",
          mime_type: (file && file.type) || "application/octet-stream",
          entity_type: entityType || "person",
          entity_id: entityId,
        },
      });
    } catch (e) {
      throw new MediaStepError("upload-url", stepMessage("upload-url", e), e);
    }
  }

  async function uploadFileToSignedUrl(url, file) {
    let response;
    try {
      response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": (file && file.type) || "application/octet-stream",
        },
        body: file,
      });
    } catch (e) {
      throw new MediaStepError("storage-upload", stepMessage("storage-upload", e), e);
    }
    if (!response.ok) {
      let detail = response.statusText || "HTTP " + response.status;
      try {
        const text = await response.text();
        if (text) detail = text;
      } catch (_) {}
      throw new MediaStepError("storage-upload", stepMessage("storage-upload", new Error(detail)), null);
    }
    return true;
  }

  async function registerMediaMetadata(treeId, file, storagePath, overrides) {
    const patch = overrides || {};
    try {
      return await apiFetch("/trees/" + treeId + "/media", {
        method: "POST",
        body: {
          tree_id: treeId,
          kind: patch.kind || mediaKindFromFile(file),
          storage_path: storagePath,
          mime_type: (file && file.type) || "application/octet-stream",
          size_bytes: file && typeof file.size === "number" ? file.size : null,
          title: patch.title || mediaTitleFromFile(file),
          description: patch.description || null,
          taken_year: patch.taken_year || null,
          taken_month: patch.taken_month || null,
          taken_day: patch.taken_day || null,
          taken_place: patch.taken_place || null,
        },
      });
    } catch (e) {
      throw new MediaStepError("metadata", stepMessage("metadata", e), e);
    }
  }

  async function linkPersonMedia(personId, mediaId, isPrimary) {
    return apiFetch("/people/" + personId + "/media/" + mediaId, {
      method: "POST",
      body: { is_primary: !!isPrimary },
    });
  }

  async function uploadPersonMedia(treeId, personId, file, options) {
    const opts = options || {};
    const signed = await requestMediaUploadUrl(treeId, file, "person", personId);
    await uploadFileToSignedUrl(signed.url, file);
    const media = await registerMediaMetadata(treeId, file, signed.storage_path, opts);
    try {
      await linkPersonMedia(personId, media.id, !!opts.isPrimary);
    } catch (e) {
      throw new MediaStepError("metadata", stepMessage("metadata", e), e);
    }
    return media;
  }

  async function listPersonMedia(personId) {
    return apiFetch("/people/" + personId + "/media", { method: "GET" });
  }

  async function getMediaDownloadUrl(mediaId) {
    try {
      return await apiFetch("/media/" + mediaId + "/download-url", { method: "GET" });
    } catch (e) {
      throw new MediaStepError("download-url", stepMessage("download-url", e), e);
    }
  }

  async function deleteMedia(mediaId) {
    try {
      return await apiFetch("/media/" + mediaId, { method: "DELETE" });
    } catch (e) {
      throw new MediaStepError("delete", stepMessage("delete", e), e);
    }
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

    await createRelationshipLinks(treeId, newId, normalizeRelationshipForm(form));
    return person;
  }

  function uniqueIds(ids) {
    return (Array.isArray(ids) ? ids : [])
      .filter(Boolean)
      .filter(function (id, index, arr) { return arr.indexOf(id) === index; });
  }

  function normalizeRelationshipForm(form) {
    const normalized = {
      parentIds: uniqueIds(form && form.parentIds),
      childIds: uniqueIds(form && form.childIds),
      spouseIds: uniqueIds(form && form.spouseIds),
      siblingIds: uniqueIds(form && form.siblingIds),
    };

    if (form && form.relTo) {
      if (form.relType === "child") {
        normalized.parentIds = uniqueIds(normalized.parentIds.concat([form.relTo, form.spouseId]));
      } else if (form.relType === "parent") {
        normalized.childIds = uniqueIds(normalized.childIds.concat([form.relTo]));
      } else if (form.relType === "spouse") {
        normalized.spouseIds = uniqueIds(normalized.spouseIds.concat([form.relTo]));
      } else if (form.relType === "sibling") {
        normalized.siblingIds = uniqueIds(normalized.siblingIds.concat([form.relTo]));
      }
    }

    return normalized;
  }

  async function createRelationshipLinks(treeId, personId, form) {
    const rel = normalizeRelationshipForm(form || {});
    await Promise.all(rel.parentIds.map(function (parentId) {
      return addParent(personId, parentId);
    }));
    await Promise.all(rel.childIds.map(function (childId) {
      return addParent(childId, personId);
    }));
    await Promise.all(rel.spouseIds.map(function (spouseId) {
      if (!spouseId || spouseId === personId) return null;
      return createUnion(treeId, {
        partner_a_id: personId,
        partner_b_id: spouseId,
        type: "marriage",
        status: "ongoing",
      });
    }));
    await Promise.all(rel.siblingIds.map(async function (siblingId) {
      if (!siblingId || siblingId === personId) return null;
      const relations = await apiFetch("/people/" + siblingId + "/relations", { method: "GET" });
      const parents = relations && Array.isArray(relations.parents) ? relations.parents : [];
      return Promise.all(parents.map(function (parent) {
        return addParent(personId, parent.id);
      }));
    }));
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
    createRelationshipLinks: createRelationshipLinks,
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
    MediaStepError: MediaStepError,
    mediaKindFromFile: mediaKindFromFile,
    requestMediaUploadUrl: requestMediaUploadUrl,
    uploadFileToSignedUrl: uploadFileToSignedUrl,
    registerMediaMetadata: registerMediaMetadata,
    linkPersonMedia: linkPersonMedia,
    uploadPersonMedia: uploadPersonMedia,
    listPersonMedia: listPersonMedia,
    getMediaDownloadUrl: getMediaDownloadUrl,
    deleteMedia: deleteMedia,
  };
})();
