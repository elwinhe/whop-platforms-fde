// Consumed-field contracts from https://docs.whop.com/openapi/api-v1-native.json
// (2026-09-09). Inline product/application_fee_amount follow the assessment;
// those two fields are absent from the published native checkout schema.
export interface CheckoutRequest {
  mode: "payment";
  account_id: string;
  plan: {
    product: { title: string; external_identifier: string };
    visibility: "hidden";
    release_method: "buy_now";
    plan_type: "one_time";
    initial_price: number;
    currency: string;
    application_fee_amount?: number;
  };
  metadata: { order_id: string };
  redirect_url: string;
}

export interface CheckoutResponse {
  id: string;
  account_id: string;
  purchase_url?: string | null;
}

export interface TransferRequest {
  origin_id: string;
  destination_id: string;
  amount: number;
  currency: string;
  idempotence_key: string;
  metadata: { order_id: string };
}

export interface TransferResponse {
  id: string;
  object: "transfer";
  status: "processing" | "succeeded" | "failed";
  amount: number;
  currency: string;
  origin: { id: string };
  destination: { id: string };
}

export interface RefundRequest {
  partial_amount?: number | null;
}

export interface PaymentResponse {
  id: string;
  status: string;
  account_id: string | null;
  refundable: boolean;
}

export interface AccountResponse {
  id: string;
}

export interface ActivityQuery {
  account_id: string;
  limit: string;
  cursor?: string;
}

export interface ActivityResponse {
  data: Array<{
    id: string;
    object: "ledger_activity";
    amount: string;
    currency: { code: string; precision: string };
    line_type: string;
    source: { id: string; object: string } | null;
  }>;
  page_info: {
    has_next_page: boolean;
    end_cursor: string | null;
    has_previous_page: boolean;
    start_cursor: string | null;
  };
}

export interface Operations {
  checkout: { request: CheckoutRequest; response: CheckoutResponse };
  transfer: { request: TransferRequest; response: TransferResponse };
  refund: { request: RefundRequest; response: PaymentResponse };
  payment: { request: undefined; response: PaymentResponse };
  account: { request: undefined; response: AccountResponse };
  activity: { request: undefined; response: ActivityResponse };
}
