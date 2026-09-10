export const accountsPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Ledgerly · Connected accounts</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@tabler/core@1.5.1/dist/css/tabler.min.css"
      integrity="sha384-tLWyEXulonaekaXL6+fCZQJv/MujuGIpVTBzuVEpwSqFDEfLkPA/PAYGTSBBJO2X"
      crossorigin="anonymous"
    />
    <style>
      :root { color-scheme: light; }
      .ledgerly-container { max-width: 1320px; }
      .brand-mark { font-weight: 800; letter-spacing: -0.06em; }
      .token-input { min-width: 0; }
      .account-id { font-family: var(--tblr-font-monospace); font-size: .75rem; }
      .status-message { min-height: 24px; }
      .status-message.error { color: var(--tblr-danger); }
      .capability-list { max-width: 260px; white-space: normal; }
      .hidden { display: none !important; }
      :focus-visible { outline: 2px solid var(--tblr-primary); outline-offset: 3px; }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="navbar navbar-expand-md d-print-none">
        <div class="container-xl ledgerly-container">
          <a class="navbar-brand" href="/" aria-label="Ledgerly payouts">
            <span class="avatar avatar-sm bg-primary text-white me-2 brand-mark" aria-hidden="true">L</span>Ledgerly
          </a>
          <div class="d-flex align-items-center gap-3">
            <a class="nav-link" href="/">Seller payouts</a>
            <span class="badge bg-yellow-lt">Sandbox</span>
          </div>
        </div>
      </header>
      <main class="page-wrapper">
        <div class="page-header">
          <div class="container-xl ledgerly-container d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
            <div>
              <div class="page-pretitle">Operator workspace</div>
              <h1 class="page-title">Connected accounts</h1>
              <p class="text-secondary mt-2 mb-0">Review live account readiness and open provider-hosted account flows.</p>
            </div>
            <button class="btn btn-outline-primary" id="refresh" type="button">Refresh accounts</button>
          </div>
        </div>
        <div class="page-body">
          <div class="container-xl ledgerly-container">
            <section class="card mb-4" aria-labelledby="admin-heading">
              <div class="card-body">
                <h2 class="card-title mb-3" id="admin-heading">Administrator access</h2>
                <label class="form-label" for="admin-token">Admin token</label>
                <div class="d-flex gap-2 flex-column flex-sm-row">
                  <input class="form-control token-input" id="admin-token" type="password" autocomplete="off" placeholder="Enter LEDGERLY_ADMIN_TOKEN" aria-describedby="admin-help" />
                  <button class="btn btn-primary" id="load" type="button">Load accounts</button>
                </div>
                <div id="admin-help" class="form-hint">The token stays in this page and is sent only to the local Ledgerly API.</div>
              </div>
            </section>

            <div id="status" class="alert alert-info status-message" role="status" aria-live="polite">Enter the administrator token to load connected accounts.</div>
            <section id="accounts-card" class="card hidden" aria-labelledby="accounts-heading">
              <div class="card-header">
                <h2 class="card-title" id="accounts-heading">Platform children</h2>
                <span class="text-secondary ms-auto" id="count"></span>
              </div>
              <div class="table-responsive">
                <table class="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Country</th>
                      <th>Verification</th>
                      <th>Capabilities</th>
                      <th>Required actions</th>
                      <th>Status</th>
                      <th class="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="account-rows"></tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
    <script type="module">
      const tokenInput = document.querySelector('#admin-token');
      const loadButton = document.querySelector('#load');
      const refreshButton = document.querySelector('#refresh');
      const status = document.querySelector('#status');
      const card = document.querySelector('#accounts-card');
      const rows = document.querySelector('#account-rows');
      const count = document.querySelector('#count');

      function setStatus(message, kind = 'info') {
        status.className = 'alert status-message alert-' + (kind === 'error' ? 'danger' : kind);
        status.textContent = message;
      }

      function setLinkStatus(url, useCase) {
        status.className = 'alert status-message alert-success';
        status.textContent = '';
        const link = document.createElement('a');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = useCase === 'onboarding'
          ? 'Open provider-hosted onboarding ↗'
          : 'Open provider-hosted payouts ↗';
        status.append('Your secure provider link is ready. ', link);
      }

      function textCell(value, className = '') {
        const cell = document.createElement('td');
        if (className) cell.className = className;
        cell.textContent = value ?? 'Unknown';
        return cell;
      }

      function displayStatus(value) {
        return typeof value === 'string' && value.length ? value.replaceAll('_', ' ') : 'Unknown';
      }

      async function request(url, options = {}) {
        const response = await fetch(url, {
          ...options,
          headers: { Authorization: 'Bearer ' + tokenInput.value, Accept: 'application/json', ...options.headers },
        });
        const data = await response.json().catch(() => ({ error: 'invalid_response' }));
        if (response.status === 401) throw new Error('Enter a valid administrator token. Seller tokens cannot access this page.');
        if (response.status === 503 && data.error === 'admin_not_configured') throw new Error('Administrator access is not configured on this server.');
        if (!response.ok) throw new Error(data.message || data.error || 'HTTP ' + response.status);
        return data;
      }

      async function openAccountLink(companyId, useCase, button) {
        button.disabled = true;
        setStatus(useCase === 'onboarding' ? 'Creating an onboarding link…' : 'Creating a payouts portal link…');
        try {
          const data = await request('/api/accounts/' + encodeURIComponent(companyId) + '/' + useCase, { method: 'POST' });
          const url = new URL(data.url);
          if (url.protocol !== 'https:') throw new Error('The provider returned an invalid link.');
          setLinkStatus(url, useCase);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Unable to open the provider link.', 'error');
        } finally {
          button.disabled = false;
        }
      }

      function renderAccount(account) {
        const row = document.createElement('tr');
        const identity = document.createElement('td');
        const external = document.createElement('div');
        external.className = 'fw-semibold';
        external.textContent = account.external_id ?? 'Unknown external ID';
        const id = document.createElement('div');
        id.className = 'text-secondary account-id';
        id.textContent = account.company_id;
        identity.append(external, id);
        row.append(identity);

        row.append(textCell(
          'Account: ' + (account.country ?? 'Unknown')
            + ' · Metadata: ' + (account.country_metadata ?? 'Unknown'),
        ));

        const verification = 'Individual: ' + displayStatus(account.verification.individual)
          + ' · Business: ' + displayStatus(account.verification.business);
        row.append(textCell(verification));

        const reportedCapabilities = Array.isArray(account.capabilities) ? account.capabilities : [];
        const active = reportedCapabilities.filter((capability) => capability.status === 'active').map((capability) => displayStatus(capability.name));
        const known = reportedCapabilities.length;
        const capabilities = active.length
          ? active.join(', ') + (known > active.length ? ' · ' + (known - active.length) + ' not active' : '')
          : known ? 'None active (' + known + ' reported)' : account.capabilities === null ? 'Unknown' : 'None reported';
        row.append(textCell(capabilities, 'capability-list'));
        row.append(textCell(Array.isArray(account.required_actions)
          ? account.required_actions.length ? account.required_actions.join(', ') : 'None reported'
          : 'Unknown'));

        const accountStatus = displayStatus(account.suspension.status);
        const suspension = account.suspension.suspended === true ? 'Suspended' : account.suspension.suspended === false ? accountStatus : 'Unknown';
        row.append(textCell(account.suspension.reason ? suspension + ': ' + account.suspension.reason : suspension));

        const actions = document.createElement('td');
        actions.className = 'text-end text-nowrap';
        const onboarding = document.createElement('button');
        onboarding.type = 'button';
        onboarding.className = 'btn btn-sm btn-outline-primary me-2';
        onboarding.textContent = 'Onboarding ↗';
        onboarding.addEventListener('click', () => openAccountLink(account.company_id, 'onboarding', onboarding));
        const payouts = document.createElement('button');
        payouts.type = 'button';
        payouts.className = 'btn btn-sm btn-primary';
        payouts.textContent = 'Payouts ↗';
        payouts.addEventListener('click', () => openAccountLink(account.company_id, 'payouts-portal', payouts));
        actions.append(onboarding, payouts);
        row.append(actions);
        rows.append(row);
      }

      async function loadAccounts() {
        if (!tokenInput.value) {
          setStatus('Enter the administrator token first.', 'error');
          tokenInput.focus();
          return;
        }
        loadButton.disabled = true;
        refreshButton.disabled = true;
        tokenInput.disabled = true;
        card.classList.add('hidden');
        rows.replaceChildren();
        count.textContent = '';
        setStatus('Loading connected accounts…');
        try {
          const data = await request('/api/accounts');
          for (const account of data.accounts) renderAccount(account);
          count.textContent = data.accounts.length + (data.accounts.length === 1 ? ' account' : ' accounts');
          if (data.accounts.length) {
            card.classList.remove('hidden');
            setStatus('Connected accounts refreshed from Whop.', 'success');
          } else {
            setStatus('No connected accounts were found for this platform.', 'info');
          }
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Unable to load connected accounts.', 'error');
        } finally {
          loadButton.disabled = false;
          refreshButton.disabled = false;
          tokenInput.disabled = false;
        }
      }

      loadButton.addEventListener('click', loadAccounts);
      refreshButton.addEventListener('click', loadAccounts);
      tokenInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') loadAccounts(); });
    </script>
  </body>
</html>`;
