(() => {
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

  const STORAGE_KEY = "schedule_app_state_v2";

  /**
   * State shape:
   * {
   *   workers: string[],
   *   rows: Array<{
   *     id: string,
   *     jobCode: string,
   *     assignments: Record<Day, string[]> // 多人
   *   }>
   * }
   */
  const state = loadState();

  // Elements
  const addRowBtn = document.getElementById("add-row");
  const clearAllBtn = document.getElementById("clear-all");
  const workerNameInput = document.getElementById("worker-name");
  const addWorkerBtn = document.getElementById("add-worker");
  const workerList = document.getElementById("worker-list");
  const workerTotal = document.getElementById("worker-total");
  const tableBody = document.getElementById("table-body");

  // ========== 导出文本功能 ========== //
  const exportBtn = document.getElementById("export-btn");
  const exportModal = document.getElementById("export-modal");
  const exportText = document.getElementById("export-text");
  const exportCopy = document.getElementById("export-copy");
  const exportClose = document.getElementById("export-close");
  const exportDay = document.getElementById("export-day");
  const exportDate = document.getElementById("export-date");

  if (exportBtn && exportModal && exportText && exportCopy && exportClose && exportDay && exportDate) {
    exportBtn.addEventListener("click", () => {
      // 生成导出文本
      const day = exportDay.value;
      const date = exportDate.value.trim();
      let output = `Jadual Kerja【${DAY_LABELS[day]}】${date ? " " + date : ""}\n`;
      output += "Job Code\tWorker\n";
      state.rows.forEach(row => {
        const workers = row.assignments[day] || [];
        if (workers.length === 0) return;
        workers.forEach(w => {
          output += `${row.jobCode || "-"}\t${w}\n`;
        });
      });
      exportText.value = output;
      exportModal.classList.remove("hidden");
    });
    exportClose.addEventListener("click", () => {
      exportModal.classList.add("hidden");
    });
    exportCopy.addEventListener("click", () => {
      exportText.select();
      document.execCommand("copy");
      exportCopy.textContent = "已复制";
      setTimeout(() => (exportCopy.textContent = "复制"), 1200);
    });
  }

  // Init
  renderWorkers();
  renderTable();

  // Event bindings
  addRowBtn.addEventListener("click", () => {
    addRow("");
  });

  clearAllBtn.addEventListener("click", () => {
    if (!confirm("确定清空所有数据？")) return;
    state.workers = [];
    state.rows = [];
    persist();
    renderWorkers();
    renderTable();
  });

  addWorkerBtn.addEventListener("click", () => {
    const name = (workerNameInput.value || "").trim();
    if (!name) return;
    if (state.workers.includes(name)) {
      alert("该 worker 已存在");
      return;
    }
    state.workers.push(name);
    workerNameInput.value = "";
    persist();
    renderWorkers();
    renderTable();
  });

  // Enter 键添加 worker
  workerNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWorkerBtn.click();
    }
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaultState();
      parsed.workers = Array.isArray(parsed.workers) ? parsed.workers : [];
      parsed.rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      return parsed;
    } catch {
      return defaultState();
    }
  }

  function defaultState() {
    return {
      workers: ["Alice", "Bob", "Charlie"],
      rows: [
        createRow("JOB-001"),
        createRow("JOB-002"),
      ],
    };
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function createRow(jobCode = "") {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const assignments = {};
    DAYS.forEach((d) => (assignments[d] = []));
    return { id, jobCode, assignments };
  }

  function addRow(jobCode) {
    state.rows.push(createRow(jobCode));
    persist();
    renderTable();
  }

  function removeRow(rowId) {
    state.rows = state.rows.filter((r) => r.id !== rowId);
    persist();
    renderTable();
  }

  function renderWorkers() {
    workerList.innerHTML = "";
    state.workers.forEach((name) => {
      const li = document.createElement("li");
      li.className = "worker-item worker-draggable";
      li.draggable = true;
      const span = document.createElement("span");
      span.className = "worker-name";
      span.textContent = name;
      const del = document.createElement("button");
      del.className = "worker-remove";
      del.textContent = "删除";
      del.addEventListener("click", () => {
        // 删除 worker 同时清理表格中引用
        state.workers = state.workers.filter((w) => w !== name);
        state.rows.forEach((row) => {
          DAYS.forEach((d) => {
            if (row.assignments[d].includes(name)) {
              row.assignments[d] = row.assignments[d].filter((x) => x !== name);
            }
          });
        });
        persist();
        renderWorkers();
        renderTable();
      });
      // drag start
      li.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", name);
        e.dataTransfer.effectAllowed = "copy";
      });
      li.appendChild(span);
      li.appendChild(del);
      workerList.appendChild(li);
    });
    workerTotal.textContent = `总数：${state.workers.length}`;
  }

  function renderTable() {
    tableBody.innerHTML = "";
    state.rows.forEach((row) => {
      const tr = document.createElement("tr");

      // job code cell
      const jobTd = document.createElement("td");
      const jobInput = document.createElement("input");
      jobInput.className = "job-input";
      jobInput.placeholder = "输入 Job Code";
      jobInput.value = row.jobCode;
      jobInput.addEventListener("change", () => {
        row.jobCode = jobInput.value.trim();
        persist();
      });
      jobTd.appendChild(jobInput);
      tr.appendChild(jobTd);

      // day cells
      DAYS.forEach((day) => {
        const td = document.createElement("td");
        const dropArea = document.createElement("div");
        dropArea.className = "droppable";

        // badges
        const badges = document.createElement("div");
        badges.className = "cell-badges";
        row.assignments[day].forEach((w) => {
          badges.appendChild(createBadge(w, () => {
            row.assignments[day] = row.assignments[day].filter((x) => x !== w);
            persist();
            renderTable();
          }));
        });

        // subtotal
        const subtotal = document.createElement("div");
        subtotal.className = "cell-subtotal";
        subtotal.textContent = `小计：${row.assignments[day].length}`;

        dropArea.appendChild(badges);
        dropArea.appendChild(subtotal);

        // DnD events
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
          const name = e.dataTransfer.getData("text/plain");
          if (!name) return;
          // 同一列不可重复：检查其他行是否已有该 name
          const conflict = state.rows.some(
            (r) => r.id !== row.id && r.assignments[day].includes(name)
          );
          if (conflict) {
            alert(`${DAY_LABELS[day]} 列中已存在该 worker`);
            return;
          }
          // 当前单元格中避免重复
          if (!row.assignments[day].includes(name)) {
            row.assignments[day].push(name);
            persist();
            renderTable();
          }
        });

        td.appendChild(dropArea);
        tr.appendChild(td);
      });

      // row actions
      const actionsTd = document.createElement("td");
      actionsTd.className = "row-actions";
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-row";
      removeBtn.textContent = "删除行";
      removeBtn.addEventListener("click", () => removeRow(row.id));
      actionsTd.appendChild(removeBtn);
      tr.appendChild(actionsTd);

      tableBody.appendChild(tr);
    });
  }

  function createBadge(name, onRemove) {
    const el = document.createElement("span");
    el.className = "badge";
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

  // 已删除 Job 详情表相关功能
})();


