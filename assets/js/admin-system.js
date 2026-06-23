(function () {
  const USERS_KEY = 'cabwUsers';
  const ACCESS_LOG_KEY = 'cabwAccessLog';
  const SESSION_KEY = 'cabwSession';
  const fmtDateTime = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function formatDate(iso) {
    if (!iso) return '-';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '-' : fmtDateTime.format(date);
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function getUsers() {
    return readJson(USERS_KEY, []);
  }

  function getLogs() {
    return readJson(ACCESS_LOG_KEY, []);
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(el => { el.textContent = value; });
  }

  function renderAdminOverview() {
    const users = getUsers();
    const logs = getLogs();
    const session = readJson(SESSION_KEY, null);

    setText('[data-admin-kpi="users"]', new Intl.NumberFormat('pt-BR').format(users.length));
    setText('[data-admin-kpi="logs"]', new Intl.NumberFormat('pt-BR').format(logs.length));
    setText('[data-admin-kpi="current-user"]', session ? (session.name || session.email || '-') : '-');

    const last = logs[logs.length - 1];
    setText('[data-admin-kpi="last-access"]', last ? formatDate(last.timestamp) : '-');
  }

  function renderUsers() {
    const tbody = document.querySelector('#adminUsersTable tbody');
    const mobileList = document.querySelector('#adminUsersCards');
    if (!tbody && !mobileList) return;

    const search = document.querySelector('#adminUsersSearch');
    const query = normalize(search ? search.value : '');
    const users = getUsers().filter(user => normalize([user.name, user.email].join(' ')).includes(query));

    if (tbody) {
      tbody.innerHTML = users.length ? users.map((user, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(user.name || '-')}</td>
          <td>${escapeHtml(user.email || '-')}</td>
          <td>${formatDate(user.createdAt)}</td>
        </tr>
      `).join('') : '<tr><td colspan="4" class="admin-empty">Nenhum usuário cadastrado neste navegador.</td></tr>';
    }

    if (mobileList) {
      mobileList.innerHTML = users.length ? users.map(user => `
        <article class="admin-mobile-card">
          <strong>${escapeHtml(user.name || '-')}</strong>
          <span>${escapeHtml(user.email || '-')}</span>
          <small>Cadastrado em ${formatDate(user.createdAt)}</small>
        </article>
      `).join('') : '<p class="admin-empty">Nenhum usuário cadastrado neste navegador.</p>';
    }

    setText('[data-users-results]', `${users.length} usuário(s) exibido(s)`);
  }

  function renderHistory() {
    const tbody = document.querySelector('#adminHistoryTable tbody');
    const mobileList = document.querySelector('#adminHistoryCards');
    if (!tbody && !mobileList) return;

    const search = document.querySelector('#adminHistorySearch');
    const actionFilter = document.querySelector('#adminHistoryAction');
    const query = normalize(search ? search.value : '');
    const action = actionFilter ? actionFilter.value : '';

    let logs = getLogs().slice().reverse();
    logs = logs.filter(item => {
      const content = normalize([item.timestamp, item.action, item.panel, item.name, item.email, item.path, item.details].join(' '));
      return (!action || item.action === action) && (!query || content.includes(query));
    });

    if (tbody) {
      tbody.innerHTML = logs.length ? logs.map(item => `
        <tr>
          <td>${formatDate(item.timestamp)}</td>
          <td>${escapeHtml(item.action || '-')}</td>
          <td>${escapeHtml(item.panel || '-')}</td>
          <td>${escapeHtml(item.name || '-')}</td>
          <td>${escapeHtml(item.email || '-')}</td>
          <td>${escapeHtml(item.path || '-')}</td>
        </tr>
      `).join('') : '<tr><td colspan="6" class="admin-empty">Nenhum registro de acesso encontrado.</td></tr>';
    }

    if (mobileList) {
      mobileList.innerHTML = logs.length ? logs.map(item => `
        <article class="admin-mobile-card">
          <strong>${escapeHtml(item.action || '-')} · ${escapeHtml(item.panel || '-')}</strong>
          <span>${formatDate(item.timestamp)}</span>
          <small>${escapeHtml(item.name || '-')} · ${escapeHtml(item.email || '-')}</small>
          <small>${escapeHtml(item.path || '-')}</small>
        </article>
      `).join('') : '<p class="admin-empty">Nenhum registro de acesso encontrado.</p>';
    }

    setText('[data-history-results]', `${logs.length} registro(s) exibido(s)`);
  }

  function setupHistoryActions() {
    const actionSelect = document.querySelector('#adminHistoryAction');
    if (!actionSelect) return;
    const actions = Array.from(new Set(getLogs().map(item => item.action).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const current = actionSelect.value;
    actionSelect.innerHTML = '<option value="">Todas as ações</option>' + actions.map(action => `<option value="${escapeHtml(action)}">${escapeHtml(action)}</option>`).join('');
    if (actions.includes(current)) actionSelect.value = current;
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderAdminOverview();
    setupHistoryActions();
    renderUsers();
    renderHistory();

    document.querySelector('#adminUsersSearch')?.addEventListener('input', renderUsers);
    document.querySelector('#adminHistorySearch')?.addEventListener('input', renderHistory);
    document.querySelector('#adminHistoryAction')?.addEventListener('change', renderHistory);
  });
})();
