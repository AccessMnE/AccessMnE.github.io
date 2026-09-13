/**
 * Shared schedule storage (Planning / Actual / Groups / Cuti / Daily meta)
 * Migrates schedule_app_state_v2 → v3 on first load.
 */
(function (global) {
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_LABELS = {
    mon: "Isnin",
    tue: "Selasa",
    wed: "Rabu",
    thu: "Khamis",
    fri: "Jumaat",
    sat: "Sabtu",
    sun: "Ahad",
  };
  const DAY_LABELS_MS = {
    mon: "ISNIN",
    tue: "SELASA",
    wed: "RABU",
    thu: "KHAMIS",
    fri: "JUMAAT",
    sat: "SABTU",
    sun: "AHAD",
  };

  const STORAGE_KEY_V2 = "schedule_app_state_v2";
  const STORAGE_KEY = "schedule_app_state_v3";

  function emptyDayMap(factory) {
    const o = {};
    DAYS.forEach((d) => (o[d] = factory ? factory() : []));
    return o;
  }

  function createRow(jobCode = "") {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { id, jobCode, assignments: emptyDayMap(() => []) };
  }

  function normalizeRow(row) {
    if (!row || typeof row !== "object") return createRow("");
    const assignments = emptyDayMap(() => []);
    DAYS.forEach((d) => {
      const src = row.assignments && Array.isArray(row.assignments[d]) ? row.assignments[d] : [];
      assignments[d] = src.map(String);
    });
    return {
      id: row.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      jobCode: typeof row.jobCode === "string" ? row.jobCode : "",
      assignments,
    };
  }

  function normalizeLeave(leave) {
    const out = emptyDayMap(() => []);
    if (!leave || typeof leave !== "object") return out;
    DAYS.forEach((d) => {
      out[d] = Array.isArray(leave[d]) ? leave[d].map(String) : [];
    });
    return out;
  }

  function normalizeGroups(groups) {
    if (!Array.isArray(groups)) return [];
    return groups
      .filter((g) => g && typeof g === "object")
      .map((g) => ({
        id: g.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: String(g.name || "Group"),
        members: Array.isArray(g.members) ? g.members.map(String) : [],
      }));
  }

  function normalizeDaily(daily) {
    return daily && typeof daily === "object" ? daily : {};
  }

  function defaultState() {
    return {
      workers: ["Alice", "Bob", "Charlie"],
      groups: [],
      leave: emptyDayMap(() => []),
      planning: { rows: [createRow("JOB-001"), createRow("JOB-002")] },
      actual: { rows: [] },
      daily: {},
      ui: { boardMode: "planning" },
    };
  }

  function migrateFromV2(v2) {
    const rows = Array.isArray(v2.rows) ? v2.rows.map(normalizeRow) : [];
    return {
      workers: Array.isArray(v2.workers) ? v2.workers.map(String) : [],
      groups: [],
      leave: emptyDayMap(() => []),
      planning: { rows },
      actual: { rows: [] },
      daily: {},
      ui: { boardMode: "planning" },
    };
  }

  function normalizeState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== "object") return base;

    // v2 shape detection
    if (Array.isArray(raw.rows) && !raw.planning) {
      return migrateFromV2(raw);
    }

    return {
      workers: Array.isArray(raw.workers) ? raw.workers.map(String) : [],
      groups: normalizeGroups(raw.groups),
      leave: normalizeLeave(raw.leave),
      planning: {
        rows: Array.isArray(raw.planning?.rows) ? raw.planning.rows.map(normalizeRow) : [],
      },
      actual: {
        rows: Array.isArray(raw.actual?.rows) ? raw.actual.rows.map(normalizeRow) : [],
      },
      daily: normalizeDaily(raw.daily),
      ui: {
        boardMode: raw.ui?.boardMode === "actual" ? "actual" : "planning",
      },
    };
  }

  function loadState() {
    try {
      const v3 = localStorage.getItem(STORAGE_KEY);
      if (v3) return normalizeState(JSON.parse(v3));

      const v2 = localStorage.getItem(STORAGE_KEY_V2);
      if (v2) {
        const migrated = migrateFromV2(JSON.parse(v2));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return defaultState();
    } catch {
      return defaultState();
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getBoard(state) {
    const mode = state.ui?.boardMode === "actual" ? "actual" : "planning";
    return state[mode];
  }

  function getRows(state) {
    return getBoard(state).rows;
  }

  function setBoardMode(state, mode) {
    state.ui = state.ui || {};
    state.ui.boardMode = mode === "actual" ? "actual" : "planning";
  }

  function deepCloneRows(rows) {
    return JSON.parse(JSON.stringify(rows || [])).map(normalizeRow);
  }

  function copyPlanningToActual(state) {
    state.actual = { rows: deepCloneRows(state.planning.rows) };
    // Copy daily meta for matching days from planning → actual keys
    Object.keys(state.daily || {}).forEach((key) => {
      if (key.startsWith("planning:")) {
        const day = key.slice("planning:".length);
        state.daily[`actual:${day}`] = JSON.parse(JSON.stringify(state.daily[key]));
      }
    });
  }

  function dailyKey(mode, day) {
    return `${mode === "actual" ? "actual" : "planning"}:${day}`;
  }

  function getDailyMeta(state, mode, day) {
    const key = dailyKey(mode, day);
    const cur = state.daily[key];
    if (cur && typeof cur === "object") {
      return {
        dateLabel: cur.dateLabel || "",
        timeNotes: cur.timeNotes || "",
        pic: cur.pic || "",
        supervisor: cur.supervisor || "",
        preamble: cur.preamble || "",
        materials: cur.materials || "",
        jobs: cur.jobs && typeof cur.jobs === "object" ? cur.jobs : {},
      };
    }
    return {
      dateLabel: "",
      timeNotes: "",
      pic: "",
      supervisor: "",
      preamble: "",
      materials: "",
      jobs: {},
    };
  }

  function setDailyMeta(state, mode, day, meta) {
    state.daily = state.daily || {};
    state.daily[dailyKey(mode, day)] = meta;
  }

  function getJobDetail(meta, rowId) {
    const j = meta.jobs?.[rowId];
    if (!j || typeof j !== "object") {
      return { siteName: "", description: "", workerNotes: {} };
    }
    return {
      siteName: j.siteName || "",
      description: j.description || "",
      workerNotes: j.workerNotes && typeof j.workerNotes === "object" ? j.workerNotes : {},
    };
  }

  /** Names assigned to jobs on a day (not leave). */
  function assignedOnDay(state, day, mode) {
    const board = mode === "actual" ? state.actual : mode === "planning" ? state.planning : getBoard(state);
    const set = new Set();
    (board.rows || []).forEach((row) => {
      (row.assignments[day] || []).forEach((n) => set.add(n));
    });
    return set;
  }

  function onLeave(state, day) {
    return new Set(state.leave?.[day] || []);
  }

  function coverageForDay(state, day, mode) {
    const assigned = assignedOnDay(state, day, mode);
    const leave = onLeave(state, day);
    const unassigned = state.workers.filter((w) => !assigned.has(w) && !leave.has(w));
    const leaveList = state.workers.filter((w) => leave.has(w));
    const assignedList = state.workers.filter((w) => assigned.has(w));
    return {
      total: state.workers.length,
      assignedCount: assignedList.length,
      leaveCount: leaveList.length,
      unassignedCount: unassigned.length,
      assigned: assignedList,
      leave: leaveList,
      unassigned,
    };
  }

  function removeWorkerEverywhere(state, name) {
    state.workers = state.workers.filter((w) => w !== name);
    state.groups.forEach((g) => {
      g.members = g.members.filter((m) => m !== name);
    });
    DAYS.forEach((d) => {
      state.leave[d] = (state.leave[d] || []).filter((x) => x !== name);
    });
    ["planning", "actual"].forEach((board) => {
      (state[board].rows || []).forEach((row) => {
        DAYS.forEach((d) => {
          row.assignments[d] = (row.assignments[d] || []).filter((x) => x !== name);
        });
      });
    });
  }

  function parseDragPayload(dataTransfer) {
    const raw = dataTransfer.getData("application/x-schedule-payload");
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (p && p.type === "group" && Array.isArray(p.members)) {
          return { type: "group", members: p.members.map(String), groupId: p.groupId || "" };
        }
        if (p && p.type === "worker" && p.name) {
          return { type: "worker", name: String(p.name) };
        }
      } catch {
        /* fall through */
      }
    }
    const name = (dataTransfer.getData("text/plain") || "").trim();
    if (name) return { type: "worker", name };
    return null;
  }

  function setDragPayload(dataTransfer, payload) {
    dataTransfer.setData("application/x-schedule-payload", JSON.stringify(payload));
    if (payload.type === "worker") {
      dataTransfer.setData("text/plain", payload.name);
    } else if (payload.type === "group") {
      dataTransfer.setData("text/plain", payload.members.join(","));
    }
    dataTransfer.effectAllowed = "copy";
  }

  /**
   * Try assign names to a job cell. Returns { added, skippedLeave, skippedConflict }.
   */
  function assignNamesToCell(state, row, day, names, opts = {}) {
    const rows = opts.rows || getRows(state);
    const added = [];
    const skippedLeave = [];
    const skippedConflict = [];
    const leaveSet = onLeave(state, day);

    names.forEach((name) => {
      if (!name) return;
      if (leaveSet.has(name) && !opts.allowLeave) {
        skippedLeave.push(name);
        return;
      }
      const conflict = rows.some(
        (r) => r.id !== row.id && (r.assignments[day] || []).includes(name)
      );
      if (conflict) {
        skippedConflict.push(name);
        return;
      }
      if (!(row.assignments[day] || []).includes(name)) {
        row.assignments[day].push(name);
        added.push(name);
      }
    });
    return { added, skippedLeave, skippedConflict };
  }

  function formatJadualText(state, mode, day) {
    const meta = getDailyMeta(state, mode, day);
    const board = mode === "actual" ? state.actual : state.planning;
    const lines = [];
    const dayMs = DAY_LABELS_MS[day] || day.toUpperCase();
    lines.push(`Jadual Kerja ${dayMs}${meta.dateLabel ? " " + meta.dateLabel : ""}`);
    if (meta.timeNotes.trim()) {
      meta.timeNotes
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((l) => lines.push(l));
    }
    if (meta.pic.trim()) lines.push(`PIC : ${meta.pic.trim()}`);
    if (meta.supervisor.trim()) lines.push(`Supervisor : ${meta.supervisor.trim()}`);
    lines.push("---------------------------------");
    if (meta.preamble.trim()) {
      lines.push(meta.preamble.trim());
    }

    let idx = 0;
    (board.rows || []).forEach((row) => {
      const workers = row.assignments[day] || [];
      if (!workers.length) return;
      idx += 1;
      const detail = getJobDetail(meta, row.id);
      const title =
        detail.siteName.trim() ||
        row.jobCode.trim() ||
        `Job ${idx}`;
      lines.push(`${idx}) ${title}`);
      const descParts = [];
      if (detail.description.trim()) descParts.push(detail.description.trim());
      if (row.jobCode.trim() && detail.siteName.trim()) descParts.push(row.jobCode.trim());
      else if (row.jobCode.trim() && !detail.siteName.trim() && detail.description.trim()) {
        descParts.push(row.jobCode.trim());
      }
      if (descParts.length) {
        lines.push(descParts.join(" - "));
      } else if (row.jobCode.trim() && detail.siteName.trim()) {
        lines.push(row.jobCode.trim());
      }
      workers.forEach((w) => {
        const note = detail.workerNotes?.[w];
        if (note && String(note).trim()) {
          lines.push(`- ${w} (${String(note).trim()})`);
        } else {
          lines.push(`- ${w}`);
        }
      });
      lines.push("---------------------------------");
    });

    const leave = state.leave?.[day] || [];
    if (leave.length) {
      lines.push(`Cuti`);
      leave.forEach((w) => lines.push(`- ${w}`));
      lines.push("---------------------------------");
    }

    lines.push("Tolong Minta Barang Keperluan Hari Ini");
    if (meta.materials.trim()) {
      meta.materials
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((l) => lines.push(l.startsWith("-") ? l : `- ${l}`));
    } else {
      lines.push("- ");
    }

    return lines.join("\n");
  }

  global.ScheduleStore = {
    DAYS,
    DAY_LABELS,
    DAY_LABELS_MS,
    STORAGE_KEY,
    createRow,
    loadState,
    saveState,
    getBoard,
    getRows,
    setBoardMode,
    copyPlanningToActual,
    getDailyMeta,
    setDailyMeta,
    getJobDetail,
    assignedOnDay,
    onLeave,
    coverageForDay,
    removeWorkerEverywhere,
    parseDragPayload,
    setDragPayload,
    assignNamesToCell,
    formatJadualText,
    emptyDayMap,
    deepCloneRows,
  };
})(typeof window !== "undefined" ? window : globalThis);
