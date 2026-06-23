import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  browserLocalPersistence,
  setPersistence
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp
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
const SESSION_KEY = "cabwSession";
const ACCESS_LOG_KEY = "cabwAccessLog";

setPersistence(auth, browserLocalPersistence).catch(() => {});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isFabEmail(email) {
  return /^[^\s@]+@fab\.mil\.br$/i.test(String(email || "").trim());
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadUsers() {
  return readJson(USERS_KEY, []);
}

function saveUsers(users) {
  writeJson(USERS_KEY, users);
}

function verificationContinueUrl() {
  return new URL("index.html?verified=1", window.location.href).href;
}

async function sendVerification(user) {
  if (!user || !user.email) return;
  await sendEmailVerification(user, {
    url: verificationContinueUrl(),
    handleCodeInApp: false
  });
}

function upsertLocalUser(user, extra = {}) {
  if (!user || !user.email) return;
  const email = normalizeEmail(user.email);
  const users = loadUsers();
  const current = users.find(item => normalizeEmail(item.email) === email);
  const profile = {
    id: user.uid || current?.id || `user-${Date.now()}`,
    uid: user.uid || current?.uid || "",
    name: extra.name || user.displayName || current?.name || email,
    email,
    emailVerified: !!user.emailVerified,
    createdAt: current?.createdAt || extra.createdAt || new Date().toISOString(),
    provider: "Firebase Authentication + Firestore",
    lastLoginAt: extra.lastLoginAt || current?.lastLoginAt || ""
  };

  if (current) {
    Object.assign(current, profile);
  } else {
    users.push(profile);
  }

  saveUsers(users);
}

async function upsertFirestoreUser(user, options = {}) {
  if (!user || !user.uid || !user.email) return;

  const email = normalizeEmail(user.email);
  const ref = doc(db, "users", user.uid);
  const snapshot = await getDoc(ref).catch(() => null);
  const alreadyExists = snapshot && snapshot.exists();

  const payload = {
    uid: user.uid,
    email,
    emailVerified: !!user.emailVerified,
    name: options.name || user.displayName || email,
    provider: "Firebase Authentication",
    updatedAt: serverTimestamp()
  };

  if (!alreadyExists || options.createdAt) {
    payload.createdAt = serverTimestamp();
  }

  if (options.lastLoginAt) {
    payload.lastLoginAt = serverTimestamp();
  }

  await setDoc(ref, payload, { merge: true });
}

function setSession(user, options = {}) {
  if (!user) return;
  const session = {
    uid: user.uid || "",
    email: normalizeEmail(user.email),
    emailVerified: !!user.emailVerified,
    name: user.displayName || normalizeEmail(user.email),
    authenticatedAt: new Date().toISOString(),
    provider: "Firebase Authentication",
    isAdmin: !!options.isAdmin
  };
  writeJson(SESSION_KEY, session);
  upsertLocalUser(user, { lastLoginAt: session.authenticatedAt });
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function getSession() {
  return readJson(SESSION_KEY, null);
}

function loadAccessLog() {
  return readJson(ACCESS_LOG_KEY, []);
}

function saveAccessLog(entries) {
  writeJson(ACCESS_LOG_KEY, entries.slice(-1500));
}

function currentPanelName() {
  const h1 = document.querySelector("main h1, header h1, h1");
  if (h1 && h1.textContent.trim()) return h1.textContent.trim();
  return String(document.title || "Painel CABW").replace(/^Painel CABW\s*-\s*/i, "").trim() || "Painel CABW";
}

async function logAccess(action, panel, details, forcedUser) {
  const session = forcedUser || getSession();
  const localEntry = {
    id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    action: action || "Acesso",
    panel: panel || currentPanelName(),
    name: session && session.name ? session.name : "",
    email: session && session.email ? session.email : "",
    uid: session && session.uid ? session.uid : "",
    path: location.pathname.split("/").pop() || "index.html",
    details: details || ""
  };

  const entries = loadAccessLog();
  entries.push(localEntry);
  saveAccessLog(entries);

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.uid) return;

  try {
    await addDoc(collection(db, "accessLogs"), {
      uid: currentUser.uid,
      name: currentUser.displayName || localEntry.name || currentUser.email || "",
      email: normalizeEmail(currentUser.email || localEntry.email),
      action: localEntry.action,
      panel: localEntry.panel,
      path: localEntry.path,
      details: localEntry.details,
      timestamp: serverTimestamp(),
      timestampClient: localEntry.timestamp,
      userAgent: navigator.userAgent || ""
    });
  } catch (error) {
    console.warn("Não foi possível gravar o log no Firestore.", error);
  }
}

function showMessage(message, type = "error") {
  const box = document.querySelector("#authMessage");
  if (!box) return;
  box.textContent = message;
  box.className = `auth-alert auth-alert--${type} is-visible`;
}

function translateAuthError(error) {
  const code = error && error.code ? error.code : "";
  const messages = {
    "auth/email-already-in-use": "Este e-mail já possui cadastro no Firebase.",
    "auth/invalid-email": "Informe um e-mail institucional válido.",
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/user-not-found": "E-mail ou senha inválidos.",
    "auth/wrong-password": "E-mail ou senha inválidos.",
    "auth/weak-password": "A senha deve ter pelo menos 6 caracteres.",
    "auth/network-request-failed": "Falha de conexão. Verifique a internet e tente novamente.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "auth/operation-not-allowed": "O método Email/Password ainda não está habilitado no Firebase.",
    "auth/missing-continue-uri": "Configure o domínio autorizado e tente enviar novamente a verificação de e-mail.",
    "permission-denied": "Sem permissão para gravar no Firestore. Verifique as regras do banco."
  };
  return messages[code] || "Não foi possível concluir a operação. Tente novamente.";
}

function setupPasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach(button => {
    button.addEventListener("click", () => {
      const input = document.querySelector(button.dataset.togglePassword);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      const icon = button.querySelector("i");
      if (icon) {
        icon.className = input.type === "password" ? "bi bi-eye" : "bi bi-eye-slash";
      }
    });
  });
}

function showInitialAuthMessage() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("verified") === "1") {
    showMessage("E-mail verificado. Faça login para acessar o Painel CABW.", "info");
    history.replaceState({}, document.title, "index.html");
  }

  if (params.get("verifyEmail") === "1") {
    showMessage("Cadastro realizado. Enviamos um link de verificação para o e-mail informado. Confirme o e-mail antes de fazer login.", "info");
    history.replaceState({}, document.title, "index.html");
  }

  if (params.get("emailNotVerified") === "1") {
    showMessage("E-mail ainda não verificado. Verifique sua caixa de entrada e clique no link enviado pelo Firebase.", "error");
    history.replaceState({}, document.title, "index.html");
  }
}

function setupLogin() {
  const form = document.querySelector("#loginForm");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const email = normalizeEmail(document.querySelector("#loginEmail")?.value);
    const password = document.querySelector("#loginPassword")?.value || "";

    if (!isFabEmail(email)) {
      showMessage("Use um e-mail institucional válido terminado em @fab.mil.br.");
      return;
    }

    if (!password) {
      showMessage("Informe a senha.");
      return;
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await credential.user.reload();
      const user = auth.currentUser || credential.user;

      if (!user.emailVerified) {
        await sendVerification(user).catch(() => {});
        await upsertFirestoreUser(user, { lastLoginAt: true }).catch(() => {});
        await signOut(auth);
        clearSession();
        showMessage("E-mail ainda não verificado. Enviamos um novo link de verificação para seu e-mail institucional.", "error");
        return;
      }

      await upsertFirestoreUser(user, { lastLoginAt: true });
      const admin = await userIsAdmin(user);
      setSession(user, { isAdmin: admin });
      await logAccess("Login", "Acesso ao Painel CABW", "Login realizado com e-mail verificado.", getSession());
      window.location.href = "painel.html";
    } catch (error) {
      showMessage(translateAuthError(error));
    }
  });
}

function setupRegister() {
  const form = document.querySelector("#registerForm");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const name = String(document.querySelector("#registerName")?.value || "").trim();
    const email = normalizeEmail(document.querySelector("#registerEmail")?.value);
    const password = document.querySelector("#registerPassword")?.value || "";
    const confirm = document.querySelector("#registerPasswordConfirm")?.value || "";

    if (!name) {
      showMessage("Informe o nome completo.");
      return;
    }

    if (!isFabEmail(email)) {
      showMessage("O cadastro aceita somente e-mail institucional terminado em @fab.mil.br.");
      return;
    }

    if (password.length < 6) {
      showMessage("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirm) {
      showMessage("A confirmação da senha não confere.");
      return;
    }

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      await credential.user.reload();

      const updatedUser = auth.currentUser || credential.user;
      await upsertFirestoreUser(updatedUser, { name, createdAt: true });
      setSession(updatedUser, { isAdmin: false });
      await logAccess("Criação de conta", "Acesso ao Painel CABW", "Conta criada. Aguardando verificação de e-mail.", getSession());
      await sendVerification(updatedUser);

      clearSession();
      await signOut(auth);
      window.location.href = "index.html?verifyEmail=1";
    } catch (error) {
      showMessage(translateAuthError(error));
    }
  });
}

function currentFileName() {
  return location.pathname.split("/").pop() || "painel.html";
}

function isAdminPage() {
  return ["administracao.html", "admin-usuarios.html", "admin-historico.html"].includes(currentFileName());
}

async function userIsAdmin(user) {
  if (!user || !user.uid) return false;
  try {
    const snapshot = await getDoc(doc(db, "admins", user.uid));
    return snapshot.exists();
  } catch (error) {
    return false;
  }
}

function applyAdminVisibility(isAdmin) {
  document.body.classList.toggle("auth-is-admin", !!isAdmin);
  document.querySelectorAll("[data-admin-only], .admin-only").forEach(element => {
    if (isAdmin) {
      element.hidden = false;
      element.removeAttribute("aria-hidden");
    } else {
      element.hidden = true;
      element.setAttribute("aria-hidden", "true");
    }
  });
}

function setupLogoutButton() {
  const nav = document.querySelector(".navbar-nav");
  if (!nav || document.querySelector("[data-auth-logout]")) return;

  const item = document.createElement("li");
  item.className = "nav-item auth-logout-item";
  item.innerHTML = `
    <button type="button" class="nav-link auth-logout-button" data-auth-logout>
      <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
      <span>Sair</span>
    </button>
  `;

  nav.appendChild(item);

  item.querySelector("[data-auth-logout]").addEventListener("click", async () => {
    await logAccess("Logout", "Acesso ao Painel CABW", "Logout registrado no Firestore.", getSession());
    clearSession();
    await signOut(auth);
    window.location.href = "index.html";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupPasswordToggles();
  showInitialAuthMessage();
  setupLogin();
  setupRegister();

  const pageType = document.body.dataset.authPage;
  const isAuthPage = pageType === "login" || pageType === "register";

  onAuthStateChanged(auth, async user => {
    if (isAuthPage && user) {
      await user.reload();
      const currentUser = auth.currentUser || user;

      if (!currentUser.emailVerified) {
        return;
      }

      await upsertFirestoreUser(currentUser, { lastLoginAt: true }).catch(() => {});
      const admin = await userIsAdmin(currentUser);
      setSession(currentUser, { isAdmin: admin });
      window.location.href = "painel.html";
      return;
    }

    if (!isAuthPage && !user) {
      clearSession();
      window.location.href = "index.html";
      return;
    }

    if (!isAuthPage && user) {
      await user.reload();
      const currentUser = auth.currentUser || user;

      if (!currentUser.emailVerified) {
        await logAccess("Acesso negado", currentPanelName(), "Tentativa de acesso com e-mail ainda não verificado.", getSession());
        clearSession();
        await signOut(auth);
        window.location.href = "index.html?emailNotVerified=1";
        return;
      }

      await upsertFirestoreUser(currentUser, { lastLoginAt: true }).catch(() => {});
      const admin = await userIsAdmin(currentUser);
      setSession(currentUser, { isAdmin: admin });
      applyAdminVisibility(admin);

      if (isAdminPage() && !admin) {
        await logAccess("Acesso negado", currentPanelName(), "Tentativa de acesso a área administrativa sem perfil de administrador.", getSession());
        window.location.href = "painel.html";
        return;
      }

      setupLogoutButton();
      logAccess("Acesso a painel", currentPanelName(), "Página interna acessada via sessão Firebase com e-mail verificado.", getSession());
    }
  });
});
