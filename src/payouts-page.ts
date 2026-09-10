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
          <span class="badge bg-yellow-lt">Sandbox</span>
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
                  >Open hosted portal ↗</a>
                </div>
                <div class="form-hint" id="session-help">
                  Use your Ledgerly session token to access this sandbox account.
                </div>
                <div id="status" class="payout-status" role="status" aria-live="polite">
                  Connect an account to view its payout details.
                </div>
              </div>
            </section>
            <div id="elements" class="row row-cards hidden">
              <section class="col-lg-7" aria-labelledby="balance-heading">
                <div class="card h-100">
                  <div class="card-header">
                    <h2 class="card-title" id="balance-heading">Balance</h2>
                  </div>
                  <div class="card-body">
                    <div id="balance" class="slot">Loading balance…</div>
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
                    <div id="withdraw" class="slot">Loading withdrawal controls…</div>
                  </div>
                </div>
              </section>
              <section class="col-12" aria-labelledby="history-heading">
                <div class="card">
                  <div class="card-header">
                    <h2 class="card-title" id="history-heading">Payout history</h2>
                  </div>
                  <div class="card-body">
                    <div id="history" class="slot">Loading withdrawal history…</div>
                  </div>
                </div>
              </section>
            </div>
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

      load.addEventListener('click', async () => {
        const sellerToken = tokenInput.value;
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
        tokenInput.disabled = true;
        status.className = 'payout-status';
        status.textContent = 'Connecting your seller account…';
        elements.classList.remove('hidden');
        portal.classList.add('hidden');
        portal.removeAttribute('href');
        try {
          session?.destroy();
          session = undefined;
          const profile = await request('/api/payout-context');
          try {
            const link = await request('/api/payout-portal', { method: 'POST' });
            const url = new URL(link.url);
            if (url.protocol !== 'https:') throw new Error('Invalid portal URL');
            portal.href = url.href;
            portal.classList.remove('hidden');
          } catch {
            status.textContent = 'Hosted portal unavailable. Loading embedded payouts…';
          }

          const { loadWhopElements } = await import('/vendor/whop-elements/index.mjs');
          const whop = await loadWhopElements({ environment: 'sandbox' });
          if (!whop) throw new Error('Whop Elements is unavailable.');
          let ready = 0;
          const onReady = () => {
            ready += 1;
            if (ready === 3) status.textContent = 'Payout controls loaded.';
          };
          const onError = () => {
            status.className = 'payout-status error';
            status.textContent = portal.hasAttribute('href')
              ? 'Embedded payouts could not load. Open the hosted portal to continue.'
              : 'Payouts could not load. Please try connecting again.';
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
          session.createElement('balance-element', { onReady }).mount('#balance');
          session.createElement('withdraw-button-element', { onReady }).mount('#withdraw');
          session.createElement('withdrawals-element', { onReady }).mount('#history');
        } catch (error) {
          session?.destroy();
          session = undefined;
          status.className = 'payout-status error';
          status.textContent =
            (error instanceof Error ? error.message : 'Unable to load payouts.') +
            (portal.hasAttribute('href') ? ' Open the hosted portal to continue.' : '');
          elements.classList.add('hidden');
        } finally {
          load.disabled = false;
          tokenInput.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
