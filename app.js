/* =========================================================
   人生清單 ‧ 待辦事項 — 純前端版（無需建置工具）
   資料透過 Firebase Firestore 即時同步，多人共同編輯。

   資料結構：
   - users/{uid}/lifeGoals/{id}   人生清單項目（長期目標，沒有強制期限）
   - users/{uid}/todos/{id}       待辦事項（有到期日、優先度、可設定重複）
   ========================================================= */

const LIFE_CATEGORIES = ["旅行探索", "學習成長", "職涯成就", "健康體能", "人際關係", "財務目標", "體驗清單", "其他"];
const TODO_CATEGORIES = ["工作", "生活", "家庭", "購物", "其他"];
const PRIORITY_ORDER = { "高": 0, "中": 1, "低": 2 };
const RECURRING_LABEL = { none: "", daily: "🔁 每天", weekly: "🔁 每週", monthly: "🔁 每月" };

// 閒置多久（分鐘）沒有操作就自動登出，需要重新輸入信箱密碼；設成 0 表示停用這個機制。
const IDLE_TIMEOUT_MINUTES = 60;

// ---- Firebase 初始化 ----
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// 登入後才會設定，指向該帳號底下的資料集合
let lifeGoalsRef = null;
let todosRef = null;
let unsubscribeLife = null;
let unsubscribeTodo = null;

// ---- 全域狀態 ----
const state = {
  lifeGoals: [],
  todos: [],
  tab: "life",
  editingLifeId: null,
  editingTodoId: null,
  lifeSearch: "",
  lifeCategory: "全部",
  lifeStatus: "all",
  todoSearch: "",
  todoCategory: "全部",
  todoStatus: "all",
};

// ---- 小工具 ----
const todayStr = () => new Date().toISOString().slice(0, 10);

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${y}/${m}/${day}`;
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function fillSelect(el, options) {
  el.innerHTML = options.map((o) => `<option value="${o}">${o}</option>`).join("");
}
function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMonths(dateStr, months) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function nextDueDate(fromDate, recurring) {
  if (recurring === "daily") return addDays(fromDate, 1);
  if (recurring === "weekly") return addDays(fromDate, 7);
  if (recurring === "monthly") return addMonths(fromDate, 1);
  return fromDate;
}
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

document.addEventListener("DOMContentLoaded", () => {
  fillSelect(document.getElementById("lf-category"), LIFE_CATEGORIES);
  fillSelect(document.getElementById("tf-category"), TODO_CATEGORIES);

  setupTabs();
  setupLifeForm();
  setupTodoForm();
  setupPriorityButtons();
  setupRecurringButtons();
  setupLifeFilters();
  setupTodoFilters();
  setupAuthGate();
  setupIdleTimeout();
});

// ---- 閒置自動登出 ----
const IDLE_STORAGE_KEY = "lifelist-last-activity";

function recordActivity() {
  try { localStorage.setItem(IDLE_STORAGE_KEY, String(Date.now())); } catch (e) { /* 忽略無法寫入的情況 */ }
}
function checkIdleTimeout() {
  if (!IDLE_TIMEOUT_MINUTES || IDLE_TIMEOUT_MINUTES <= 0) return;
  if (!auth.currentUser) return;
  let last;
  try {
    last = Number(localStorage.getItem(IDLE_STORAGE_KEY)) || Date.now();
  } catch (e) {
    last = Date.now();
  }
  if (Date.now() - last > IDLE_TIMEOUT_MINUTES * 60 * 1000) auth.signOut();
}
function setupIdleTimeout() {
  ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach((evt) => {
    document.addEventListener(evt, recordActivity, { passive: true });
  });
  recordActivity();
  checkIdleTimeout();
  setInterval(checkIdleTimeout, 60 * 1000);
}

// ---- 登入流程（信箱＋密碼） ----
function setupAuthGate() {
  const form = document.getElementById("auth-gate-form");
  const emailInput = document.getElementById("auth-email-input");
  const passwordInput = document.getElementById("auth-password-input");
  const errorMsg = document.getElementById("auth-gate-error");
  const loginBtn = document.getElementById("login-btn");

  function showError(err) {
    const map = {
      "auth/invalid-email": "信箱格式不正確。",
      "auth/user-not-found": "找不到這個帳號，請確認信箱是否正確，或聯絡管理者確認帳號是否已建立。",
      "auth/wrong-password": "密碼不正確。",
      "auth/invalid-credential": "信箱或密碼不正確。",
      "auth/weak-password": "密碼至少需要 6 碼。",
    };
    errorMsg.textContent = map[err.code] || `發生錯誤：${err.message}`;
    errorMsg.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMsg.hidden = true;
    loginBtn.disabled = true;
    try {
      await auth.signInWithEmailAndPassword(emailInput.value.trim(), passwordInput.value);
    } catch (err) {
      showError(err);
    } finally {
      loginBtn.disabled = false;
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    if (!confirm("確定要登出嗎？")) return;
    auth.signOut();
  });

  auth.onAuthStateChanged((user) => {
    if (user) {
      enterApp(user);
    } else {
      if (unsubscribeLife) unsubscribeLife();
      if (unsubscribeTodo) unsubscribeTodo();
      lifeGoalsRef = null;
      todosRef = null;
      document.getElementById("auth-gate").style.display = "flex";
      document.getElementById("app-root").hidden = true;
    }
  });
}

function enterApp(user) {
  recordActivity();
  lifeGoalsRef = db.collection("users").doc(user.uid).collection("lifeGoals");
  todosRef = db.collection("users").doc(user.uid).collection("todos");
  document.getElementById("user-badge").textContent = user.email;
  document.getElementById("auth-gate").style.display = "none";
  document.getElementById("app-root").hidden = false;

  if (unsubscribeLife) unsubscribeLife();
  if (unsubscribeTodo) unsubscribeTodo();
  subscribeLife();
  subscribeTodo();
}

// ---- 分頁切換 ----
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("tab-life").hidden = state.tab !== "life";
      document.getElementById("tab-todo").hidden = state.tab !== "todo";
    });
  });
}

// ---- Firestore 即時訂閱 ----
function subscribeLife() {
  unsubscribeLife = lifeGoalsRef.onSnapshot(
    (snapshot) => {
      state.lifeGoals = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderLife();
    },
    (err) => {
      console.error("人生清單讀取失敗：", err);
      document.getElementById("life-list").innerHTML =
        `<div class="empty-state"><p>資料庫連線失敗，請確認 firebase-config.js 是否已填入正確設定，以及 Firestore 安全性規則是否允許存取 users/{你的帳號}/lifeGoals。</p></div>`;
    }
  );
}
function subscribeTodo() {
  unsubscribeTodo = todosRef.onSnapshot(
    (snapshot) => {
      state.todos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderTodo();
    },
    (err) => {
      console.error("待辦事項讀取失敗：", err);
      document.getElementById("todo-list").innerHTML =
        `<div class="empty-state"><p>資料庫連線失敗，請確認 firebase-config.js 是否已填入正確設定，以及 Firestore 安全性規則是否允許存取 users/{你的帳號}/todos。</p></div>`;
    }
  );
}

// =========================================================
// 人生清單
// =========================================================

function setupLifeForm() {
  const form = document.getElementById("life-form");
  document.getElementById("life-cancel-edit").addEventListener("click", resetLifeForm);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("lf-title").value.trim();
    if (!title) { alert("請填寫想做的事。"); return; }
    const yearVal = document.getElementById("lf-year").value;
    const payload = {
      title,
      category: document.getElementById("lf-category").value,
      targetYear: yearVal === "" ? null : Number(yearVal),
      note: document.getElementById("lf-note").value.trim(),
    };

    const submitBtn = document.getElementById("life-submit-btn");
    submitBtn.disabled = true;
    try {
      if (state.editingLifeId) {
        await lifeGoalsRef.doc(state.editingLifeId).update(payload);
      } else {
        await lifeGoalsRef.add({
          ...payload,
          favorite: false,
          completed: false,
          completedDate: null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: auth.currentUser ? auth.currentUser.email : "",
        });
      }
      resetLifeForm();
    } catch (err) {
      console.error("儲存失敗：", err);
      alert("儲存失敗，請確認網路連線或 Firebase 設定。");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function resetLifeForm() {
  state.editingLifeId = null;
  document.getElementById("life-form").reset();
  document.getElementById("life-form-title").textContent = "新增人生清單項目";
  document.getElementById("life-cancel-edit").style.display = "none";
  document.getElementById("life-submit-btn").innerHTML = "➕ 加入清單";
}

function startEditLife(goal) {
  state.editingLifeId = goal.id;
  document.getElementById("lf-title").value = goal.title;
  document.getElementById("lf-category").value = goal.category;
  document.getElementById("lf-year").value = goal.targetYear ?? "";
  document.getElementById("lf-note").value = goal.note || "";
  document.getElementById("life-form-title").textContent = "編輯人生清單項目";
  document.getElementById("life-cancel-edit").style.display = "inline-flex";
  document.getElementById("life-submit-btn").innerHTML = "✏️ 儲存修改";
  document.getElementById("life-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function toggleLifeComplete(goal) {
  const completed = !goal.completed;
  await lifeGoalsRef.doc(goal.id).update({
    completed,
    completedDate: completed ? todayStr() : null,
  });
  if (completed) showToast(`🎉 太棒了！已達成「${goal.title}」`);
}
async function toggleLifeFavorite(goal) {
  await lifeGoalsRef.doc(goal.id).update({ favorite: !goal.favorite });
}
async function deleteLife(id) {
  if (!confirm("確定要刪除這個人生清單項目嗎？")) return;
  await lifeGoalsRef.doc(id).delete();
  if (state.editingLifeId === id) resetLifeForm();
}

function setupLifeFilters() {
  const catContainer = document.getElementById("life-category-buttons");
  catContainer.innerHTML = ["全部", ...LIFE_CATEGORIES].map((c) =>
    `<button type="button" class="status-filter-btn" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join("");
  catContainer.querySelectorAll("[data-category]").forEach((btn) => {
    btn.addEventListener("click", () => { state.lifeCategory = btn.dataset.category; renderLife(); });
  });

  document.querySelectorAll("#life-status-filter .status-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lifeStatus = btn.dataset.status;
      document.querySelectorAll("#life-status-filter .status-filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderLife();
    });
  });

  const searchInput = document.getElementById("life-search");
  const searchClear = document.getElementById("life-search-clear");
  searchInput.addEventListener("input", (e) => {
    state.lifeSearch = e.target.value;
    searchClear.hidden = e.target.value.length === 0;
    renderLife();
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.hidden = true;
    searchInput.focus();
    state.lifeSearch = "";
    renderLife();
  });
}

function updateLifeFilterActiveStates() {
  document.querySelectorAll("#life-category-buttons [data-category]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === state.lifeCategory);
  });
}

function filterLifeList() {
  let out = [...state.lifeGoals];
  if (state.lifeCategory !== "全部") out = out.filter((g) => g.category === state.lifeCategory);
  if (state.lifeStatus === "active") out = out.filter((g) => !g.completed);
  if (state.lifeStatus === "done") out = out.filter((g) => g.completed);
  if (state.lifeSearch.trim()) {
    const q = state.lifeSearch.trim().toLowerCase();
    out = out.filter((g) => (g.title || "").toLowerCase().includes(q));
  }
  out.sort((a, b) => {
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
    if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
    const ay = a.targetYear ?? 9999, by = b.targetYear ?? 9999;
    if (ay !== by) return ay - by;
    return 0;
  });
  return out;
}

function renderLifeStats() {
  const total = state.lifeGoals.length;
  const done = state.lifeGoals.filter((g) => g.completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("life-stats").innerHTML = `
    <div class="stat-card"><span class="num mono">${total}</span><span class="label">🌱 總數</span></div>
    <div class="stat-card stat-done"><span class="num mono">${done}</span><span class="label">🏁 已達成</span></div>
    <div class="stat-card stat-active"><span class="num mono">${total - done}</span><span class="label">🚶 進行中</span></div>
    <div class="stat-progress">
      <div class="stat-progress-bar"><div class="stat-progress-fill" style="width:${pct}%"></div></div>
      <span class="stat-progress-label mono">${pct}%</span>
    </div>
  `;
}

function renderLife() {
  updateLifeFilterActiveStates();
  renderLifeStats();
  const list = filterLifeList();
  const container = document.getElementById("life-list");

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>${state.lifeGoals.length === 0 ? "清單還是空的，寫下第一件想做的事吧。" : "找不到符合條件的項目。"}</p></div>`;
    return;
  }

  container.innerHTML = list.map((g) => {
    const yearBadge = g.targetYear ? `<span class="tag-pill year-pill">🎯 ${g.targetYear}</span>` : "";
    return `
      <div class="item-card ${g.completed ? "is-done" : ""}">
        <button type="button" class="check-circle ${g.completed ? "checked" : ""}" data-action="toggle" data-id="${g.id}" aria-label="切換完成狀態">
          ${g.completed ? "✓" : ""}
        </button>
        <div class="item-main">
          <div class="item-title-row">
            <span class="item-title ${g.completed ? "strike" : ""}">${escapeHtml(g.title)}</span>
            <button type="button" class="star-btn ${g.favorite ? "active" : ""}" data-action="favorite" data-id="${g.id}" aria-label="收藏">${g.favorite ? "⭐" : "☆"}</button>
          </div>
          <div class="item-badges">
            <span class="tag-pill cat-pill">${escapeHtml(g.category)}</span>
            ${yearBadge}
            ${g.completed ? `<span class="tag-pill done-pill">🏁 ${fmtDate(g.completedDate)} 達成</span>` : ""}
          </div>
          ${g.note ? `<div class="item-note">${escapeHtml(g.note)}</div>` : ""}
        </div>
        <div class="item-actions">
          <button class="icon-btn" data-action="edit" data-id="${g.id}" aria-label="修改">✏️</button>
          <button class="icon-btn icon-btn-danger" data-action="delete" data-id="${g.id}" aria-label="刪除">🗑️</button>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const goal = state.lifeGoals.find((g) => g.id === btn.dataset.id);
      if (!goal) return;
      const action = btn.dataset.action;
      if (action === "toggle") toggleLifeComplete(goal);
      if (action === "favorite") toggleLifeFavorite(goal);
      if (action === "edit") startEditLife(goal);
      if (action === "delete") deleteLife(goal.id);
    });
  });
}

// =========================================================
// 待辦事項
// =========================================================

function setupPriorityButtons() {
  document.querySelectorAll("#tf-priority-buttons .priority-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#tf-priority-buttons .priority-btn").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
}
function setupRecurringButtons() {
  document.querySelectorAll("#tf-recurring-buttons .recurring-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#tf-recurring-buttons .recurring-btn").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
}
function getSelectedPriority() {
  const btn = document.querySelector("#tf-priority-buttons .priority-btn.active");
  return btn ? btn.dataset.priority : "中";
}
function setSelectedPriority(p) {
  document.querySelectorAll("#tf-priority-buttons .priority-btn").forEach((b) => b.classList.toggle("active", b.dataset.priority === (p || "中")));
}
function getSelectedRecurring() {
  const btn = document.querySelector("#tf-recurring-buttons .recurring-btn.active");
  return btn ? btn.dataset.recurring : "none";
}
function setSelectedRecurring(r) {
  document.querySelectorAll("#tf-recurring-buttons .recurring-btn").forEach((b) => b.classList.toggle("active", b.dataset.recurring === (r || "none")));
}

function setupTodoForm() {
  const form = document.getElementById("todo-form");
  document.getElementById("todo-cancel-edit").addEventListener("click", resetTodoForm);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("tf-title").value.trim();
    if (!title) { alert("請填寫待辦事項內容。"); return; }
    const payload = {
      title,
      category: document.getElementById("tf-category").value,
      dueDate: document.getElementById("tf-dueDate").value || null,
      priority: getSelectedPriority(),
      recurring: getSelectedRecurring(),
      assignee: document.getElementById("tf-assignee").value.trim(),
      note: document.getElementById("tf-note").value.trim(),
    };

    const submitBtn = document.getElementById("todo-submit-btn");
    submitBtn.disabled = true;
    try {
      if (state.editingTodoId) {
        await todosRef.doc(state.editingTodoId).update(payload);
      } else {
        await todosRef.add({
          ...payload,
          completed: false,
          completedDate: null,
          lastCompletedDate: null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: auth.currentUser ? auth.currentUser.email : "",
        });
      }
      resetTodoForm();
    } catch (err) {
      console.error("儲存失敗：", err);
      alert("儲存失敗，請確認網路連線或 Firebase 設定。");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function resetTodoForm() {
  state.editingTodoId = null;
  document.getElementById("todo-form").reset();
  setSelectedPriority("中");
  setSelectedRecurring("none");
  document.getElementById("todo-form-title").textContent = "新增待辦事項";
  document.getElementById("todo-cancel-edit").style.display = "none";
  document.getElementById("todo-submit-btn").innerHTML = "➕ 新增待辦";
}

function startEditTodo(todo) {
  state.editingTodoId = todo.id;
  document.getElementById("tf-title").value = todo.title;
  document.getElementById("tf-category").value = todo.category;
  document.getElementById("tf-dueDate").value = todo.dueDate || "";
  setSelectedPriority(todo.priority);
  setSelectedRecurring(todo.recurring || "none");
  document.getElementById("tf-assignee").value = todo.assignee || "";
  document.getElementById("tf-note").value = todo.note || "";
  document.getElementById("todo-form-title").textContent = "編輯待辦事項";
  document.getElementById("todo-cancel-edit").style.display = "inline-flex";
  document.getElementById("todo-submit-btn").innerHTML = "✏️ 儲存修改";
  document.getElementById("todo-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function toggleTodoComplete(todo) {
  if (!todo.completed) {
    if (todo.recurring && todo.recurring !== "none") {
      const next = nextDueDate(todo.dueDate || todayStr(), todo.recurring);
      await todosRef.doc(todo.id).update({
        completed: false,
        lastCompletedDate: todayStr(),
        dueDate: next,
      });
      showToast(`✅ 已完成「${todo.title}」，下次到期：${fmtDate(next)}`);
    } else {
      await todosRef.doc(todo.id).update({ completed: true, completedDate: todayStr() });
      showToast(`✅ 已完成「${todo.title}」`);
    }
  } else {
    await todosRef.doc(todo.id).update({ completed: false, completedDate: null });
  }
}
async function deleteTodo(id) {
  if (!confirm("確定要刪除這筆待辦事項嗎？")) return;
  await todosRef.doc(id).delete();
  if (state.editingTodoId === id) resetTodoForm();
}

function setupTodoFilters() {
  const catContainer = document.getElementById("todo-category-buttons");
  catContainer.innerHTML = ["全部", ...TODO_CATEGORIES].map((c) =>
    `<button type="button" class="status-filter-btn" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join("");
  catContainer.querySelectorAll("[data-category]").forEach((btn) => {
    btn.addEventListener("click", () => { state.todoCategory = btn.dataset.category; renderTodo(); });
  });

  document.querySelectorAll("#todo-status-filter .status-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.todoStatus = btn.dataset.status;
      document.querySelectorAll("#todo-status-filter .status-filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderTodo();
    });
  });

  const searchInput = document.getElementById("todo-search");
  const searchClear = document.getElementById("todo-search-clear");
  searchInput.addEventListener("input", (e) => {
    state.todoSearch = e.target.value;
    searchClear.hidden = e.target.value.length === 0;
    renderTodo();
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.hidden = true;
    searchInput.focus();
    state.todoSearch = "";
    renderTodo();
  });
}

function updateTodoFilterActiveStates() {
  document.querySelectorAll("#todo-category-buttons [data-category]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === state.todoCategory);
  });
}

function isOverdue(t) {
  return !t.completed && t.dueDate && t.dueDate < todayStr();
}
function isDueSoon(t) {
  if (!t.dueDate || t.completed) return false;
  const diffDays = Math.round((new Date(t.dueDate) - new Date(todayStr())) / 86400000);
  return diffDays >= 0 && diffDays <= 2;
}

function filterTodoList() {
  let out = [...state.todos];
  if (state.todoCategory !== "全部") out = out.filter((t) => t.category === state.todoCategory);
  if (state.todoStatus === "pending") out = out.filter((t) => !t.completed);
  if (state.todoStatus === "overdue") out = out.filter((t) => isOverdue(t));
  if (state.todoStatus === "done") out = out.filter((t) => t.completed);
  if (state.todoSearch.trim()) {
    const q = state.todoSearch.trim().toLowerCase();
    out = out.filter((t) => (t.title || "").toLowerCase().includes(q));
  }
  out.sort((a, b) => {
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
    const aOver = isOverdue(a), bOver = isOverdue(b);
    if (aOver !== bOver) return aOver ? -1 : 1;
    const ad = a.dueDate || "9999-99-99", bd = b.dueDate || "9999-99-99";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
  });
  return out;
}

function renderTodoStats() {
  const total = state.todos.length;
  const done = state.todos.filter((t) => t.completed).length;
  const overdue = state.todos.filter((t) => isOverdue(t)).length;
  const pending = total - done;
  document.getElementById("todo-stats").innerHTML = `
    <div class="stat-card"><span class="num mono">${total}</span><span class="label">📋 總數</span></div>
    <div class="stat-card stat-active"><span class="num mono">${pending}</span><span class="label">🕓 待完成</span></div>
    <div class="stat-card stat-overdue"><span class="num mono">${overdue}</span><span class="label">⚠️ 已逾期</span></div>
    <div class="stat-card stat-done"><span class="num mono">${done}</span><span class="label">✅ 已完成</span></div>
  `;
}

function renderTodo() {
  updateTodoFilterActiveStates();
  renderTodoStats();
  const list = filterTodoList();
  const container = document.getElementById("todo-list");

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>${state.todos.length === 0 ? "目前沒有待辦事項，新增第一筆吧。" : "找不到符合條件的待辦事項。"}</p></div>`;
    return;
  }

  container.innerHTML = list.map((t) => {
    const overdue = isOverdue(t);
    const dueSoon = isDueSoon(t);
    let dueBadge = "";
    if (t.dueDate) {
      const cls = overdue ? "due-overdue" : dueSoon ? "due-soon" : "due-ok";
      const label = overdue ? "⚠️ 已逾期 " : "📅 ";
      dueBadge = `<span class="tag-pill ${cls}">${label}${fmtDate(t.dueDate)}</span>`;
    }
    const recurringBadge = t.recurring && t.recurring !== "none" ? `<span class="tag-pill recurring-pill">${RECURRING_LABEL[t.recurring]}</span>` : "";
    const priorityCls = t.priority === "高" ? "priority-high" : t.priority === "低" ? "priority-low" : "priority-mid";
    const priorityDot = t.priority === "高" ? "🔴" : t.priority === "低" ? "🟢" : "🟡";
    return `
      <div class="item-card ${t.completed ? "is-done" : ""} ${overdue ? "is-overdue" : ""}">
        <button type="button" class="check-circle ${t.completed ? "checked" : ""}" data-action="toggle" data-id="${t.id}" aria-label="切換完成狀態">
          ${t.completed ? "✓" : ""}
        </button>
        <div class="item-main">
          <div class="item-title-row">
            <span class="item-title ${t.completed ? "strike" : ""}">${escapeHtml(t.title)}</span>
          </div>
          <div class="item-badges">
            <span class="tag-pill ${priorityCls}">${priorityDot} ${escapeHtml(t.priority)}</span>
            <span class="tag-pill cat-pill">${escapeHtml(t.category)}</span>
            ${dueBadge}
            ${recurringBadge}
            ${t.assignee ? `<span class="tag-pill assignee-pill">👤 ${escapeHtml(t.assignee)}</span>` : ""}
          </div>
          ${t.note ? `<div class="item-note">${escapeHtml(t.note)}</div>` : ""}
          ${t.lastCompletedDate ? `<div class="item-sub">上次完成：${fmtDate(t.lastCompletedDate)}</div>` : ""}
        </div>
        <div class="item-actions">
          <button class="icon-btn" data-action="edit" data-id="${t.id}" aria-label="修改">✏️</button>
          <button class="icon-btn icon-btn-danger" data-action="delete" data-id="${t.id}" aria-label="刪除">🗑️</button>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const todo = state.todos.find((t) => t.id === btn.dataset.id);
      if (!todo) return;
      const action = btn.dataset.action;
      if (action === "toggle") toggleTodoComplete(todo);
      if (action === "edit") startEditTodo(todo);
      if (action === "delete") deleteTodo(todo.id);
    });
  });
}
