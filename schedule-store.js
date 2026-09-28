/**
 * Shared schedule storage (weekly: Planning / Actual / Cuti / Daily meta; global: Workers / Groups)
 * Migrates schedule_app_state_v2 / v3 → v4 on first load (v3 data is kept untouched as a backup).
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
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const STORAGE_KEY_V2 = "schedule_app_state_v2";
  const STORAGE_KEY_V3 = "schedule_app_state_v3";
  const STORAGE_KEY = "schedule_app_state_v4";

  // —— Dates (local time; week key = ISO date of that week's Monday) ——

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseISODate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function weekKeyOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return toISODate(d);
  }

  function currentWeekKey() {
    return weekKeyOf(new Date());
  }

  function normalizeWeekKey(s) {
    const d = parseISODate(s);
    return d ? weekKeyOf(d) : null;
  }

  function shiftWeek(key, weeks) {
    const d = parseISODate(key) || new Date();
    d.setDate(d.getDate() + weeks * 7);
    return weekKeyOf(d);
  }

  function dayDate(key, day) {
    const d = parseISODate(key) || new Date();
    const idx = Math.max(0, DAYS.indexOf(day));
    d.setDate(d.getDate() + idx);
    return d;
  }

  function isoWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dow);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  /** e.g. 14/9/26 (same style as the WhatsApp Jadual) */
  function formatShortDate(d) {
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
  }

  /** e.g. 28/9 */
  function formatDayMonth(d) {
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  /** e.g. 28 Sep – 4 Oct 2026 */
  function formatWeekRange(key) {
    const start = dayDate(key, "mon");
    const end = dayDate(key, "sun");
    const startText =
      start.getFullYear() === end.getFullYear()
        ? `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}`
        : `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} ${start.getFullYear()}`;
    return `${startText} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  }

  /** Parse d/m/yy or d/m/yyyy → Date, else null */
  function parseShortDate(s) {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(String(s || ""));
    if (!m) return null;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
  }

  // —— Shapes ——

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

  function emptyWeek() {
    return {
      leave: emptyDayMap(() => []),
      planning: { rows: [] },
      actual: { rows: [] },
      daily: {},
    };
  }

  function normalizeWeek(w) {
    if (!w || typeof w !== "object") return emptyWeek();
    return {
      leave: normalizeLeave(w.leave),
      planning: {
        rows: Array.isArray(w.planning?.rows) ? w.planning.rows.map(normalizeRow) : [],
      },
      actual: {
        rows: Array.isArray(w.actual?.rows) ? w.actual.rows.map(normalizeRow) : [],
      },
      daily: normalizeDaily(w.daily),
    };
  }

  function isWeekEmpty(w) {
    if (!w) return true;
    if ((w.planning?.rows || []).length || (w.actual?.rows || []).length) return false;
    if (DAYS.some((d) => (w.leave?.[d] || []).length)) return false;
    return Object.keys(w.daily || {}).length === 0;
  }

  function defaultState() {
    const week = emptyWeek();
    week.planning.rows = [createRow("JOB-001"), createRow("JOB-002")];
    return {
      version: 4,
      workers: ["Alice", "Bob", "Charlie"],
      groups: [],
      weeks: { [currentWeekKey()]: week },
      ui: { boardMode: "planning" },
    };
  }

  /** Old single-week data had no real dates: use a Daily "dateLabel" that matches its weekday, else this week. */
  function inferLegacyWeekKey(daily) {
    for (const [key, meta] of Object.entries(daily || {})) {
      const day = key.split(":")[1];
      const d = parseShortDate(meta?.dateLabel);
      if (d && DAYS[(d.getDay() + 6) % 7] === day) return weekKeyOf(d);
    }
    return currentWeekKey();
  }

  function migrateFromV3(v3) {
    const week = normalizeWeek(v3);
    return {
      version: 4,
      workers: Array.isArray(v3.workers) ? v3.workers.map(String) : [],
      groups: normalizeGroups(v3.groups),
      weeks: { [inferLegacyWeekKey(week.daily)]: week },
      ui: { boardMode: v3.ui?.boardMode === "actual" ? "actual" : "planning" },
    };
  }

  function migrateFromV2(v2) {
    return migrateFromV3({
      workers: v2.workers,
      planning: { rows: Array.isArray(v2.rows) ? v2.rows : [] },
    });
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return defaultState();
    const weeks = {};
    Object.entries(raw.weeks || {}).forEach(([key, w]) => {
      const k = normalizeWeekKey(key);
      if (k) weeks[k] = normalizeWeek(w);
    });
    return {
      version: 4,
      workers: Array.isArray(raw.workers) ? raw.workers.map(String) : [],
      groups: normalizeGroups(raw.groups),
      weeks,
      ui: { boardMode: raw.ui?.boardMode === "actual" ? "actual" : "planning" },
    };
  }

  function loadState() {
    try {
      const v4 = localStorage.getItem(STORAGE_KEY);
      if (v4) return normalizeState(JSON.parse(v4));

      let migrated = null;
      const v3 = localStorage.getItem(STORAGE_KEY_V3);
      if (v3) {
        migrated = migrateFromV3(JSON.parse(v3));
      } else {
        const v2 = localStorage.getItem(STORAGE_KEY_V2);
        if (v2) migrated = migrateFromV2(JSON.parse(v2));
      }
      if (migrated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return defaultState();
    } catch {
      return defaultState();
    }
  }

  function saveState(state) {
    const weeks = {};
    Object.entries(state.weeks || {}).forEach(([k, w]) => {
      if (!isWeekEmpty(w)) weeks[k] = w;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, weeks }));
  }

  // —— Week access ——

  /** Returns the week object (created in memory if missing; empty weeks are not saved). */
  function getWeek(state, key) {
    state.weeks = state.weeks || {};
    if (!state.weeks[key]) state.weeks[key] = emptyWeek();
    return state.weeks[key];
  }

  function clearWeek(state, key) {
    state.weeks[key] = emptyWeek();
  }

  function boardModeOf(state) {
    return state.ui?.boardMode === "actual" ? "actual" : "planning";
  }

  function getBoard(state, week) {
    return week[boardModeOf(state)];
  }

  function getRows(state, week) {
    return getBoard(state, week).rows;
  }

  function setBoardMode(state, mode) {
    state.ui = state.ui || {};
    state.ui.boardMode = mode === "actual" ? "actual" : "planning";
  }

  function deepCloneRows(rows) {
    return JSON.parse(JSON.stringify(rows || [])).map((r) => ({
      ...normalizeRow(r),
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }));
  }

  /** Row ids are kept so Daily job details (keyed by row id) still match. */
  function copyPlanningToActual(week) {
    week.actual = { rows: JSON.parse(JSON.stringify(week.planning.rows)).map(normalizeRow) };
    Object.keys(week.daily || {}).forEach((key) => {
      if (key.startsWith("planning:")) {
        const day = key.slice("planning:".length);
        week.daily[`actual:${day}`] = JSON.parse(JSON.stringify(week.daily[key]));
      }
    });
  }

  /** Copy previous week's Planning job rows (job codes + crew) into this week's Planning. */
  function copyPlanningFromWeek(state, fromKey, toKey) {
    const from = state.weeks?.[fromKey];
    const rows = from ? from.planning.rows : [];
    getWeek(state, toKey).planning = { rows: deepCloneRows(rows) };
    return rows.length;
  }

  function dailyKey(mode, day) {
    return `${mode === "actual" ? "actual" : "planning"}:${day}`;
  }

  function getDailyMeta(week, mode, day) {
    const cur = week.daily?.[dailyKey(mode, day)];
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

  function setDailyMeta(week, mode, day, meta) {
    week.daily = week.daily || {};
    week.daily[dailyKey(mode, day)] = meta;
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
  function assignedOnDay(week, day, mode) {
    const board = mode === "actual" ? week.actual : week.planning;
    const set = new Set();
    (board.rows || []).forEach((row) => {
      (row.assignments[day] || []).forEach((n) => set.add(n));
    });
    return set;
  }

  function onLeave(week, day) {
    return new Set(week.leave?.[day] || []);
  }

  function coverageForDay(state, week, day, mode) {
    const assigned = assignedOnDay(week, day, mode);
    const leave = onLeave(week, day);
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

  /** Removes from roster, groups, and this/future weeks (past weeks keep their history). */
  function removeWorkerEverywhere(state, name) {
    state.workers = state.workers.filter((w) => w !== name);
    state.groups.forEach((g) => {
      g.members = g.members.filter((m) => m !== name);
    });
    const thisWeek = currentWeekKey();
    Object.entries(state.weeks || {}).forEach(([key, week]) => {
      if (key < thisWeek) return;
      DAYS.forEach((d) => {
        week.leave[d] = (week.leave[d] || []).filter((x) => x !== name);
      });
      ["planning", "actual"].forEach((board) => {
        (week[board].rows || []).forEach((row) => {
          DAYS.forEach((d) => {
            row.assignments[d] = (row.assignments[d] || []).filter((x) => x !== name);
          });
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
  function assignNamesToCell(week, row, day, names, opts = {}) {
    const rows = opts.rows || [];
    const added = [];
    const skippedLeave = [];
    const skippedConflict = [];
    const leaveSet = onLeave(week, day);

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

  function formatJadualText(week, weekKey, mode, day) {
    const meta = getDailyMeta(week, mode, day);
    const board = mode === "actual" ? week.actual : week.planning;
    const lines = [];
    const dayMs = DAY_LABELS_MS[day] || day.toUpperCase();
    const dateLabel = meta.dateLabel.trim() || formatShortDate(dayDate(weekKey, day));
    lines.push(`Jadual Kerja ${dayMs} ${dateLabel}`);
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

    const leave = week.leave?.[day] || [];
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

  // —— Weekly export (columns match Project Profit → Labour Update / labour_records) ——

  const LABOUR_COLUMNS = ["working_date", "remarks", "working_details", "job_code", "manday"];
  const LABOUR_LIMITS = { remarks: 3, working_details: 64, job_code: 7, manday: 5 };

  /**
   * groupBy "worker": one row per worker per job per day (manday 1, details = worker name)
   * groupBy "job":    one row per job per day (manday = headcount, details = worker names)
   * Cuti is not labour, so it is excluded.
   */
  function buildLabourRecords(week, weekKey, mode, groupBy) {
    const board = mode === "actual" ? week.actual : week.planning;
    const records = [];
    const warnings = [];
    let noJobCode = 0;
    const longJobCodes = new Set();
    let truncatedDetails = 0;

    DAYS.forEach((day) => {
      const workingDate = toISODate(dayDate(weekKey, day));
      (board.rows || []).forEach((row) => {
        const workers = row.assignments[day] || [];
        if (!workers.length) return;
        const jobCode = (row.jobCode || "").trim();
        if (!jobCode) noJobCode += 1;
        if (jobCode.length > LABOUR_LIMITS.job_code) longJobCodes.add(jobCode);

        if (groupBy === "job") {
          let details = workers.join(", ");
          if (details.length > LABOUR_LIMITS.working_details) {
            details = details.slice(0, LABOUR_LIMITS.working_details);
            truncatedDetails += 1;
          }
          records.push({
            working_date: workingDate,
            remarks: "",
            working_details: details,
            job_code: jobCode,
            manday: String(workers.length),
          });
        } else {
          workers.forEach((w) => {
            records.push({
              working_date: workingDate,
              remarks: "",
              working_details: w.slice(0, LABOUR_LIMITS.working_details),
              job_code: jobCode,
              manday: "1",
            });
          });
        }
      });
    });

    if (noJobCode) warnings.push(`${noJobCode} job/day entries have no Job Code.`);
    if (longJobCodes.size) {
      warnings.push(`Job Code longer than 7 chars (will be cut on import): ${[...longJobCodes].join(", ")}`);
    }
    if (truncatedDetails) {
      warnings.push(`${truncatedDetails} rows: worker names cut to 64 chars (working_details limit).`);
    }
    return { columns: LABOUR_COLUMNS.slice(), records, warnings };
  }

  function recordsToDelimited(columns, records, delimiter) {
    const escape = (v) => {
      const s = String(v ?? "");
      if (delimiter === "\t") return s.replace(/[\t\r\n]+/g, " ");
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.join(delimiter)];
    records.forEach((r) => lines.push(columns.map((c) => escape(r[c])).join(delimiter)));
    return lines.join("\r\n");
  }

  global.ScheduleStore = {
    DAYS,
    DAY_LABELS,
    DAY_LABELS_MS,
    STORAGE_KEY,
    createRow,
    loadState,
    saveState,
    toISODate,
    weekKeyOf,
    currentWeekKey,
    normalizeWeekKey,
    shiftWeek,
    dayDate,
    isoWeekNumber,
    formatShortDate,
    formatDayMonth,
    formatWeekRange,
    getWeek,
    clearWeek,
    isWeekEmpty,
    boardModeOf,
    getBoard,
    getRows,
    setBoardMode,
    copyPlanningToActual,
    copyPlanningFromWeek,
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
    buildLabourRecords,
    recordsToDelimited,
    emptyDayMap,
    deepCloneRows,
  };
})(typeof window !== "undefined" ? window : globalThis);
