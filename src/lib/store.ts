import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ClientSession, Db, Document } from "mongodb";
import { z } from "zod";
import { connection } from "./db";
import {
  customerSchema,
  settingsSchema,
  quoteSchema,
  idSchema,
  dateSchema,
  totals,
  todayZA,
  effectiveStatus,
  type Settings,
  type Quote,
  type Customer,
} from "./domain";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const collections = ["customers", "quotes", "catalogue", "activity"];
const defaults: Settings = {
  name: "Flow Plumbing",
  email: "hello@flow.example.com",
  address: "Demo office · Moreleta Park, Pretoria",
  terms:
    "Illustrative quotation only. Work begins after approval and agreement on scheduling. Materials are subject to availability. This demo does not constitute a real offer.",
  taxBps: 1500,
};
// example.com subdomains are reserved, but form validation deliberately uses exact @example.com.
defaults.email = "flow.plumbing@example.com";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
let indexes: Promise<unknown> | undefined;
async function prepare(db: Db) {
  if (!indexes)
    indexes = Promise.all([
      db
        .collection("workspaces")
        .createIndex({ tokenHash: 1 }, { unique: true }),
      db
        .collection("quotes")
        .createIndex({ workspaceId: 1, number: 1 }, { unique: true }),
      ...collections.map((c) =>
        db
          .collection(c)
          .createIndex({ workspaceId: 1, id: 1 }, { unique: true }),
      ),
      db
        .collection("quotes")
        .createIndex({ workspaceId: 1, status: 1, followUp: 1 }),
      db.collection("customers").createIndex({ workspaceId: 1, name: 1 }),
      db
        .collection("limits")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("workspaces").createIndex({ expiresAt: 1 }),
    ]).catch((e) => {
      indexes = undefined;
      throw e;
    });
  await indexes;
}
export async function limit(key: string, max: number) {
  const { db } = await connection();
  await prepare(db);
  const minute = Math.floor(Date.now() / 60000);
  const result = await db
    .collection("limits")
    .findOneAndUpdate(
      { _id: hash(key + minute) as unknown as Document["_id"] },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(Date.now() + 120000) },
      },
      { upsert: true, returnDocument: "after" },
    );
  if ((result?.count || 0) > max)
    throw new AppError(
      429,
      "Too many requests. Please wait a minute and try again.",
    );
}
async function seed(db: Db, workspaceId: string, session: ClientSession) {
  const opt = { session };
  const now = new Date();
  const today = todayZA();
  const day = (n: number) =>
    new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
  const names = [
    "Amelia Botha",
    "Thabo Nkosi",
    "Oliver Jacobs",
    "Naledi Molefe",
    "Daniel Visser",
    "Zanele Dube",
    "Ethan Meyer",
    "Lerato Mokoena",
    "Sofia Naidoo",
    "James van Wyk",
    "Mia Petersen",
    "Sipho Khumalo",
  ];
  const suburbs = [
    "Moreleta Park",
    "Garsfontein",
    "Faerie Glen",
    "Lynnwood",
    "Waterkloof",
    "Elardus Park",
  ];
  const customers = names.map((name, i) => ({
    id: randomUUID(),
    workspaceId,
    name,
    email: `customer${i + 1}@example.com`,
    address: `${10 + i * 3} Example Street, ${suburbs[i % 6]}, Pretoria (fictional)`,
  }));
  await db.collection("customers").insertMany(customers, opt);
  const catalogue = [
    ["Call-out and initial assessment", 65000],
    ["Leak repair labour", 85000],
    ["Drain unblocking", 125000],
    ["Mixer tap replacement", 180000],
    ["150L geyser installation", 1250000],
    ["Copper fittings and consumables", 37500],
    ["Additional labour / hour", 55000],
  ].map(([description, unitCents]) => ({
    id: randomUUID(),
    workspaceId,
    description,
    unitCents,
  }));
  await db.collection("catalogue").insertMany(catalogue, opt);
  const quotes = Array.from({ length: 25 }, (_, i) => {
    const customer = customers[i % 12];
    const service = catalogue[i % 7];
    const lines = [
      {
        description: String(service.description),
        quantity: 1 + (i % 3) * 0.5,
        unitCents: Number(service.unitCents),
      },
      {
        description: "Call-out and initial assessment",
        quantity: 1,
        unitCents: 65000,
      },
    ];
    const status = (
      ["sent", "accepted", "draft", "sent", "declined", "expired"] as const
    )[i % 6];
    return {
      id: randomUUID(),
      workspaceId,
      number: `FP-${String(1001 + i)}`,
      version: 1,
      title: String(service.description),
      customerId: customer.id,
      customer: {
        name: customer.name,
        email: customer.email,
        address: customer.address,
      },
      company: defaults,
      jobAddress: customer.address,
      issueDate: day(-i),
      expiryDate: status === "expired" ? day(-2) : day(7 + (i % 10)),
      followUp: status === "sent" ? day((i % 5) - 2) : "",
      followUpDone: false,
      lines,
      taxBps: defaults.taxBps,
      ...totals(lines, 0, defaults.taxBps),
      notes: "Fictional job. Prices are illustrative.",
      terms: defaults.terms,
      status,
      archived: false,
      createdAt: day(-i) + "T08:00:00.000Z",
      events: [{ at: now.toISOString(), text: "Demo quote seeded" }],
    };
  });
  await db.collection("quotes").insertMany(quotes, opt);
  await db
    .collection("workspaces")
    .updateOne(
      { id: workspaceId },
      { $set: { settings: defaults, counter: 1025 } },
      opt,
    );
  await db
    .collection("activity")
    .insertOne(
      {
        id: randomUUID(),
        workspaceId,
        at: now.toISOString(),
        text: "Demo workspace seeded with 12 customers and 25 quotes",
      },
      opt,
    );
}
export async function bootstrap(token?: string) {
  const { db, client } = await connection();
  await prepare(db);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const existing = await db
      .collection("workspaces")
      .findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } });
    if (existing) return token;
  }
  const fresh = randomBytes(32).toString("hex");
  const id = randomUUID();
  await client.withSession(async (session) =>
    session.withTransaction(async () => {
      await db
        .collection("workspaces")
        .insertOne(
          {
            id,
            tokenHash: hash(fresh),
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 86400000),
            settings: defaults,
            counter: 1000,
          },
          { session },
        );
      await seed(db, id, session);
    }),
  );
  return fresh;
}
async function context(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new AppError(
      401,
      "Your demo session has ended. Reload to start a new one.",
    );
  const { db, client } = await connection();
  await prepare(db);
  const ws = await db
    .collection("workspaces")
    .findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } });
  if (!ws)
    throw new AppError(
      401,
      "Your demo session has ended. Reload to start a new one.",
    );
  return { db, client, ws };
}
export async function readState(token?: string) {
  const { db, ws } = await context(token);
  await limit("read:" + ws.id, 120);
  const [customers, quotes, catalogue] = await Promise.all(
    ["customers", "quotes", "catalogue"].map((c) =>
      db
        .collection(c)
        .find(
          { workspaceId: ws.id },
          { projection: { _id: 0, workspaceId: 0 } },
        )
        .toArray(),
    ),
  );
  return {
    settings: ws.settings,
    customers,
    quotes,
    catalogue,
    today: todayZA(),
  };
}
const actionSchema = z.object({
  action: z.enum([
    "saveCustomer",
    "saveSettings",
    "saveQuote",
    "status",
    "duplicate",
    "archive",
    "followUp",
    "reset",
  ]),
  id: idSchema.optional(),
  version: z.number().int().positive().optional(),
  data: z.unknown().optional(),
});
export async function mutate(token: string | undefined, input: unknown) {
  const body = actionSchema.parse(input);
  const { db, client, ws } = await context(token);
  await limit("write:" + ws.id, 60);
  let resultId: string | undefined;
  await client.withSession(async (session) =>
    session.withTransaction(async () => {
      const opt = { session };
      const scope = { workspaceId: ws.id };
      const now = new Date().toISOString();
      // Serialize workspace mutations (including reset) so concurrent reset cannot resurrect old data.
      const lock = await db
        .collection("workspaces")
        .findOneAndUpdate(
          { id: ws.id, expiresAt: { $gt: new Date() } },
          { $inc: { revision: 1 } },
          { ...opt, returnDocument: "after" },
        );
      if (!lock) throw new AppError(401, "Session expired");
      const log = async (text: string, quoteId?: string) => {
        await db
          .collection("activity")
          .insertOne(
            { ...scope, id: randomUUID(), quoteId, text, at: now },
            opt,
          );
      };
      if (body.action === "reset") {
        if (body.data !== "RESET")
          throw new AppError(400, "Please confirm the reset");
        for (const c of collections)
          await db.collection(c).deleteMany(scope, opt);
        await seed(db, ws.id, session);
        return;
      }
      if (body.action === "saveSettings") {
        await db
          .collection("workspaces")
          .updateOne(
            { id: ws.id },
            { $set: { settings: settingsSchema.parse(body.data) } },
            opt,
          );
        await log("Company settings updated");
        return;
      }
      if (body.action === "saveCustomer") {
        const data = customerSchema.parse(body.data);
        resultId = body.id || randomUUID();
        if (body.id) {
          const r = await db
            .collection("customers")
            .updateOne({ ...scope, id: body.id }, { $set: data }, opt);
          if (!r.matchedCount) throw new AppError(404, "Customer not found");
        } else {
          if (
            (await db.collection("customers").countDocuments(scope, opt)) >= 200
          )
            throw new AppError(
              400,
              "Demo limit: 200 customers. Reset your demo to start again.",
            );
          await db
            .collection("customers")
            .insertOne({ ...scope, id: resultId, ...data }, opt);
        }
        await log("Customer saved");
        return;
      }
      let q: Quote | undefined;
      if (body.id) {
        q = (await db
          .collection("quotes")
          .findOne(
            { ...scope, id: body.id },
            { ...opt, projection: { _id: 0, workspaceId: 0 } },
          )) as unknown as Quote;
        if (!q) throw new AppError(404, "Quote not found");
      }
      const newQuote = async (
        data: Omit<
          Quote,
          | "id"
          | "number"
          | "version"
          | "events"
          | "createdAt"
          | "archived"
          | "status"
        >,
      ) => {
        if ((await db.collection("quotes").countDocuments(scope, opt)) >= 300)
          throw new AppError(
            400,
            "Demo limit: 300 quotes. Reset your demo to start again.",
          );
        const counter = await db
          .collection("workspaces")
          .findOneAndUpdate(
            { id: ws.id },
            { $inc: { counter: 1 } },
            { ...opt, returnDocument: "after" },
          );
        resultId = randomUUID();
        await db
          .collection("quotes")
          .insertOne(
            {
              ...data,
              ...scope,
              id: resultId,
              number: `FP-${counter!.counter}`,
              version: 1,
              status: "draft",
              archived: false,
              createdAt: now,
              events: [
                {
                  at: now,
                  text: q ? `Duplicated from ${q.number}` : "Draft created",
                },
              ],
            },
            opt,
          );
        await log("Draft created", resultId);
      };
      if (body.action === "saveQuote") {
        const data = quoteSchema.parse(body.data);
        const computed = totals(data.lines, data.discountCents, data.taxBps);
        const customer = (await db
          .collection("customers")
          .findOne(
            { ...scope, id: data.customerId },
            opt,
          )) as unknown as Customer;
        if (!customer)
          throw new AppError(400, "Select a customer in this workspace");
        const snapshot = {
          name: customer.name,
          email: customer.email,
          address: customer.address,
        };
        const values = {
          ...data,
          ...computed,
          customer: snapshot,
          company: lock.settings as Settings,
          followUpDone: false,
        };
        if (!q) {
          await newQuote(values);
          return;
        }
        if (q.status !== "draft" || q.archived)
          throw new AppError(
            409,
            "Only active drafts can be edited. Duplicate this quote to create a revision.",
          );
        if (q.version !== body.version)
          throw new AppError(
            409,
            "This quote changed in another tab. Close the editor and refresh before trying again.",
          );
        await db
          .collection("quotes")
          .updateOne(
            { ...scope, id: q.id },
            {
              $set: values,
              $inc: { version: 1 },
              $push: { events: { at: now, text: "Draft updated" } },
            } as Document,
            opt,
          );
        await log("Draft updated", q.id);
        resultId = q.id;
        return;
      }
      if (!q) throw new AppError(404, "Quote not found");
      if (body.action === "duplicate") {
        const {
          id,
          number,
          status,
          version,
          archived,
          createdAt,
          events,
          ...data
        } = q;
        void id;
        void number;
        void status;
        void version;
        void archived;
        void createdAt;
        void events;
        await newQuote({
          ...data,
          issueDate: todayZA(),
          expiryDate: new Date(Date.parse(todayZA()) + 14 * 86400000)
            .toISOString()
            .slice(0, 10),
          followUp: "",
          followUpDone: false,
        });
        return;
      }
      if (q.version !== body.version)
        throw new AppError(
          409,
          "Quote changed in another tab. Refresh and try again.",
        );
      let values: Document = {};
      let message = "";
      if (body.action === "archive") {
        values = { archived: !q.archived };
        message = q.archived ? "Quote restored" : "Quote archived";
      } else if (q.archived)
        throw new AppError(409, "Restore the quote before changing it");
      else if (body.action === "status") {
        const target = z
          .enum(["sent", "accepted", "declined"])
          .parse(body.data);
        const current = effectiveStatus(q, todayZA());
        if (!(
          (current === "draft" && target === "sent") ||
          (current === "sent" &&
            (target === "accepted" || target === "declined"))
        ))
          throw new AppError(
            409,
            "This status change is not available. Duplicate the quote for a new draft.",
          );
        if (q.expiryDate < todayZA())
          throw new AppError(
            400,
            "Update the expiry date before simulating sending",
          );
        values = { status: target };
        message = `Simulated ${target === "sent" ? "sending" : target === "accepted" ? "acceptance" : "decline"} — no message sent`;
      } else if (body.action === "followUp") {
        const data = z
          .object({
            date: z.union([z.literal(""), dateSchema]),
            done: z.boolean(),
          })
          .parse(body.data);
        values = { followUp: data.date, followUpDone: data.done };
        message = data.done ? "Follow-up completed" : "Follow-up scheduled";
      }
      await db
        .collection("quotes")
        .updateOne(
          { ...scope, id: q.id },
          {
            $set: values,
            $inc: { version: 1 },
            $push: { events: { at: now, text: message } },
          } as Document,
          opt,
        );
      await log(message, q.id);
      resultId = q.id;
    }),
  );
  return { id: resultId };
}
