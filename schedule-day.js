(() => {
  const S = window.ScheduleStore;
  if (!S) {
    console.error("ScheduleStore missing");
    return;
  }

  const params = new URLSearchParams(location.search);
  let mode = params.get("mode") === "actual" ? "actual" : "planning";
  let day = S.DAYS.includes(params.get("day")) ? params.get("day") : "mon";

  const state = S.loadState();

  const dayMode = document.getElementById("day-mode");
  const daySelect = document.getElementById("day-select");
  const metaDate = document.getElementById("meta-date");
  const metaPic = document.getElementById("meta-pic");
  const metaSupervisor = document.getElementById("meta-supervisor");
  const metaTime = document.getElementById("meta-time");
  const metaPreamble = document.getElementById("meta-preamble");
  const metaMaterials = document.getElementById("meta-materials");
  const jobsEditor = document.getElementById("jobs-editor");
  const jobsEmpty = document.getElementById("jobs-empty");
  const dayCoverage = document.getElementById("day-coverage");
  const dayCuti = document.getElementById("day-cuti");
  const previewText = document.getElementById("day-preview-text");

  dayMode.value = mode;
  daySelect.value = day;

  function persist() {
    S.saveState(state);
  }

  function syncUrl() {
    const url = new URL(location.href);
    url.searchParams.set("day", day);
    url.searchParams.set("mode", mode);
    history.replaceState(null, "", url);
  }

  function readMetaFromForm(existingJobs) {
    return {
      dateLabel: metaDate.value.trim(),
      timeNotes: metaTime.value,
      pic: metaPic.value.trim(),
      supervisor: metaSupervisor.value.trim(),
      preamble: metaPreamble.value.trim(),
      materials: metaMaterials.value,
      jobs: existingJobs || {},
    };
  }

  function collectJobsFromDom() {
    const jobs = {};
    jobsEditor.querySelectorAll("[data-row-id]").forEach((block) => {
      const id = block.dataset.rowId;
      const siteName = block.querySelector(".job-site")?.value.trim() || "";
      const description = block.querySelector(".job-desc")?.value.trim() || "";
      const workerNotes = {};
      block.querySelectorAll(".worker-note-input").forEach((inp) => {
        const n = inp.dataset.worker;
        const v = inp.value.trim();
        if (n && v) workerNotes[n] = v;
      });
      jobs[id] = { siteName, description, workerNotes };
    });
    return jobs;
  }

  function saveAll() {
    const meta = readMetaFromForm(collectJobsFromDom());
    S.setDailyMeta(state, mode, day, meta);
    persist();
    renderPreview();
  }

  function loadMetaToForm() {
    const meta = S.getDailyMeta(state, mode, day);
    metaDate.value = meta.dateLabel;
    metaPic.value = meta.pic;
    metaSupervisor.value = meta.supervisor;
    metaTime.value = meta.timeNotes;
    metaPreamble.value = meta.preamble;
    metaMaterials.value = meta.materials;
  }

  function boardRows() {
    return mode === "actual" ? state.actual.rows : state.planning.rows;
  }

  function renderJobs() {
    jobsEditor.innerHTML = "";
    const meta = S.getDailyMeta(state, mode, day);
    const active = boardRows().filter((r) => (r.assignments[day] || []).length > 0);

    if (!active.length) {
      jobsEmpty.classList.remove("hidden");
      return;
    }
    jobsEmpty.classList.add("hidden");

    active.forEach((row, index) => {
      const detail = S.getJobDetail(meta, row.id);
      const workers = row.assignments[day] || [];
      const block = document.createElement("article");
      block.className = "job-block";
      block.dataset.rowId = row.id;

      block.innerHTML = `
        <header class="job-block-head">
          <span class="job-index">${index + 1})</span>
          <span class="job-code-tag">${escapeHtml(row.jobCode || "(no Job Code)")}</span>
          <span class="job-count">${workers.length} pax</span>
        </header>
        <label>
          Site / title (e.g. Naka Engineering @ Ladang Pasir Logok)
          <input class="job-site" type="text" value="${escapeAttr(detail.siteName)}" />
        </label>
        <label>
          Work description (e.g. Plastic Piping)
          <input class="job-desc" type="text" value="${escapeAttr(detail.description)}" />
        </label>
        <div class="job-workers">
          <div class="job-workers-label">Workers (optional note, e.g. masuk Access 8 PAGI)</div>
          ${workers
            .map((w) => {
              const note = detail.workerNotes[w] || "";
              return `<div class="worker-note-row">
                <span class="worker-note-name">- ${escapeHtml(w)}</span>
                <input class="worker-note-input" data-worker="${escapeAttr(w)}" type="text" placeholder="Optional note" value="${escapeAttr(note)}" />
              </div>`;
            })
            .join("")}
        </div>
      `;
      jobsEditor.appendChild(block);
    });
  }

  function renderCoverage() {
    const c = S.coverageForDay(state, day, mode);
    dayCoverage.innerHTML =
      `<strong>Manpower check</strong><br>` +
      `Roster ${c.total} · Assigned ${c.assignedCount} · Cuti ${c.leaveCount} · Unassigned ${c.unassignedCount}` +
      (c.unassigned.length
        ? `<div class="day-unassigned">Unassigned: ${c.unassigned.map(escapeHtml).join(", ")}</div>`
        : `<div class="day-ok">All covered</div>`);

    const leave = state.leave[day] || [];
    dayCuti.innerHTML = leave.length
      ? `<strong>Cuti</strong><ul>${leave.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
      : `<strong>Cuti</strong><p class="muted">No one on leave</p>`;
  }

  function renderPreview() {
    // Use in-memory form values without requiring save first
    const meta = readMetaFromForm(collectJobsFromDom());
    S.setDailyMeta(state, mode, day, meta);
    previewText.textContent = S.formatJadualText(state, mode, day);
  }

  function fullRender() {
    loadMetaToForm();
    renderJobs();
    renderCoverage();
    renderPreview();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s);
  }

  dayMode.addEventListener("change", () => {
    saveAll();
    mode = dayMode.value === "actual" ? "actual" : "planning";
    syncUrl();
    fullRender();
  });

  daySelect.addEventListener("change", () => {
    saveAll();
    day = daySelect.value;
    syncUrl();
    fullRender();
  });

  document.getElementById("day-save").addEventListener("click", () => {
    saveAll();
    const btn = document.getElementById("day-save");
    btn.textContent = "Saved";
    setTimeout(() => (btn.textContent = "Save"), 1000);
  });

  document.getElementById("day-export").addEventListener("click", async () => {
    saveAll();
    const text = S.formatJadualText(state, mode, day);
    previewText.textContent = text;
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById("day-export");
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy Jadual Text"), 1200);
    } catch {
      prompt("Copy this text:", text);
    }
  });

  document.getElementById("day-refresh-preview").addEventListener("click", () => {
    renderPreview();
  });

  document.getElementById("day-back").addEventListener("click", () => {
    saveAll();
    location.href = "schedule-board.html";
  });

  // Autosave on blur within meta / jobs
  document.querySelector(".day-layout").addEventListener(
    "change",
    () => {
      saveAll();
    },
    true
  );

  fullRender();
})();
