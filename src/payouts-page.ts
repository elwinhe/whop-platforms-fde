export const payoutsPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Ledgerly · Payouts</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@tabler/core@1.5.1/dist/css/tabler.min.css"
      integrity="sha384-tLWyEXulonaekaXL6+fCZQJv/MujuGIpVTBzuVEpwSqFDEfLkPA/PAYGTSBBJO2X"
      crossorigin="anonymous"
    />
    <style>
      :root {
        color-scheme: light;
      }
      .ledgerly-container {
        max-width: 1120px;
      }
      .brand-mark {
        font-weight: 800;
        letter-spacing: -0.06em;
      }
      .session-input {
        min-width: 0;
      }
      .payout-status {
        color: var(--tblr-secondary);
        min-height: 24px;
        margin-top: 16px;
      }
      .payout-status.error {
        color: var(--tblr-danger);
      }
      .slot {
        min-height: 80px;
      }
      .hidden {
        display: none !important;
      }
      :focus-visible {
        outline: 2px solid var(--tblr-primary);
        outline-offset: 3px;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="navbar navbar-expand-md d-print-none">
        <div class="container-xl ledgerly-container">
          <a class="navbar-brand" href="/" aria-label="Ledgerly home">
            <span class="avatar avatar-sm bg-primary text-white me-2 brand-mark" aria-hidden="true">L</span>Ledgerly
          </a>
          <div class="d-flex align-items-center gap-3">
            <a class="nav-link" href="/accounts">Connected accounts</a>
            <span class="badge __WHOP_ENV_BADGE_CLASS__">__WHOP_ENV_TITLE__</span>
          </div>
        </div>
      </header>
      <main class="page-wrapper">
        <div class="page-header">
          <div class="container-xl ledgerly-container">
            <div class="page-pretitle">Seller workspace</div>
            <h1 class="page-title">Payouts</h1>
            <p class="text-secondary mt-2">
              Manage your balance, withdraw funds, and keep track of your payouts.
            </p>
          </div>
        </div>
        <div class="page-body">
          <div class="container-xl ledgerly-container">
            <section class="card mb-4" aria-labelledby="session-heading">
              <div class="card-header">
                <h2 class="card-title" id="session-heading">Connect your seller account</h2>
              </div>
              <div class="card-body">
                <label class="form-label" for="token">Seller session token</label>
                <div class="d-flex gap-2 flex-column flex-sm-row">
                  <input
                    class="form-control session-input"
                    id="token"
                    type="password"
                    autocomplete="off"
                    placeholder="Enter your seller session token"
                    aria-describedby="session-help"
                  />
                  <button class="btn btn-primary" id="load">Load payouts</button>
                  <a
                    id="portal"
                    class="btn btn-outline-primary hidden"
                    target="_blank"
                    rel="noreferrer"
                  >Whop portal ↗</a>
                </div>
                <div id="status" class="payout-status" role="status" aria-live="polite">
                  Connect an account to view its payout details.
                </div>
              </div>
            </section>
            <section id="checkout-card" class="card mb-4 hidden" aria-labelledby="checkout-heading">
              <div class="card-header">
                <h2 class="card-title" id="checkout-heading">__WHOP_ENV_TITLE__ checkout</h2>
              </div>
              <div class="card-body">
                <p class="text-secondary">Acme Preset Pack · $25 USD · $2 platform fee (8%). Uses the seller session entered above.</p>
                <label class="form-label" for="checkout-order">Order ID</label>
                <input class="form-control mb-3" id="checkout-order" aria-describedby="checkout-help" />
                <p class="text-secondary small" id="checkout-help">Keep this ID when retrying. Change it only for a new order. Creating a link does not charge a card.</p>
                <div class="d-flex gap-2 flex-wrap">
                  <button class="btn btn-primary" id="checkout-create">Create $25 __WHOP_ENV_LABEL__ checkout</button>
                  <a class="btn btn-outline-primary hidden" id="checkout-link" target="_blank" rel="noreferrer">Open __WHOP_ENV_LABEL__ checkout ↗</a>
                </div>
                <div id="checkout-status" class="payout-status" role="status" aria-live="polite"></div>
              </div>
            </section>
            <div id="elements" class="row row-cards hidden">
              <section class="col-lg-7" aria-labelledby="balance-heading">
                <div class="card h-100">
                  <div class="card-header">
                    <h2 class="card-title" id="balance-heading">Balance</h2>
                  </div>
                  <div class="card-body">
                    <div class="slot-loading" id="balance-loading">Loading balance…</div>
                    <div id="balance" class="slot"></div>
                  </div>
                </div>
              </section>
              <section class="col-lg-5" aria-labelledby="withdraw-heading">
                <div class="card h-100">
                  <div class="card-header">
                    <h2 class="card-title" id="withdraw-heading">Withdraw funds</h2>
                  </div>
                  <div class="card-body">
                    <p class="text-secondary">Choose a payout destination and withdrawal method.</p>
                    <div class="slot-loading" id="withdraw-loading">Loading withdrawal controls…</div>
                    <div id="withdraw" class="slot"></div>
                  </div>
                </div>
              </section>
            </div>
            <section id="transactions-card" class="card mt-4 hidden" aria-labelledby="transactions-heading">
              <div class="card-header">
                <h2 class="card-title" id="transactions-heading">Transactions</h2>
                <span class="text-secondary ms-auto" id="transactions-count"></span>
              </div>
              <div class="card-body" id="transactions-status-body">
                <div id="transactions-status" class="payout-status" role="status" aria-live="polite">Loading transactions…</div>
              </div>
              <div class="table-responsive hidden" id="transactions-table-wrap">
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
              <div class="card-footer text-secondary small">
                Net is the seller share after the 8% platform fee and Whop processing fees. Paid sales stay pending until Whop settles funds to the available balance.
              </div>
            </section>
            <p class="text-secondary small mt-4">
              Payouts powered by Whop. If embedded controls cannot load, use the hosted portal.
            </p>
          </div>
        </div>
      </main>
    </div>
    <script type="module">
      const tokenInput = document.querySelector('#token');
      const load = document.querySelector('#load');
      const status = document.querySelector('#status');
      const elements = document.querySelector('#elements');
      const portal = document.querySelector('#portal');
      let session;
      let loadAttempt = 0;

      const txCard = document.querySelector('#transactions-card');
      const txStatusBody = document.querySelector('#transactions-status-body');
      const txStatus = document.querySelector('#transactions-status');
      const txWrap = document.querySelector('#transactions-table-wrap');
      const txRows = document.querySelector('#transactions-rows');
      const txCount = document.querySelector('#transactions-count');

      function formatMoney(minor, decimals, currency) {
        if (typeof minor !== 'number') return '—';
        const value = minor / 10 ** (decimals ?? 2);
        try {
          return new Intl.NumberFormat(undefined, { style: 'currency', currency: (currency ?? 'usd').toUpperCase() }).format(value);
        } catch {
          return value.toFixed(decimals ?? 2) + (currency ? ' ' + currency.toUpperCase() : '');
        }
      }

      function renderTransaction(tx, request, attempt) {
        const row = document.createElement('tr');
        const date = document.createElement('td');
        date.className = 'text-nowrap';
        date.textContent = tx.occurred_at ? new Date(tx.occurred_at).toLocaleString() : '—';
        row.append(date);
        const description = document.createElement('td');
        const title = document.createElement('div');
        title.textContent = tx.description || 'Transaction';
        const ref = document.createElement('div');
        ref.className = 'text-secondary small';
        ref.textContent = (tx.order_id ? 'Order ' + tx.order_id : tx.resource_id)
          + (tx.ledger_recorded ? ' · in webhook ledger' : '');
        description.append(title, ref);
        row.append(description);
        for (const amount of [tx.gross_minor, tx.fee_minor, tx.net_minor]) {
          const cell = document.createElement('td');
          cell.className = 'text-end text-nowrap';
          cell.textContent = formatMoney(amount, tx.currency_decimals, tx.currency);
          row.append(cell);
        }
        const statusCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'badge ' + (
          tx.settlement === 'refunded' || tx.settlement === 'partially_refunded'
            ? 'bg-orange-lt'
            : tx.settlement === 'pending'
              ? 'bg-yellow-lt'
              : ['paid', 'succeeded', 'completed'].includes(tx.status)
                ? 'bg-green-lt'
                : 'bg-secondary-lt'
        );
        badge.textContent = String(tx.status || 'unknown').replaceAll('_', ' ');
        statusCell.append(badge);
        if (tx.settlement) {
          const note = document.createElement('div');
          note.className = 'text-secondary small mt-1';
          note.textContent = tx.settlement === 'pending' ? 'settlement pending' : tx.settlement.replaceAll('_', ' ');
          statusCell.append(note);
        }
        row.append(statusCell);
        const actions = document.createElement('td');
        actions.className = 'text-end';
        if (tx.source === 'payment' && tx.status === 'paid' && tx.settlement !== 'refunded') {
          const note = document.createElement('div');
          note.className = 'text-danger small mt-1';
          const refund = document.createElement('button');
          refund.type = 'button';
          refund.className = 'btn btn-sm btn-outline-danger';
          refund.textContent = 'Refund';
          refund.addEventListener('click', async () => {
            const amount = formatMoney(tx.gross_minor, tx.currency_decimals, tx.currency);
            if (!confirm('Refund ' + amount + ' to the buyer? The platform fee is not returned automatically.')) return;
            refund.disabled = true;
            refund.textContent = 'Refunding…';
            note.textContent = '';
            try {
              await request('/api/transactions/' + encodeURIComponent(tx.resource_id) + '/refund', { method: 'POST' });
              await loadTransactions(request, attempt);
            } catch (error) {
              refund.disabled = false;
              refund.textContent = 'Refund';
              note.textContent = error instanceof Error ? error.message : 'Refund failed.';
            }
          });
          actions.append(refund, note);
        } else {
          actions.className = 'text-end text-secondary';
          actions.textContent = '—';
        }
        row.append(actions);
        txRows.append(row);
      }

      async function loadTransactions(request, attempt) {
        txCard.classList.remove('hidden');
        txWrap.classList.add('hidden');
        txRows.replaceChildren();
        txCount.textContent = '';
        txStatusBody.classList.remove('hidden');
        txStatus.className = 'payout-status';
        txStatus.textContent = 'Loading transactions…';
        try {
          const data = await request('/api/transactions');
          if (attempt !== loadAttempt) return;
          const list = Array.isArray(data.transactions) ? data.transactions : [];
          if (!list.length) {
            txStatus.textContent = 'No transactions yet. Create and pay a __WHOP_ENV_LABEL__ checkout above.';
            return;
          }
          for (const tx of list) renderTransaction(tx, request, attempt);
          txCount.textContent = list.length + (list.length === 1 ? ' transaction' : ' transactions');
          txStatusBody.classList.add('hidden');
          txWrap.classList.remove('hidden');
        } catch (error) {
          if (attempt !== loadAttempt) return;
          txStatus.className = 'payout-status error';
          txStatus.textContent = error instanceof Error ? error.message : 'Unable to load transactions.';
        }
      }

      const checkoutCard = document.querySelector('#checkout-card');
      const checkoutButton = document.querySelector('#checkout-create');
      const checkoutOrder = document.querySelector('#checkout-order');
      const checkoutLink = document.querySelector('#checkout-link');
      const checkoutStatus = document.querySelector('#checkout-status');
      checkoutOrder.value = 'demo-' + crypto.randomUUID();
      const clearCheckout = () => {
        checkoutLink.classList.add('hidden');
        checkoutLink.removeAttribute('href');
        checkoutStatus.textContent = '';
      };
      tokenInput.addEventListener('input', () => {
        clearCheckout();
        checkoutCard.classList.add('hidden');
      });
      checkoutOrder.addEventListener('input', clearCheckout);
      checkoutButton.addEventListener('click', async () => {
        clearCheckout();
        checkoutStatus.className = 'payout-status';
        if (!tokenInput.value.trim()) {
          checkoutStatus.textContent = 'Enter your seller session token above first.';
          return;
        }
        checkoutButton.disabled = checkoutOrder.disabled = tokenInput.disabled = load.disabled = true;
        checkoutStatus.textContent = 'Creating __WHOP_ENV_LABEL__ checkout…';
        try {
          const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + tokenInput.value,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              order_id: checkoutOrder.value.trim(),
              amount_minor: 2500,
              currency: 'usd',
              title: 'Acme Preset Pack',
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || data.provider?.message || data.error || 'Checkout failed.');
          const url = new URL(data.checkout?.purchase_url);
          const checkoutHost = '__WHOP_CHECKOUT_HOST__';
          if (url.protocol !== 'https:' || (url.hostname !== checkoutHost && !url.hostname.endsWith('.' + checkoutHost)))
            throw new Error('No valid __WHOP_ENV_LABEL__ checkout URL returned.');
          checkoutLink.href = url.href;
          checkoutLink.classList.remove('hidden');
          checkoutStatus.textContent = 'Checkout ready: $25 USD with a $2 platform fee. Open the link to complete payment.';
        } catch (error) {
          checkoutStatus.className = 'payout-status error';
          checkoutStatus.textContent = error instanceof Error ? error.message : 'Unable to create checkout.';
        } finally {
          checkoutButton.disabled = checkoutOrder.disabled = tokenInput.disabled = load.disabled = false;
        }
      });

      load.addEventListener('click', async () => {
        const attempt = ++loadAttempt;
        const sellerToken = tokenInput.value;
        const readySlots = new Set();
        let payoutError = '';
        const updateStatus = () => {
          if (attempt !== loadAttempt) return;
          status.className = payoutError ? 'payout-status error' : 'payout-status';
          status.textContent = payoutError
            ? payoutError + (portal.hasAttribute('href') ? ' Open the hosted portal to continue.' : '')
            : readySlots.size === 2
              ? 'Payout controls loaded.'
              : 'Loading payout controls (' + readySlots.size + '/2 ready)…';
        };
        async function request(url, options = {}) {
          const response = await fetch(url, {
            ...options,
            headers: {
              Authorization: 'Bearer ' + sellerToken,
              Accept: 'application/json',
              ...options.headers,
            },
          });
          const data = await response.json().catch(() => ({ error: 'Invalid server response' }));
          if (response.status === 401)
            throw new Error('Enter a valid seller session token to load payouts.');
          if (!response.ok)
            throw new Error(
              data.error?.message || data.message || data.error || 'HTTP ' + response.status,
            );
          return data;
        }

        load.disabled = true;
        checkoutButton.disabled = true;
        tokenInput.disabled = true;
        status.className = 'payout-status';
        status.textContent = 'Connecting your seller account…';
        elements.classList.remove('hidden');
        for (const loading of elements.querySelectorAll('.slot-loading')) loading.classList.remove('hidden');
        portal.classList.add('hidden');
        portal.removeAttribute('href');
        txCard.classList.add('hidden');
        let tokenValidated = false;
        try {
          session?.destroy();
          session = undefined;
          const profile = await request('/api/payout-context');
          tokenValidated = true;
          checkoutCard.classList.remove('hidden');
          updateStatus();
          void loadTransactions(request, attempt);
          void request('/api/payout-portal', { method: 'POST' })
            .then((link) => {
              if (attempt !== loadAttempt) return;
              const url = new URL(link.url);
              if (url.protocol !== 'https:') throw new Error('Invalid portal URL');
              portal.href = url.href;
              portal.classList.remove('hidden');
              updateStatus();
            })
            .catch(() => {
              if (attempt !== loadAttempt) return;
              portal.classList.add('hidden');
              portal.removeAttribute('href');
            });

          const { loadWhopElements } = await import('/vendor/whop-elements/index.mjs');
          const whop = await loadWhopElements({ environment: '__WHOP_ENV__' });
          if (!whop) throw new Error('Whop Elements is unavailable.');
          const onReady = (slot) => () => {
            if (attempt !== loadAttempt) return;
            document.querySelector(slot + '-loading')?.classList.add('hidden');
            readySlots.add(slot);
            updateStatus();
          };
          const onError = () => {
            if (attempt !== loadAttempt) return;
            payoutError = 'Embedded payouts could not load. Please try connecting again.';
            updateStatus();
          };
          session = whop.createPayoutsSession({
            companyId: profile.company_id,
            redirectUrl: location.origin + '/',
            token: async ({ abortSignal }) => {
              const value = await request('/api/payout-token', {
                method: 'POST',
                signal: abortSignal,
              });
              return value.token;
            },
          });
          session.on('error', onError);
          session.on('tokenRefreshError', onError);
          session.createElement('balance-element', { onReady: onReady('#balance') }).mount('#balance');
          session.createElement('withdraw-button-element', { onReady: onReady('#withdraw') }).mount('#withdraw');
        } catch (error) {
          session?.destroy();
          session = undefined;
          payoutError = error instanceof Error ? error.message : 'Unable to load payouts.';
          updateStatus();
          elements.classList.add('hidden');
          if (!tokenValidated) checkoutCard.classList.add('hidden');
        } finally {
          load.disabled = false;
          checkoutButton.disabled = false;
          tokenInput.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
