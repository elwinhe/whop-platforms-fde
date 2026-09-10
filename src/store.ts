import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SellerRow = {
  external_id: string;
  email: string;
  country: string;
  company_id: string;
};

export type LedgerRow = {
  resource_type: string;
  resource_id: string;
  seller_company_id: string;
  amount_minor: number | null;
  currency: string | null;
  status: string;
  event_type: string;
};

export class LedgerStore {
  readonly db: DatabaseSync;

  constructor(file = process.env.LEDGERLY_DB_PATH ?? "data/ledgerly.sqlite") {
    if (file !== ":memory:")
      mkdirSync(dirname(resolve(file)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file, { timeout: 5_000 });
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sellers (
        external_id TEXT PRIMARY KEY, email TEXT NOT NULL, country TEXT NOT NULL,
        company_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;
      CREATE TABLE IF NOT EXISTS onboarding_attempts (
        external_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','ambiguous','complete')),
        company_id TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;
      CREATE TABLE IF NOT EXISTS checkout_attempts (
        order_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','ambiguous','complete')),
        resource_id TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;
      CREATE TABLE IF NOT EXISTS webhook_events (
        event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, company_id TEXT,
        processing_status TEXT NOT NULL, payload TEXT NOT NULL,
        received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;
      CREATE TABLE IF NOT EXISTS ledger_entries (
        resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, seller_company_id TEXT NOT NULL,
        amount_minor INTEGER, currency TEXT, status TEXT NOT NULL, status_rank INTEGER NOT NULL,
        event_type TEXT NOT NULL, provider_event_id TEXT NOT NULL,
        PRIMARY KEY(resource_type, resource_id),
        FOREIGN KEY(provider_event_id) REFERENCES webhook_events(event_id)
      ) STRICT;
    `);
  }

  sellerByExternalId(externalId: string): SellerRow | undefined {
    return this.db
      .prepare(
        `
          SELECT external_id,email,country,company_id
          FROM sellers
          WHERE external_id=?
        `,
      )
      .get(externalId) as SellerRow | undefined;
  }

  sellerByCompanyId(companyId: string): SellerRow | undefined {
    return this.db
      .prepare(
        `
          SELECT external_id,email,country,company_id
          FROM sellers
          WHERE company_id=?
        `,
      )
      .get(companyId) as SellerRow | undefined;
  }

  saveSeller(row: SellerRow): void {
    this.db
      .prepare(
        `
          INSERT INTO sellers(external_id,email,country,company_id)
          VALUES(?,?,?,?)
          ON CONFLICT(external_id) DO UPDATE
          SET email=excluded.email,country=excluded.country,company_id=excluded.company_id
        `,
      )
      .run(row.external_id, row.email, row.country, row.company_id);
  }

  onboardingAttempt(
    externalId: string,
  ):
    | { fingerprint: string; status: string; company_id: string | null }
    | undefined {
    return this.db
      .prepare(
        `
          SELECT fingerprint,status,company_id
          FROM onboarding_attempts
          WHERE external_id=?
        `,
      )
      .get(externalId) as
      | { fingerprint: string; status: string; company_id: string | null }
      | undefined;
  }

  beginOnboarding(externalId: string, requestFingerprint: string): boolean {
    return (
      this.db
        .prepare(
          `
            INSERT OR IGNORE INTO onboarding_attempts(external_id,fingerprint,status)
            VALUES(?,?,'pending')
          `,
        )
        .run(externalId, requestFingerprint).changes === 1
    );
  }

  finishOnboarding(externalId: string, row: SellerRow): void {
    this.db.exec("BEGIN IMMEDIATE");

    try {
      this.saveSeller(row);
      this.db
        .prepare(
          `
            UPDATE onboarding_attempts
            SET status='complete',company_id=?,updated_at=CURRENT_TIMESTAMP
            WHERE external_id=?
          `,
        )
        .run(row.company_id, externalId);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  markOnboardingAmbiguous(externalId: string): void {
    this.db
      .prepare(
        `
          UPDATE onboarding_attempts
          SET status='ambiguous',updated_at=CURRENT_TIMESTAMP
          WHERE external_id=?
        `,
      )
      .run(externalId);
  }

  clearOnboardingAttempt(externalId: string): void {
    this.db
      .prepare(
        `
          DELETE FROM onboarding_attempts
          WHERE external_id=?
        `,
      )
      .run(externalId);
  }

  checkoutAttempt(
    orderId: string,
  ):
    | { fingerprint: string; status: string; resource_id: string | null }
    | undefined {
    return this.db
      .prepare(
        `
          SELECT fingerprint,status,resource_id
          FROM checkout_attempts
          WHERE order_id=?
        `,
      )
      .get(orderId) as
      | { fingerprint: string; status: string; resource_id: string | null }
      | undefined;
  }

  beginCheckout(orderId: string, value: string): boolean {
    return (
      this.db
        .prepare(
          `
            INSERT OR IGNORE INTO checkout_attempts(order_id,fingerprint,status)
            VALUES(?,?,'pending')
          `,
        )
        .run(orderId, value).changes === 1
    );
  }

  finishCheckout(orderId: string, resourceId: string): void {
    this.db
      .prepare(
        `
          UPDATE checkout_attempts
          SET status='complete',resource_id=?,updated_at=CURRENT_TIMESTAMP
          WHERE order_id=?
        `,
      )
      .run(resourceId, orderId);
  }

  markCheckoutAmbiguous(orderId: string): void {
    this.db
      .prepare(
        `
          UPDATE checkout_attempts
          SET status='ambiguous',updated_at=CURRENT_TIMESTAMP
          WHERE order_id=?
        `,
      )
      .run(orderId);
  }

  clearCheckoutAttempt(orderId: string): void {
    this.db
      .prepare(
        `
          DELETE FROM checkout_attempts
          WHERE order_id=?
        `,
      )
      .run(orderId);
  }

  persistWebhook(event: {
    id: string;
    type: string;
    companyId: string | null;
    payload: string;
    status: string;
    ledger?: Omit<LedgerRow, "event_type"> & {
      event_type: string;
      status_rank: number;
    };
  }): "duplicate" | "stored" {
    this.db.exec("BEGIN IMMEDIATE");

    try {
      const inserted = this.db
        .prepare(
          `
            INSERT OR IGNORE INTO webhook_events(event_id,event_type,company_id,processing_status,payload)
            VALUES(?,?,?,?,?)
          `,
        )
        .run(
          event.id,
          event.type,
          event.companyId,
          event.status,
          event.payload,
        );

      if (inserted.changes === 0) {
        this.db.exec("ROLLBACK");
        return "duplicate";
      }

      if (event.ledger) {
        const row = event.ledger;
        this.db
          .prepare(
            `INSERT INTO ledger_entries(resource_type,resource_id,seller_company_id,amount_minor,currency,status,status_rank,event_type,provider_event_id)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(resource_type,resource_id) DO UPDATE SET
          amount_minor=CASE WHEN excluded.status_rank>=ledger_entries.status_rank
            THEN excluded.amount_minor
            ELSE ledger_entries.amount_minor END,
          currency=CASE WHEN excluded.status_rank>=ledger_entries.status_rank
            THEN excluded.currency
            ELSE ledger_entries.currency END,
          status=CASE WHEN excluded.status_rank>=ledger_entries.status_rank
            THEN excluded.status
            ELSE ledger_entries.status END,
          status_rank=MAX(excluded.status_rank,ledger_entries.status_rank),
          event_type=CASE WHEN excluded.status_rank>=ledger_entries.status_rank
            THEN excluded.event_type
            ELSE ledger_entries.event_type END,
          provider_event_id=CASE WHEN excluded.status_rank>=ledger_entries.status_rank
            THEN excluded.provider_event_id
            ELSE ledger_entries.provider_event_id END`,
          )
          .run(
            row.resource_type,
            row.resource_id,
            row.seller_company_id,
            row.amount_minor,
            row.currency,
            row.status,
            row.status_rank,
            row.event_type,
            event.id,
          );
      }

      this.db.exec("COMMIT");
      return "stored";
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  ledgerForSeller(companyId: string): LedgerRow[] {
    return this.db
      .prepare(
        `
          SELECT resource_type,resource_id,seller_company_id,amount_minor,currency,status,event_type
          FROM ledger_entries
          WHERE seller_company_id=?
          ORDER BY resource_type,resource_id
        `,
      )
      .all(companyId) as LedgerRow[];
  }

  close(): void {
    this.db.close();
  }
}
