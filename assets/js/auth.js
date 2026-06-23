(function () {
  const USERS_KEY = 'cabwUsers';
  const SESSION_KEY = 'cabwSession';
  const ACCESS_LOG_KEY = 'cabwAccessLog';

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function isFabEmail(email) {
    return /^[^\s@]+@fab\.mil\.br$/i.test(String(email || '').trim());
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
      return fallback;
    }
  }

  function loadUsers() {
    return readJson(USERS_KEY, []);
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getSession() {
    return readJson(SESSION_KEY, null);
  }

  function setSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      email: user.email,
      name: user.name || user.email,
      authenticatedAt: new Date().toISOString()
    }));
  }

  function loadAccessLog() {
    return readJson(ACCESS_LOG_KEY, []);
  }

  function saveAccessLog(entries) {
    localStorage.setItem(ACCESS_LOG_KEY, JSON.stringify(entries.slice(-1000)));
  }

  function currentPanelName() {
    const h1 = document.querySelector('main h1, header h1, h1');
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    return String(document.title || 'Painel CABW').replace(/^Painel CABW\s*-\s*/i, '').trim() || 'Painel CABW';
  }

  function logAccess(action, panel, details, forcedUser) {
    const session = forcedUser || getSession();
    const entries = loadAccessLog();
    entries.push({
      id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      action: action || 'Acesso',
      panel: panel || currentPanelName(),
      name: session && session.name ? session.name : '',
      email: session && session.email ? session.email : '',
      path: location.pathname.split('/').pop() || 'index.html',
      details: details || ''
    });
    saveAccessLog(entries);
  }

  function showMessage(message, type) {
    const box = document.querySelector('#authMessage');
    if (!box) return;
    box.textContent = message;
    box.className = `auth-alert auth-alert--${type || 'info'} is-visible`;
  }

  function simpleHash(value) {
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  function setupPasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach(button => {
      button.addEventListener('click', () => {
        const input = document.querySelector(button.dataset.togglePassword);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        const icon = button.querySelector('i');
        if (icon) {
          icon.className = input.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
        }
      });
    });
  }

  function setupLogin() {
    const form = document.querySelector('#loginForm');
    if (!form) return;

    form.addEventListener('submit', event => {
      event.preventDefault();

      const email = normalizeEmail(document.querySelector('#loginEmail')?.value);
      const password = document.querySelector('#loginPassword')?.value || '';

      if (!isFabEmail(email)) {
        showMessage('Use um e-mail institucional válido terminado em @fab.mil.br.', 'error');
        return;
      }

      const user = loadUsers().find(item => item.email === email);
      if (!user || user.passwordHash !== simpleHash(password)) {
        showMessage('E-mail ou senha inválidos. Crie uma conta se ainda não tiver cadastro neste navegador.', 'error');
        return;
      }

      setSession(user);
      logAccess('Login', 'Acesso ao sistema', 'Login realizado com sucesso.', user);
      window.location.href = 'painel.html';
    });
  }

  function setupRegister() {
    const form = document.querySelector('#registerForm');
    if (!form) return;

    form.addEventListener('submit', event => {
      event.preventDefault();

      const name = String(document.querySelector('#registerName')?.value || '').trim();
      const email = normalizeEmail(document.querySelector('#registerEmail')?.value);
      const password = document.querySelector('#registerPassword')?.value || '';
      const confirm = document.querySelector('#registerPasswordConfirm')?.value || '';

      if (!name) {
        showMessage('Informe o nome completo.', 'error');
        return;
      }

      if (!isFabEmail(email)) {
        showMessage('O cadastro aceita somente e-mail institucional terminado em @fab.mil.br.', 'error');
        return;
      }

      if (password.length < 6) {
        showMessage('A senha deve ter pelo menos 6 caracteres.', 'error');
        return;
      }

      if (password !== confirm) {
        showMessage('A confirmação da senha não confere.', 'error');
        return;
      }

      const users = loadUsers();
      if (users.some(item => item.email === email)) {
        showMessage('Já existe uma conta cadastrada com este e-mail neste navegador.', 'error');
        return;
      }

      const user = {
        name,
        email,
        passwordHash: simpleHash(password),
        createdAt: new Date().toISOString()
      };
      users.push(user);
      saveUsers(users);
      setSession(user);
      logAccess('Criação de conta', 'Administração do Sistema', 'Usuário cadastrado e autenticado.', user);

      window.location.href = 'painel.html';
    });
  }

  function setupLogoutButton() {
    const nav = document.querySelector('.navbar-nav');
    if (!nav || document.querySelector('[data-auth-logout]')) return;

    const session = getSession();
    if (!session) return;

    const item = document.createElement('li');
    item.className = 'nav-item auth-logout-item';
    item.innerHTML = '<button type="button" class="nav-link auth-logout-button" data-auth-logout><i class="bi bi-box-arrow-right" aria-hidden="true"></i><span>Sair</span></button>';
    nav.appendChild(item);

    item.querySelector('[data-auth-logout]').addEventListener('click', () => {
      logAccess('Logout', 'Acesso ao sistema', 'Usuário encerrou a sessão.', session);
      localStorage.removeItem(SESSION_KEY);
      window.location.href = 'index.html';
    });
  }

  function logProtectedPageAccess() {
    const key = `cabwLastLogged:${location.pathname}:${Date.now()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    logAccess('Acesso a painel', currentPanelName(), 'Página interna acessada.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupPasswordToggles();

    const pageType = document.body.dataset.authPage;
    const session = getSession();

    if (pageType === 'login' || pageType === 'register') {
      if (session) window.location.href = 'painel.html';
      setupLogin();
      setupRegister();
      return;
    }

    if (!session) {
      window.location.href = 'index.html';
      return;
    }

    setupLogoutButton();
    logProtectedPageAccess();
  });
})();
