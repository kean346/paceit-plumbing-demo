import { test } from "node:test";
import assert from "node:assert/strict";
import {
  totals,
  quoteSchema,
  customerSchema,
  effectiveStatus,
  metrics,
  type Quote,
} from "../src/lib/domain";
import { NextRequest } from "next/server";
import { POST, GET } from "../src/app/api/workspace/route";
const lines = [{ description: "Labour", quantity: 1.5, unitCents: 101 }];
test("rounds each line half up before discount and tax", () =>
  assert.deepEqual(totals(lines, 2, 1500), {
    subtotalCents: 152,
    discountCents: 2,
    taxCents: 23,
    totalCents: 173,
  }));
test("rounds half-cent quantity result up", () =>
  assert.equal(
    totals([{ description: "Parts", quantity: 0.01, unitCents: 50 }], 0, 0)
      .totalCents,
    1,
  ));
test("rejects a discount larger than subtotal", () =>
  assert.throws(() => totals(lines, 200, 0), /Discount/));
test("zero tax and full discount produce zero total", () =>
  assert.equal(totals(lines, 152, 0).totalCents, 0));
test("real email domains are rejected in the demo", () =>
  assert.equal(
    customerSchema.safeParse({
      name: "Demo",
      address: "Fictional",
      email: "demo@gmail.com",
    }).success,
    false,
  ));
test("invalid calendar dates and fractional cents are rejected", () => {
  const input = {
    customerId: "82b63eef-ed6e-442d-b94c-a043a412ea54",
    title: "Test",
    jobAddress: "Test",
    issueDate: "2026-02-28",
    expiryDate: "2026-02-30",
    followUp: "",
    lines,
    discountCents: 0,
    taxBps: 1500,
    notes: "",
    terms: "Demo",
  };
  assert.equal(quoteSchema.safeParse(input).success, false);
  assert.equal(
    quoteSchema.safeParse({
      ...input,
      expiryDate: "2026-03-01",
      lines: [{ ...lines[0], unitCents: 1.1 }],
    }).success,
    false,
  );
});
test("only sent quotes expire and remain valid on the expiry date", () => {
  assert.equal(
    effectiveStatus({ status: "sent", expiryDate: "2026-10-19" }, "2026-10-19"),
    "sent",
  );
  assert.equal(
    effectiveStatus({ status: "sent", expiryDate: "2026-10-18" }, "2026-10-19"),
    "expired",
  );
  assert.equal(
    effectiveStatus(
      { status: "accepted", expiryDate: "2026-10-18" },
      "2026-10-19",
    ),
    "accepted",
  );
});
test("metrics exclude archives and expired sent quotes from outstanding", () => {
  const base = {
    createdAt: "2026-10-01T00:00:00Z",
    expiryDate: "2026-10-30",
    followUp: "2026-10-19",
    followUpDone: false,
    totalCents: 100,
    archived: false,
  };
  const quotes = [
    { ...base, status: "sent" },
    { ...base, status: "sent", expiryDate: "2026-10-18" },
    { ...base, status: "accepted" },
    { ...base, status: "accepted", archived: true },
  ] as Quote[];
  const m = metrics(quotes, "2026-10-19");
  assert.equal(m.month, 300);
  assert.equal(m.outstanding, 100);
  assert.equal(m.accepted, 100);
  assert.equal(m.due.length, 1);
});
const request = (body: unknown, origin = "http://localhost:3000") =>
  new NextRequest("http://localhost:3000/api/workspace", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test("cross-origin mutations are blocked before touching database", async () =>
  assert.equal(
    (
      await POST(
        request({ action: "reset", data: "RESET" }, "https://other.example"),
      )
    ).status,
    403,
  ));
test("null payload returns a validation error", async () =>
  assert.equal((await POST(request(null))).status, 400));
test("missing session cannot read workspace", async () =>
  assert.equal(
    (await GET(new NextRequest("http://localhost:3000/api/workspace"))).status,
    401,
  ));
