import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import {
  totals,
  effectiveStatus,
  metrics,
  quoteSchema,
  type State,
  type QuoteInput,
} from "../src/lib/domain";
async function main() {
  assert.deepEqual(
    totals([{ description: "Test", quantity: 1.5, unitCents: 101 }], 2, 1500),
    { subtotalCents: 152, discountCents: 2, taxCents: 23, totalCents: 173 },
  );
  assert.equal(
    totals([{ description: "Test", quantity: 0.01, unitCents: 50 }], 0, 0)
      .totalCents,
    1,
  );
  assert.throws(() =>
    totals([{ description: "Test", quantity: 1, unitCents: 100 }], 101, 0),
  );
  assert.equal(
    effectiveStatus({ status: "sent", expiryDate: "2020-01-01" }, "2026-01-01"),
    "expired",
  );
  console.log(
    "PASS: integer-cent rounding, fractional quantities, discount bounds and expiry",
  );
  const repl = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: "7.0.14" },
  });
  process.env.MONGODB_URI = repl.getUri();
  process.env.MONGODB_DB = "flow_integration";
  const { bootstrap, readState, mutate } = await import("../src/lib/store");
  const client = await new MongoClient(process.env.MONGODB_URI).connect();
  try {
    const a = await bootstrap(),
      b = await bootstrap();
    const read = async (t: string) => (await readState(t)) as unknown as State;
    const sa = await read(a),
      sb = await read(b);
    assert.equal(sa.customers.length, 12);
    assert.equal(sa.quotes.length, 25);
    assert.equal(sb.quotes.length, 25);
    assert.equal(await bootstrap(a), a);
    assert.equal((await read(a)).quotes.length, 25);
    assert.notEqual(sa.customers[0].id, sb.customers[0].id);
    console.log("PASS: isolated sessions and seed-once initialization");
    const values: QuoteInput = {
      customerId: sa.customers[0].id,
      title: "Integration test leak repair",
      jobAddress: sa.customers[0].address,
      issueDate: sa.today,
      expiryDate: "2099-12-31",
      followUp: sa.today,
      lines: [{ description: "Labour", quantity: 1.5, unitCents: 101 }],
      discountCents: 2,
      taxBps: 1500,
      notes: "Fictional test",
      terms: "Test terms",
    };
    assert.equal(
      quoteSchema.safeParse({ ...values, expiryDate: "2026-02-30" }).success,
      false,
    );
    const created = await mutate(a, { action: "saveQuote", data: values });
    let q = (await read(a)).quotes.find((q) => q.id === created.id)!;
    assert.equal(q.totalCents, 173);
    assert.equal(q.title, values.title);
    await mutate(a, {
      action: "saveQuote",
      id: q.id,
      version: q.version,
      data: { ...values, title: "Edited persisted title" },
    });
    q = (await read(a)).quotes.find((x) => x.id === q.id)!;
    assert.equal(q.title, "Edited persisted title");
    assert.equal(q.version, 2);
    await assert.rejects(
      mutate(a, { action: "saveQuote", id: q.id, version: 1, data: values }),
      /another tab/,
    );
    console.log("PASS: create/edit persistence and stale-write rejection");
    await assert.rejects(
      mutate(b, { action: "archive", id: q.id, version: q.version }),
      /not found/,
    );
    await assert.rejects(
      mutate(b, { action: "saveQuote", data: values }),
      /workspace/,
    );
    console.log("PASS: cross-workspace reads and mutation isolation");
    const before = metrics((await read(a)).quotes, sa.today);
    await mutate(a, {
      action: "status",
      id: q.id,
      version: q.version,
      data: "sent",
    });
    q = (await read(a)).quotes.find((x) => x.id === q.id)!;
    const sentMetrics = metrics((await read(a)).quotes, sa.today);
    assert.equal(sentMetrics.outstanding, before.outstanding + 173);
    assert.equal(sentMetrics.due.length, before.due.length + 1);
    await assert.rejects(
      mutate(a, {
        action: "saveQuote",
        id: q.id,
        version: q.version,
        data: values,
      }),
      /Only active drafts/,
    );
    await mutate(a, {
      action: "followUp",
      id: q.id,
      version: q.version,
      data: { date: sa.today, done: true },
    });
    q = (await read(a)).quotes.find((x) => x.id === q.id)!;
    assert.equal(
      metrics((await read(a)).quotes, sa.today).due.length,
      before.due.length,
    );
    await mutate(a, {
      action: "status",
      id: q.id,
      version: q.version,
      data: "accepted",
    });
    q = (await read(a)).quotes.find((x) => x.id === q.id)!;
    assert.equal(
      metrics((await read(a)).quotes, sa.today).accepted,
      before.accepted + 173,
    );
    await assert.rejects(
      mutate(a, {
        action: "status",
        id: q.id,
        version: q.version,
        data: "declined",
      }),
      /not available/,
    );
    const copy = await mutate(a, { action: "duplicate", id: q.id });
    const copied = (await read(a)).quotes.find((x) => x.id === copy.id)!;
    assert.equal(copied.status, "draft");
    assert.notEqual(copied.number, q.number);
    assert.equal(copied.totalCents, q.totalCents);
    await mutate(a, {
      action: "saveCustomer",
      id: values.customerId,
      data: { ...sa.customers[0], name: "Updated fictional customer" },
    });
    assert.equal(
      (await read(a)).quotes.find((x) => x.id === q.id)!.customer.name,
      q.customer.name,
    );
    await mutate(a, {
      action: "saveSettings",
      data: { ...sa.settings, name: "New demo company" },
    });
    assert.equal((await read(a)).settings.name, "New demo company");
    assert.equal(
      (await read(a)).quotes.find((x) => x.id === q.id)!.company.name,
      "Flow Plumbing",
    );
    console.log(
      "PASS: status transitions, follow-ups, metrics, duplication and immutable snapshots",
    );
    const concurrent = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutate(a, { action: "saveQuote", data: values }),
      ),
    );
    const all = (await read(a)).quotes;
    assert.equal(new Set(all.map((q) => q.number)).size, all.length);
    assert.equal(concurrent.length, 5);
    console.log("PASS: concurrent unique quote numbering");
    await mutate(a, { action: "archive", id: q.id, version: q.version });
    assert.equal(
      (await read(a)).quotes.find((x) => x.id === q.id)!.archived,
      true,
    );
    await mutate(a, { action: "reset", data: "RESET" });
    assert.equal((await read(a)).quotes.length, 25);
    assert.equal((await read(b)).quotes[0].id, sb.quotes[0].id);
    assert.equal((await read(a)).settings.name, "Flow Plumbing");
    console.log("PASS: archive, reset and reset isolation");
    const { NextRequest } = await import("next/server");
    const { POST, GET } = await import("../src/app/api/workspace/route");
    const make = (body: unknown, origin = "http://localhost:3000", token = a) =>
      new NextRequest("http://localhost:3000/api/workspace", {
        method: "POST",
        headers: {
          origin,
          "Content-Type": "application/json",
          cookie: `flow_demo=${token}`,
        },
        body: JSON.stringify(body),
      });
    assert.equal(
      (
        await POST(
          make({ action: "reset", data: "RESET" }, "https://evil.example"),
        )
      ).status,
      403,
    );
    assert.equal((await POST(make(null))).status, 400);
    assert.equal(
      (await GET(new NextRequest("http://localhost:3000/api/workspace")))
        .status,
      401,
    );
    const response = await POST(make({ action: "bootstrap" }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie") || "", /HttpOnly/i);
    console.log(
      "PASS: route origin checks, invalid input, unauthenticated reads and HttpOnly session cookie",
    );
    await client
      .db("flow_integration")
      .collection("workspaces")
      .updateMany({}, { $set: { expiresAt: new Date(0) } });
    await assert.rejects(readState(a), /ended/);
    console.log("PASS: session expiry");
  } finally {
    await client.close();
    await repl.stop();
  }
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
