const currentPage = document.body.dataset.page;

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }

  return payload;
}

async function initOwnerLoginPage() {
  const form = document.querySelector('#owner-login-form');
  const errorNode = document.querySelector('#owner-login-error');
  const usernameInput = document.querySelector('#owner-username');

  try {
    const session = await requestJson('/api/admin/session', { method: 'GET' });

    if (session.authenticated) {
      window.location.href = '/owner-dashboard.html';
      return;
    }
  } catch {
    // Keep login form available even when session checks fail.
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNode.textContent = '';

    const formData = new FormData(form);
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '');

    try {
      await requestJson('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      window.location.href = '/owner-dashboard.html';
    } catch (error) {
      errorNode.textContent = error instanceof Error ? error.message : 'Login failed.';
    }
  });

  usernameInput.focus();
}

function renderEmailLinks(inboxEntries) {
  const linksNode = document.querySelector('#owner-email-links');
  linksNode.innerHTML = '';

  inboxEntries.forEach((entry) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'owner-link-row';

    const link = document.createElement('a');
    link.className = 'button button-primary';
    link.href = entry.href;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = entry.label;

    const note = document.createElement('p');
    note.textContent = entry.note;

    wrapper.appendChild(link);
    wrapper.appendChild(note);
    linksNode.appendChild(wrapper);
  });
}

async function initOwnerDashboardPage() {
  const errorNode = document.querySelector('#owner-dashboard-error');
  const logoutButton = document.querySelector('#owner-logout');
  const welcomeNode = document.querySelector('#owner-welcome');
  const ariLink = document.querySelector('#owner-ari-link');
  const healthNode = document.querySelector('#owner-health');
  const grid = document.querySelector('#owner-dashboard-grid');

  async function loadDashboard() {
    errorNode.textContent = '';

    try {
      const session = await requestJson('/api/admin/session', { method: 'GET' });

      if (!session.authenticated) {
        window.location.href = '/owner-login.html';
        return;
      }

      const dashboard = await requestJson('/api/admin/dashboard', { method: 'GET' });
      welcomeNode.textContent = `Signed in as ${dashboard.username}`;
      ariLink.href = dashboard.links.ari;
      renderEmailLinks(dashboard.inbox);
      healthNode.textContent = JSON.stringify(dashboard.health, null, 2);
      grid.hidden = false;
    } catch (error) {
      errorNode.textContent = error instanceof Error ? error.message : 'Could not load dashboard.';
    }
  }

  logoutButton.addEventListener('click', async () => {
    try {
      await requestJson('/api/admin/logout', { method: 'POST', body: '{}' });
    } finally {
      window.location.href = '/owner-login.html';
    }
  });

  await loadDashboard();
}

if (currentPage === 'owner-login') {
  initOwnerLoginPage();
}

if (currentPage === 'owner-dashboard') {
  initOwnerDashboardPage();
}
