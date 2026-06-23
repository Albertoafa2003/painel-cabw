(function () {
  const USERS_KEY = 'cabwUsers';
  const SESSION_KEY = 'cabwSession';

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function isFabEmail(email) {
    return /^[^\s@]+@fab\.mil$/i.test(String(email || '').trim());
  }

  function loadUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    } catch (error) {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function setSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      email: user.email,
      name: user.name || user.email,
      authenticatedAt: new Date().toISOString()
    }));
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
        showMessage('Use um e-mail institucional válido terminado em @fab.mil.', 'error');
        return;
      }

      const user = loadUsers().find(item => item.email === email);
      if (!user || user.passwordHash !== simpleHash(password)) {
        showMessage('E-mail ou senha inválidos. Crie uma conta se ainda não tiver cadastro neste navegador.', 'error');
        return;
      }

      setSession(user);
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
        showMessage('O cadastro aceita somente e-mail institucional terminado em @fab.mil.', 'error');
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
      localStorage.removeItem(SESSION_KEY);
      window.location.href = 'index.html';
    });
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
  });
})();
