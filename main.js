(() => {
  const S = window.ScheduleStore;
  if (!S) {
    console.error("ScheduleStore missing — load schedule-store.js first");
    return;
  }

  const { DAYS, DAY_LABELS } = S;
  const state = S.loadState();

  const addRowBtn = document.getElementById("add-row");
  const clearAllBtn = document.getElementById("clear-all");
  const workerNameInput = document.getElementById("worker-name");
  const addWorkerBtn = document.getElementById("add-worker");
  const workerList = document.getElementById("worker-list");
  const workerTotal = document.getElementById("worker-total");
  const tableBody = document.getElementById("table-body");
  const groupList = document.getElementById("group-list");
  const groupNameInput = document.getElementById("group-name");
  const createGroupBtn = document.getElementById("create-group");
  const coverageDay = document.getElementById("coverage-day");
  const coveragePanel = document.getElementById("coverage-panel");
  const modeTabs = document.querySelectorAll("[data-board-mode]");
  const copyToActualBtn = document.getElementById("copy-to-actual");
  const openDailyBtn = document.getElementById("open-daily");
  const printBoardBtn = document.getElementById("print-board");
  const boardModeLabel = document.getElementById("board-mode-label");
  const toolsSidebar = document.getElementById("tools-sidebar");
  const toolsSidebarToggle = document.getElementById("tools-sidebar-toggle");
  const toolsSidebarOpen = document.getElementById("tools-sidebar-open");

  const exportBtn = document.getElementById("export-btn");
  const exportModal = document.getElementById("export-modal");
  const exportText = document.getElementById("export-text");
  const exportCopy = document.getElementById("export-copy");
  const exportClose = document.getElementById("export-close");
  const exportDay = document.getElementById("export-day");
  const exportDate = document.getElementById("export-date");

  function persist() {
    S.saveState(state);
  }

  function rows() {
    return S.getRows(state);
  }

  function currentMode() {
    return state.ui?.boardMode === "actual" ? "actual" : "planning";
  }

  function refreshModeUI() {
    const mode = currentMode();
    modeTabs.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.boardMode === mode);
    });
    if (boardModeLabel) {
      boardModeLabel.textContent = mode === "actual" ? "Actual" : "Planning";
    }
    document.body.dataset.boardMode = mode;
    if (copyToActualBtn) {
      copyToActualBtn.hidden = mode === "actual";
    }
  }

  function setMode(mode) {
    S.setBoardMode(state, mode);
    persist();
    refreshModeUI();
    renderTable();
    renderCoverage();
  }

  // —— Export (simple TSV, unchanged spirit) ——
  if (exportBtn && exportModal && exportText && exportCopy && exportClose && exportDay && exportDate) {
    exportBtn.addEventListener("click", () => {
      const day = exportDay.value;
      const date = exportDate.value.trim();
      let output = `Jadual Kerja【${DAY_LABELS[day]}】${date ? " " + date : ""} [${currentMode()}]\n`;
      output += "Job Code\tWorker\n";
      rows().forEach((row) => {
        const workers = row.assignments[day] || [];
        if (workers.length === 0) return;
        workers.forEach((w) => {
          output += `${row.jobCode || "-"}\t${w}\n`;
        });
      });
      const leave = state.leave[day] || [];
      if (leave.length) {
        leave.forEach((w) => {
          output += `Cuti\t${w}\n`;
        });
      }
      exportText.value = output;
      exportModal.classList.remove("hidden");
    });
    exportClose.addEventListener("click", () => exportModal.classList.add("hidden"));
    exportCopy.addEventListener("click", () => {
      exportText.select();
      document.execCommand("copy");
      exportCopy.textContent = "Copied";
      setTimeout(() => (exportCopy.textContent = "Copy"), 1200);
    });
  }

  // —— Mode / copy / daily ——
  modeTabs.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.boardMode));
  });

  if (copyToActualBtn) {
    copyToActualBtn.addEventListener("click", () => {
      if (!confirm("Overwrite Actual with the current Planning board?")) return;
      S.copyPlanningToActual(state);
      persist();
      alert("Copied Planning → Actual");
      if (currentMode() === "actual") {
        renderTable();
        renderCoverage();
      }
    });
  }

  if (openDailyBtn) {
    openDailyBtn.addEventListener("click", () => {
      const day = (coverageDay && coverageDay.value) || (exportDay && exportDay.value) || "mon";
      const url = `schedule-day.html?day=${encodeURIComponent(day)}&mode=${encodeURIComponent(currentMode())}`;
      window.open(url, "scheduleDaily", "noopener,noreferrer");
    });
  }

  if (printBoardBtn) {
    printBoardBtn.addEventListener("click", () => {
      window.print();
    });
  }

  function syncToolsSidebarChrome() {
    if (!toolsSidebar) return;
    const collapsed = toolsSidebar.classList.contains("collapsed");
    document.body.classList.toggle("tools-sidebar-collapsed", collapsed);
    if (toolsSidebarToggle) {
      toolsSidebarToggle.textContent = collapsed ? "+" : "−";
    }
    if (toolsSidebarOpen) {
      toolsSidebarOpen.hidden = !collapsed;
    }
  }

  if (toolsSidebarToggle && toolsSidebar) {
    toolsSidebarToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toolsSidebar.classList.toggle("collapsed");
      syncToolsSidebarChrome();
    });
  }

  if (toolsSidebarOpen && toolsSidebar) {
    toolsSidebarOpen.addEventListener("click", () => {
      toolsSidebar.classList.remove("collapsed");
      syncToolsSidebarChrome();
    });
  }

  // Default: collapse tools on narrow screens so the weekly table is readable
  if (toolsSidebar && window.matchMedia("(max-width: 1050px)").matches) {
    toolsSidebar.classList.add("collapsed");
  }
  syncToolsSidebarChrome();

  // —— Workers ——
  addWorkerBtn.addEventListener("click", () => {
    const name = (workerNameInput.value || "").trim();
    if (!name) {
      alert("Type a worker name first");
      workerNameInput.focus();
      return;
    }
    if (state.workers.includes(name)) {
      alert("This worker already exists");
      return;
    }
    state.workers.push(name);
    workerNameInput.value = "";
    persist();
    renderWorkers();
    renderGroups();
    renderCoverage();
    workerNameInput.focus();
  });

  workerNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWorkerBtn.click();
    }
  });

  // —— Groups ——
  if (createGroupBtn) {
    createGroupBtn.addEventListener("click", () => {
      const name = (groupNameInput?.value || "").trim() || "Group";
      const selected = [...document.querySelectorAll(".worker-pick:checked")].map((el) => el.value);
      if (selected.length === 0) {
        alert("Tick workers first, then Create Group");
        return;
      }
      state.groups.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        members: selected,
      });
      if (groupNameInput) groupNameInput.value = "";
      document.querySelectorAll(".worker-pick").forEach((el) => {
        el.checked = false;
      });
      persist();
      renderGroups();
      renderWorkers();
    });
  }

  // —— Rows / clear ——
  addRowBtn.addEventListener("click", () => {
    rows().push(S.createRow(""));
    persist();
    renderTable();
  });

  clearAllBtn.addEventListener("click", () => {
    if (!confirm("Clear ALL data? (Planning, Actual, Groups, Cuti)")) return;
    state.workers = [];
    state.groups = [];
    state.leave = S.emptyDayMap(() => []);
    state.planning = { rows: [] };
    state.actual = { rows: [] };
    state.daily = {};
    persist();
    renderWorkers();
    renderGroups();
    renderTable();
    renderCoverage();
  });

  if (coverageDay) {
    coverageDay.addEventListener("change", () => {
      if (exportDay) exportDay.value = coverageDay.value;
      renderCoverage();
    });
  }
  if (exportDay && coverageDay) {
    exportDay.addEventListener("change", () => {
      coverageDay.value = exportDay.value;
      renderCoverage();
    });
  }

  function removeRow(rowId) {
    const board = S.getBoard(state);
    board.rows = board.rows.filter((r) => r.id !== rowId);
    persist();
    renderTable();
    renderCoverage();
  }

  function renderWorkers() {
    workerList.innerHTML = "";
    if (!state.workers.length) {
      const empty = document.createElement("li");
      empty.className = "worker-list-empty";
      empty.textContent = "No workers yet. Type a name in the box above, then Add.";
      workerList.appendChild(empty);
      workerTotal.textContent = "Total: 0";
      return;
    }
    state.workers.forEach((name) => {
      const li = document.createElement("li");
      li.className = "worker-item worker-draggable";
      li.draggable = true;

      const pick = document.createElement("input");
      pick.type = "checkbox";
      pick.className = "worker-pick";
      pick.value = name;
      pick.title = "Tick to include in Create Group";
      pick.addEventListener("click", (e) => e.stopPropagation());

      const span = document.createElement("span");
      span.className = "worker-name";
      span.textContent = name;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "worker-remove";
      del.textContent = "Del";
      del.addEventListener("click", () => {
        S.removeWorkerEverywhere(state, name);
        persist();
        renderWorkers();
        renderGroups();
        renderTable();
        renderCoverage();
      });

      li.addEventListener("dragstart", (e) => {
        S.setDragPayload(e.dataTransfer, { type: "worker", name });
      });

      li.appendChild(pick);
      li.appendChild(span);
      li.appendChild(del);
      workerList.appendChild(li);
    });
    workerTotal.textContent = `Total: ${state.workers.length}`;
  }

  function renderGroups() {
    if (!groupList) return;
    groupList.innerHTML = "";
    if (!state.groups.length) {
      const empty = document.createElement("li");
      empty.className = "group-empty";
      empty.textContent = "No groups yet (tick workers to create)";
      groupList.appendChild(empty);
      return;
    }
    state.groups.forEach((g) => {
      const li = document.createElement("li");
      li.className = "group-item worker-draggable";
      li.draggable = true;
      li.title = g.members.join(", ");

      const info = document.createElement("div");
      info.className = "group-info";
      const title = document.createElement("span");
      title.className = "group-name";
      title.textContent = g.name;
      const meta = document.createElement("span");
      meta.className = "group-meta";
      meta.textContent = `${g.members.length} pax`;
      info.appendChild(title);
      info.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "group-actions";

      const explodeBtn = document.createElement("button");
      explodeBtn.type = "button";
      explodeBtn.className = "group-explode";
      explodeBtn.textContent = "Explode";
      explodeBtn.title = "Dissolve group (workers stay in list)";
      explodeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        g.members.forEach((m) => {
          if (!state.workers.includes(m)) state.workers.push(m);
        });
        state.groups = state.groups.filter((x) => x.id !== g.id);
        persist();
        renderGroups();
        renderWorkers();
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "group-remove";
      delBtn.textContent = "Del";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.groups = state.groups.filter((x) => x.id !== g.id);
        persist();
        renderGroups();
      });

      actions.appendChild(explodeBtn);
      actions.appendChild(delBtn);

      li.addEventListener("dragstart", (e) => {
        S.setDragPayload(e.dataTransfer, {
          type: "group",
          groupId: g.id,
          members: g.members.slice(),
        });
      });

      li.appendChild(info);
      li.appendChild(actions);
      groupList.appendChild(li);
    });
  }

  function bindDroppable(dropArea, onNames) {
    dropArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      dropArea.classList.add("drag-over");
    });
    dropArea.addEventListener("dragleave", () => {
      dropArea.classList.remove("drag-over");
    });
    dropArea.addEventListener("drop", (e) => {
      e.preventDefault();
      dropArea.classList.remove("drag-over");
      const payload = S.parseDragPayload(e.dataTransfer);
      if (!payload) return;
      const names =
        payload.type === "group" ? payload.members : payload.name ? [payload.name] : [];
      onNames(names);
    });
  }

  function applyAssignResult(result, day) {
    const msgs = [];
    if (result.skippedLeave.length) {
      msgs.push(`On leave (Cuti): ${result.skippedLeave.join(", ")}`);
    }
    if (result.skippedConflict.length) {
      msgs.push(`Already assigned on ${DAY_LABELS[day]}: ${result.skippedConflict.join(", ")}`);
    }
    if (msgs.length) alert(msgs.join("\n"));
  }

  function renderTable() {
    tableBody.innerHTML = "";
    const boardRows = rows();

    boardRows.forEach((row) => {
      const tr = document.createElement("tr");

      const jobTd = document.createElement("td");
      jobTd.className = "col-job-cell";
      const jobInput = document.createElement("input");
      jobInput.type = "text";
      jobInput.className = "job-input";
      jobInput.placeholder = "Job Code";
      jobInput.autocomplete = "off";
      jobInput.spellcheck = false;
      jobInput.value = row.jobCode || "";
      const saveJobCode = () => {
        row.jobCode = jobInput.value.trim();
        persist();
      };
      jobInput.addEventListener("input", saveJobCode);
      jobInput.addEventListener("change", saveJobCode);
      jobInput.addEventListener("mousedown", (e) => e.stopPropagation());
      jobInput.addEventListener("click", (e) => e.stopPropagation());
      jobInput.addEventListener("keydown", (e) => e.stopPropagation());
      jobTd.appendChild(jobInput);
      tr.appendChild(jobTd);

      DAYS.forEach((day) => {
        const td = document.createElement("td");
        const dropArea = document.createElement("div");
        const assigned = row.assignments[day] || [];
        dropArea.className = assigned.length === 0 ? "droppable is-empty" : "droppable";

        const badges = document.createElement("div");
        badges.className = "cell-badges";
        assigned.forEach((w) => {
          badges.appendChild(
            createBadge(w, () => {
              row.assignments[day] = row.assignments[day].filter((x) => x !== w);
              persist();
              renderTable();
              renderCoverage();
            })
          );
        });

        const subtotal = document.createElement("div");
        subtotal.className = "cell-subtotal";
        subtotal.hidden = true;
        subtotal.textContent = `Count: ${assigned.length}`;

        dropArea.appendChild(badges);
        dropArea.appendChild(subtotal);

        bindDroppable(dropArea, (names) => {
          const result = S.assignNamesToCell(state, row, day, names, { rows: boardRows });
          if (result.added.length) {
            persist();
            renderTable();
            renderCoverage();
          }
          applyAssignResult(result, day);
        });

        td.appendChild(dropArea);
        tr.appendChild(td);
      });

      const actionsTd = document.createElement("td");
      actionsTd.className = "row-actions";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-row";
      removeBtn.textContent = "Delete";
      removeBtn.addEventListener("click", () => removeRow(row.id));
      actionsTd.appendChild(removeBtn);
      tr.appendChild(actionsTd);

      tableBody.appendChild(tr);
    });

    // Dedicated Cuti row (not a job)
    const cutiTr = document.createElement("tr");
    cutiTr.className = "cuti-row";

    const cutiLabelTd = document.createElement("td");
    cutiLabelTd.className = "col-job cuti-label";
    cutiLabelTd.innerHTML = '<strong>Cuti</strong><span class="cuti-hint">Leave</span>';
    cutiTr.appendChild(cutiLabelTd);

    DAYS.forEach((day) => {
      const td = document.createElement("td");
      const dropArea = document.createElement("div");
      const assigned = state.leave[day] || [];
      dropArea.className =
        assigned.length === 0 ? "droppable cuti-drop is-empty" : "droppable cuti-drop";

      const badges = document.createElement("div");
      badges.className = "cell-badges";
      assigned.forEach((w) => {
        badges.appendChild(
          createBadge(w, () => {
            state.leave[day] = state.leave[day].filter((x) => x !== w);
            persist();
            renderTable();
            renderCoverage();
          }, "badge-cuti")
        );
      });

      const subtotal = document.createElement("div");
      subtotal.className = "cell-subtotal";
      subtotal.hidden = true;
      subtotal.textContent = assigned.length ? `Leave: ${assigned.length}` : "";

      dropArea.appendChild(badges);
      dropArea.appendChild(subtotal);

      bindDroppable(dropArea, (names) => {
        let changed = false;
        names.forEach((name) => {
          const onJob = boardRows.some((r) => (r.assignments[day] || []).includes(name));
          if (onJob) {
            boardRows.forEach((r) => {
              r.assignments[day] = (r.assignments[day] || []).filter((x) => x !== name);
            });
            changed = true;
          }
          if (!(state.leave[day] || []).includes(name)) {
            state.leave[day].push(name);
            changed = true;
          }
        });
        if (changed) {
          persist();
          renderTable();
          renderCoverage();
        }
      });

      td.appendChild(dropArea);
      cutiTr.appendChild(td);
    });

    const cutiActions = document.createElement("td");
    cutiActions.className = "row-actions";
    cutiActions.innerHTML = '<span class="cuti-fixed">Fixed</span>';
    cutiTr.appendChild(cutiActions);
    tableBody.appendChild(cutiTr);
  }

  function createBadge(name, onRemove, extraClass) {
    const el = document.createElement("span");
    el.className = extraClass ? `badge ${extraClass}` : "badge";
    const text = document.createElement("span");
    text.textContent = name;
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "×";
    remove.addEventListener("click", onRemove);
    el.appendChild(text);
    el.appendChild(remove);
    return el;
  }

  function renderCoverage() {
    if (!coveragePanel) return;
    const day = coverageDay ? coverageDay.value : "mon";
    const c = S.coverageForDay(state, day, currentMode());
    coveragePanel.innerHTML = "";

    const summary = document.createElement("div");
    summary.className = "coverage-summary";
    summary.innerHTML =
      `<strong>${DAY_LABELS[day]}</strong> · ` +
      `Roster ${c.total} · Assigned ${c.assignedCount} · Cuti ${c.leaveCount} · ` +
      `<span class="coverage-gap">Unassigned ${c.unassignedCount}</span>`;
    coveragePanel.appendChild(summary);

    if (c.unassigned.length) {
      const list = document.createElement("div");
      list.className = "coverage-unassigned";
      const label = document.createElement("div");
      label.className = "coverage-label";
      label.textContent = "Still free:";
      list.appendChild(label);
      c.unassigned.forEach((name) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "coverage-chip";
        chip.textContent = name;
        chip.draggable = true;
        chip.title = "Drag to a cell, or click to copy name";
        chip.addEventListener("dragstart", (e) => {
          S.setDragPayload(e.dataTransfer, { type: "worker", name });
        });
        chip.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(name);
            chip.classList.add("copied");
            setTimeout(() => chip.classList.remove("copied"), 800);
          } catch {
            /* ignore */
          }
        });
        list.appendChild(chip);
      });
      coveragePanel.appendChild(list);
    } else if (c.total > 0) {
      const ok = document.createElement("div");
      ok.className = "coverage-ok";
      ok.textContent = "Everyone is assigned or on leave ✓";
      coveragePanel.appendChild(ok);
    }

    if (c.leave.length) {
      const leaveBox = document.createElement("div");
      leaveBox.className = "coverage-leave";
      leaveBox.textContent = `Cuti: ${c.leave.join(", ")}`;
      coveragePanel.appendChild(leaveBox);
    }
  }

  // Init
  refreshModeUI();
  renderWorkers();
  renderGroups();
  renderTable();
  renderCoverage();
})();
