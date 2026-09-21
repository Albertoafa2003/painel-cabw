import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZehcWZwnwlGG5LR6y7_hKAVErHiHDhXM",
  authDomain: "painel-cabw.firebaseapp.com",
  projectId: "painel-cabw",
  storageBucket: "painel-cabw.firebasestorage.app",
  messagingSenderId: "6881251447",
  appId: "1:6881251447:web:b497f601fb005d65d13672",
  measurementId: "G-D2C4E646PM"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const USERS_KEY = "cabwUsers";
const ACCESS_LOG_KEY = "cabwAccessLog";
const SESSION_KEY = "cabwSession";

const fmtDateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit"
});

let cachedUsers = [];
let cachedLogs = [];

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (error) {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[char]));
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = toDate(value);
  return date ? fmtDateTime.format(date) : "-";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach(el => { el.textContent = value; });
}

async function fetchUsersFromFirestore() {
  const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(1000));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

async function fetchLogsFromFirestore() {
  const q = query(collection(db, "accessLogs"), orderBy("timestamp", "desc"), limit(1000));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

async function loadCentralData() {
  try {
    const [users, logs] = await Promise.all([
      fetchUsersFromFirestore(),
      fetchLogsFromFirestore()
    ]);

    cachedUsers = users;
    cachedLogs = logs;
  } catch (error) {
    console.warn("Não foi possível carregar dados do Firestore. Usando fallback local.", error);
    cachedUsers = readJson(USERS_KEY, []);
    cachedLogs = readJson(ACCESS_LOG_KEY, []).slice().reverse();
  }
}

function renderAdminOverview() {
  const session = readJson(SESSION_KEY, null);

  setText('[data-admin-kpi="users"]', new Intl.NumberFormat("pt-BR").format(cachedUsers.length));
  setText('[data-admin-kpi="logs"]', new Intl.NumberFormat("pt-BR").format(cachedLogs.length));
  setText('[data-admin-kpi="current-user"]', session ? (session.name || session.email || "-") : "-");

  const last = cachedLogs[0] || cachedLogs[cachedLogs.length - 1];
  setText('[data-admin-kpi="last-access"]', last ? formatDate(last.timestamp || last.timestampClient) : "-");
}

function renderUsers() {
  const tbody = document.querySelector("#adminUsersTable tbody");
  const mobileList = document.querySelector("#adminUsersCards");
  if (!tbody && !mobileList) return;

  const search = document.querySelector("#adminUsersSearch");
  const queryText = normalize(search ? search.value : "");
  const users = cachedUsers.filter(user => normalize([user.name, user.email].join(" ")).includes(queryText));

  if (tbody) {
    tbody.innerHTML = users.length ? users.map((user, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(user.name || "-")}</td>
        <td>${escapeHtml(user.email || "-")}</td>
        <td>${formatDate(user.createdAt)}</td>
      </tr>
    `).join("") : '<tr><td colspan="4" class="admin-empty">Nenhum usuário encontrado no Firestore.</td></tr>';
  }

  if (mobileList) {
    mobileList.innerHTML = users.length ? users.map(user => `
      <article class="admin-mobile-card">
        <strong>${escapeHtml(user.name || "-")}</strong>
        <span>${escapeHtml(user.email || "-")}</span>
        <small>Cadastrado em ${formatDate(user.createdAt)}</small>
      </article>
    `).join("") : '<p class="admin-empty">Nenhum usuário encontrado no Firestore.</p>';
  }

  setText("[data-users-results]", `${users.length} usuário(s) exibido(s)`);
}

function populateHistoryActions(logs) {
  const select = document.querySelector("#adminHistoryAction");
  if (!select) return;

  const previous = select.value;
  const actions = Array.from(new Set(logs.map(item => item.action).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  select.innerHTML = '<option value="">Todas as ações</option>' + actions.map(action => `<option value="${escapeHtml(action)}">${escapeHtml(action)}</option>`).join("");
  if (actions.includes(previous)) select.value = previous;
}

function renderHistory() {
  const tbody = document.querySelector("#adminHistoryTable tbody");
  const mobileList = document.querySelector("#adminHistoryCards");
  if (!tbody && !mobileList) return;

  const search = document.querySelector("#adminHistorySearch");
  const actionFilter = document.querySelector("#adminHistoryAction");
  const queryText = normalize(search ? search.value : "");
  const action = actionFilter ? actionFilter.value : "";

  let logs = cachedLogs.slice();
  logs = logs.filter(item => {
    const content = normalize([item.timestampClient, item.action, item.panel, item.name, item.email, item.path, item.details].join(" "));
    return (!action || item.action === action) && (!queryText || content.includes(queryText));
  });

  if (tbody) {
    tbody.innerHTML = logs.length ? logs.map(item => `
      <tr>
        <td>${formatDate(item.timestamp || item.timestampClient)}</td>
        <td>${escapeHtml(item.action || "-")}</td>
        <td>${escapeHtml(item.panel || "-")}</td>
        <td>${escapeHtml(item.name || "-")}</td>
        <td>${escapeHtml(item.email || "-")}</td>
        <td>${escapeHtml(item.path || "-")}</td>
      </tr>
    `).join("") : '<tr><td colspan="6" class="admin-empty">Nenhum registro encontrado no Firestore.</td></tr>';
  }

  if (mobileList) {
    mobileList.innerHTML = logs.length ? logs.map(item => `
      <article class="admin-mobile-card">
        <strong>${escapeHtml(item.action || "-")} · ${escapeHtml(item.panel || "-")}</strong>
        <span>${escapeHtml(item.name || "-")} · ${escapeHtml(item.email || "-")}</span>
        <small>${formatDate(item.timestamp || item.timestampClient)} · ${escapeHtml(item.path || "-")}</small>
      </article>
    `).join("") : '<p class="admin-empty">Nenhum registro encontrado no Firestore.</p>';
  }

  setText("[data-history-results]", `${logs.length} registro(s) exibido(s)`);
}

async function bootAdmin() {
  await loadCentralData();
  renderAdminOverview();
  populateHistoryActions(cachedLogs);
  renderUsers();
  renderHistory();

  const usersSearch = document.querySelector("#adminUsersSearch");
  if (usersSearch) usersSearch.addEventListener("input", renderUsers);

  const historySearch = document.querySelector("#adminHistorySearch");
  const historyAction = document.querySelector("#adminHistoryAction");
  if (historySearch) historySearch.addEventListener("input", renderHistory);
  if (historyAction) historyAction.addEventListener("change", renderHistory);
}

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, user => {
    if (!user) return;
    bootAdmin();
  });
});
