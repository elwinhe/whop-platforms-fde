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
            <span class="badge __WHOP_ENV_BADGE_CLASS__">__WHOP_ENV_TITLE__</span>
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

            <section class="card mb-4 hidden" id="create-card" aria-labelledby="create-heading">
              <div class="card-body">
                <h2 class="card-title mb-3" id="create-heading">Create connected account</h2>
                <div class="row g-2">
                  <div class="col-sm-4">
                    <label class="form-label" for="create-external-id">External ID</label>
                    <input class="form-control" id="create-external-id" autocomplete="off" placeholder="ledgerly_seller_mx" />
                  </div>
                  <div class="col-sm-4">
                    <label class="form-label" for="create-email">Email</label>
                    <input class="form-control" id="create-email" type="email" autocomplete="off" placeholder="seller@example.com" />
                  </div>
                  <div class="col-sm-2">
                    <label class="form-label" for="create-country">Country</label>
                    <input class="form-control" id="create-country" maxlength="2" autocomplete="off" placeholder="US" />
                  </div>
                  <div class="col-sm-2 d-flex align-items-end">
                    <button class="btn btn-primary w-100" id="create-account" type="button">Create</button>
                  </div>
                </div>
                <div class="form-hint">Reuses the idempotent onboarding flow: an existing account with the same external ID is returned instead of duplicated.</div>
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
            <section id="transactions-card" class="card mt-4 hidden" aria-labelledby="transactions-heading">
              <div class="card-header">
                <h2 class="card-title" id="transactions-heading">Transactions</h2>
                <span class="text-secondary ms-auto" id="transactions-subtitle"></span>
              </div>
              <div class="card-body hidden" id="transactions-empty">No transactions for this account yet.</div>
              <div class="table-responsive hidden" id="transactions-wrap">
                <table class="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th class="text-end">Gross</th>
                      <th class="text-end">Platform fee</th>
                      <th class="text-end">Net to seller</th>
                      <th>Status</th>
                      <th class="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="transactions-rows"></tbody>
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
      const createCard = document.querySelector('#create-card');
      const createButton = document.querySelector('#create-account');
      const createExternalId = document.querySelector('#create-external-id');
      const createEmail = document.querySelector('#create-email');
      const createCountry = document.querySelector('#create-country');

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

      const txCard = document.querySelector('#transactions-card');
      const txSubtitle = document.querySelector('#transactions-subtitle');
      const txEmpty = document.querySelector('#transactions-empty');
      const txWrap = document.querySelector('#transactions-wrap');
      const txRows = document.querySelector('#transactions-rows');

      function formatMoney(minor, decimals, currency) {
        if (typeof minor !== 'number') return '—';
        const value = minor / 10 ** (decimals ?? 2);
        try {
          return new Intl.NumberFormat(undefined, { style: 'currency', currency: (currency ?? 'usd').toUpperCase() }).format(value);
        } catch {
          return value.toFixed(decimals ?? 2) + (currency ? ' ' + currency.toUpperCase() : '');
        }
      }

      function renderTransactionRow(tx, account) {
        const row = document.createElement('tr');
        const date = textCell(tx.occurred_at ? new Date(tx.occurred_at).toLocaleString() : '—', 'text-nowrap');
        row.append(date);
        const description = document.createElement('td');
        const title = document.createElement('div');
        title.textContent = tx.description || 'Transaction';
        const ref = document.createElement('div');
        ref.className = 'text-secondary account-id';
        ref.textContent = (tx.order_id ? 'Order ' + tx.order_id : tx.resource_id)
          + (tx.ledger_recorded ? ' · in webhook ledger' : '');
        description.append(title, ref);
        row.append(description);
        for (const amount of [tx.gross_minor, tx.fee_minor, tx.net_minor]) {
          row.append(textCell(formatMoney(amount, tx.currency_decimals, tx.currency), 'text-end text-nowrap'));
        }
        const statusText = String(tx.status || 'unknown').replaceAll('_', ' ')
          + (tx.settlement === 'pending' ? ' · settlement pending' : tx.settlement ? ' · ' + tx.settlement.replaceAll('_', ' ') : '');
        row.append(textCell(statusText));
        const actions = document.createElement('td');
        actions.className = 'text-end';
        if (tx.source === 'payment' && tx.status === 'paid' && tx.settlement !== 'refunded') {
          const refund = document.createElement('button');
          refund.type = 'button';
          refund.className = 'btn btn-sm btn-outline-danger';
          refund.textContent = 'Refund';
          refund.addEventListener('click', async () => {
            const amount = formatMoney(tx.gross_minor, tx.currency_decimals, tx.currency);
            if (!confirm('Refund ' + amount + ' to the buyer? The platform fee is reversed with it.')) return;
            refund.disabled = true;
            refund.textContent = 'Refunding…';
            try {
              await request('/api/accounts/' + encodeURIComponent(account.company_id)
                + '/transactions/' + encodeURIComponent(tx.resource_id) + '/refund', { method: 'POST' });
              setStatus('Refund issued for ' + tx.resource_id + '. Reloading transactions…', 'success');
              await loadTransactions(account, refund);
            } catch (error) {
              refund.disabled = false;
              refund.textContent = 'Refund';
              setStatus(error instanceof Error ? error.message : 'Refund failed.', 'error');
            }
          });
          actions.append(refund);
        } else {
          actions.className = 'text-end text-secondary';
          actions.textContent = '—';
        }
        row.append(actions);
        txRows.append(row);
      }

      async function loadTransactions(account, button) {
        button.disabled = true;
        txCard.classList.add('hidden');
        txRows.replaceChildren();
        setStatus('Loading transactions for ' + (account.external_id ?? account.company_id) + '…');
        try {
          const data = await request('/api/accounts/' + encodeURIComponent(account.company_id) + '/transactions');
          const list = Array.isArray(data.transactions) ? data.transactions : [];
          txSubtitle.textContent = (account.external_id ?? account.company_id) + ' · ' + account.company_id;
          txEmpty.classList.toggle('hidden', list.length > 0);
          txWrap.classList.toggle('hidden', list.length === 0);
          for (const tx of list) renderTransactionRow(tx, account);
          txCard.classList.remove('hidden');
          setStatus(list.length
            ? list.length + (list.length === 1 ? ' transaction' : ' transactions') + ' loaded from Whop and the local webhook ledger.'
            : 'No transactions were found for this account.', 'success');
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Unable to load transactions.', 'error');
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
        const transactions = document.createElement('button');
        transactions.type = 'button';
        transactions.className = 'btn btn-sm btn-outline-secondary me-2';
        transactions.textContent = 'Transactions';
        transactions.addEventListener('click', () => loadTransactions(account, transactions));
        actions.append(transactions);
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
        if (account.suspension.suspended !== true) {
          const suspend = document.createElement('button');
          suspend.type = 'button';
          suspend.className = 'btn btn-sm btn-outline-danger ms-2';
          suspend.textContent = 'Suspend';
          suspend.addEventListener('click', () => suspendAccount(account, suspend));
          actions.append(suspend);
        }
        row.append(actions);
        rows.append(row);
      }

      async function createAccount() {
        const externalId = createExternalId.value.trim();
        const email = createEmail.value.trim();
        const country = createCountry.value.trim().toUpperCase();
        if (!externalId || !email || !/^[A-Z]{2}$/.test(country)) {
          setStatus('External ID, email, and a two-letter country are required.', 'error');
          return;
        }
        createButton.disabled = true;
        setStatus('Creating connected account…');
        try {
          const data = await request('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ external_id: externalId, email, country }),
          });
          createExternalId.value = '';
          createEmail.value = '';
          createCountry.value = '';
          await loadAccounts();
          setStatus((data.created ? 'Created ' : 'Found existing account ') + data.company_id + ' for ' + data.external_id + '.', 'success');
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Unable to create the connected account.', 'error');
        } finally {
          createButton.disabled = false;
        }
      }

      async function suspendAccount(account, button) {
        const label = account.external_id ?? account.company_id;
        if (!window.confirm('Suspend ' + label + '? The Whop API does not expose reactivation, so this cannot be undone from this panel.')) return;
        button.disabled = true;
        setStatus('Suspending ' + label + '…');
        try {
          await request('/api/accounts/' + encodeURIComponent(account.company_id) + '/suspend', { method: 'POST' });
          await loadAccounts();
          setStatus(label + ' is suspended.', 'success');
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Unable to suspend the account.', 'error');
          button.disabled = false;
        }
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
        txCard.classList.add('hidden');
        rows.replaceChildren();
        txRows.replaceChildren();
        count.textContent = '';
        setStatus('Loading connected accounts…');
        try {
          const data = await request('/api/accounts');
          for (const account of data.accounts) renderAccount(account);
          count.textContent = data.accounts.length + (data.accounts.length === 1 ? ' account' : ' accounts');
          createCard.classList.remove('hidden');
          if (data.accounts.length) {
            card.classList.remove('hidden');
            setStatus('Connected accounts refreshed from Whop.', 'success');
          } else {
            setStatus('No connected accounts were found for this platform. Create one above.', 'info');
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
      createButton.addEventListener('click', createAccount);
      for (const field of [createExternalId, createEmail, createCountry]) {
        field.addEventListener('keydown', (event) => { if (event.key === 'Enter') createAccount(); });
      }
    </script>
  </body>
</html>`;
