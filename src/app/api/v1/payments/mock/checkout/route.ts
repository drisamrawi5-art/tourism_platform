import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { getPaymentAdapter } from '@/lib/payments/registry';
import { signMockPayload } from '@/lib/payments/providers/mock';

/**
 * GET /api/v1/payments/mock/checkout — DEVELOPMENT ONLY.
 *
 * Renders a tiny hosted-checkout stand-in with two buttons that POST signed
 * events to /api/v1/payments/mock/simulate. Refuses to exist in production
 * or when the active provider is not the mock adapter. No secrets in HTML.
 */

export const dynamic = 'force-dynamic';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON-stringify for inline <script> — escapes `<` so no tag can break out. */
function embed(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function notFound(): Response {
  return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
}

export async function GET(req: Request): Promise<Response> {
  if (env.isProd || getPaymentAdapter().key !== 'mock') return notFound();

  const url = new URL(req.url);
  const paymentId = url.searchParams.get('paymentId') ?? '';
  const sig = url.searchParams.get('sig') ?? '';

  if (!paymentId || sig !== signMockPayload(paymentId, env.paymentWebhookSecret)) {
    return notFound();
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { booking: { select: { reference: true } } },
  });
  if (!payment) return notFound();

  const reference = esc(payment.booking.reference);
  const amount = esc(payment.amount.toString());
  const currency = esc(payment.currency);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Mock checkout · Visit Imedwan</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f7f9fb; color: #17222e; display: grid; min-height: 100vh; margin: 0; place-items: center; }
  main { background: #fff; border: 1px solid #d9e2e9; border-radius: 12px; padding: 2rem; max-width: 26rem; width: calc(100% - 2rem); }
  h1 { font-size: 1.1rem; margin: 0 0 .5rem; }
  p { color: #51636f; font-size: .9rem; line-height: 1.5; }
  .actions { display: flex; gap: .75rem; margin: 1.25rem 0 .5rem; }
  button { flex: 1; padding: .65rem 1rem; border: 0; border-radius: 8px; font-size: .95rem; font-weight: 600; cursor: pointer; }
  .ok { background: #1f7a58; color: #fff; }
  .fail { background: #c44536; color: #fff; }
  #result { min-height: 1.2rem; font-size: .85rem; color: #51636f; }
  a { color: #1678ab; }
</style>
</head>
<body>
<main>
  <h1>Mock payment checkout</h1>
  <p>Development only — no money moves.<br>
     Booking <strong>${reference}</strong> — ${amount} ${currency}</p>
  <div class="actions">
    <button class="ok" id="btn-success" type="button">Simulate success</button>
    <button class="fail" id="btn-failure" type="button">Simulate failure</button>
  </div>
  <p id="result"></p>
  <p><a href="/">← Back</a></p>
</main>
<script>
  const paymentId = ${embed(payment.id)};
  const sig = ${embed(sig)};
  async function simulate(outcome) {
    const out = document.getElementById("result");
    out.textContent = "Sending " + outcome + "…";
    try {
      const res = await fetch("/api/v1/payments/mock/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: paymentId, outcome: outcome, sig: sig })
      });
      const json = await res.json().catch(function () { return null; });
      out.textContent = res.ok
        ? "Event processed — you can go back now."
        : "Failed (" + (json && json.error ? json.error.code : res.status) + ")";
    } catch (e) {
      out.textContent = "Request failed.";
    }
  }
  document.getElementById("btn-success").addEventListener("click", function () { simulate("success"); });
  document.getElementById("btn-failure").addEventListener("click", function () { simulate("failure"); });
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
