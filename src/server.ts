import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/", (c) =>
  c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ledgerly</title></head><body><main><h1>Ledgerly payouts</h1><p>Embedded payouts will be implemented here after connected-account access and token minting are complete.</p></main></body></html>`),
);

const todo = (operation: string, safety?: string) => ({
  error: "not_implemented",
  operation,
  message: safety ?? "Scaffold only; no financial operation was attempted.",
});

app.post("/api/onboarding", (c) => c.json(todo("onboarding"), 501));
app.post("/api/checkout", (c) => c.json(todo("checkout"), 501));
app.post("/api/payout-token", (c) => c.json(todo("payout-token"), 501));
app.post("/api/webhook", (c) =>
  c.json(
    todo(
      "webhook",
      "Webhook rejected: signature verification and durable idempotent persistence are not implemented.",
    ),
    501,
  ),
);

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Ledgerly scaffold listening on http://${hostname}:${info.port}`);
});
