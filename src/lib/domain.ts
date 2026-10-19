import { z } from "zod";
export const statuses = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
] as const;
export type Status = (typeof statuses)[number];
export const idSchema = z.string().uuid();
const text = (n: number) => z.string().trim().min(1).max(n);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid date",
  );
export const customerSchema = z.object({
  name: text(120),
  email: z
    .email()
    .max(180)
    .refine(
      (v) => v.toLowerCase().endsWith("@example.com"),
      "Use a fictional example.com email",
    ),
  address: text(300),
});
export const settingsSchema = z.object({
  name: text(100),
  email: z
    .email()
    .max(180)
    .refine((v) => v.toLowerCase().endsWith("@example.com"), "Use example.com"),
  address: text(300),
  terms: text(2000),
  taxBps: z.number().int().min(0).max(3000),
});
export const lineSchema = z.object({
  description: text(250),
  quantity: z
    .number()
    .positive()
    .max(10000)
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001,
      "Maximum two decimal places",
    ),
  unitCents: z.number().int().min(0).max(100000000),
});
export const quoteSchema = z
  .object({
    customerId: idSchema,
    title: text(150),
    jobAddress: text(300),
    issueDate: dateSchema,
    expiryDate: dateSchema,
    followUp: z.union([dateSchema, z.literal("")]),
    lines: z.array(lineSchema).min(1).max(50),
    discountCents: z.number().int().min(0).max(1000000000),
    taxBps: z.number().int().min(0).max(3000),
    notes: z.string().max(3000),
    terms: text(2000),
  })
  .refine((v) => v.expiryDate >= v.issueDate, {
    message: "Expiry must be on or after the issue date",
    path: ["expiryDate"],
  });
export type CustomerInput = z.infer<typeof customerSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Line = z.infer<typeof lineSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type Totals = {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
};
export type Customer = CustomerInput & { id: string };
export type Quote = QuoteInput &
  Totals & {
    id: string;
    number: string;
    status: Status;
    archived: boolean;
    version: number;
    createdAt: string;
    customer: CustomerInput;
    company: Settings;
    followUpDone: boolean;
    events: { at: string; text: string }[];
  };
export type CatalogueItem = {
  id: string;
  description: string;
  unitCents: number;
};
export type State = {
  settings: Settings;
  customers: Customer[];
  quotes: Quote[];
  catalogue: CatalogueItem[];
  today: string;
};
export function totals(
  lines: Line[],
  discountCents: number,
  taxBps: number,
): Totals {
  // Round each quantity * integer-cent price half-up, then tax once on discounted subtotal.
  const subtotalCents = lines.reduce(
    (sum, l) =>
      sum + Math.floor((Math.round(l.quantity * 100) * l.unitCents + 50) / 100),
    0,
  );
  if (discountCents > subtotalCents)
    throw new Error("Discount cannot exceed the subtotal");
  const taxCents = Math.floor(
    ((subtotalCents - discountCents) * taxBps + 5000) / 10000,
  );
  const totalCents = subtotalCents - discountCents + taxCents;
  if (!Number.isSafeInteger(totalCents) || totalCents > 1000000000000)
    throw new Error("Quote exceeds the supported limit");
  return { subtotalCents, discountCents, taxCents, totalCents };
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    cents / 100,
  );
export const todayZA = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function effectiveStatus(
  q: Pick<Quote, "status" | "expiryDate">,
  today: string,
): Status {
  return q.status === "sent" && q.expiryDate < today ? "expired" : q.status;
}
export function metrics(quotes: Quote[], today: string) {
  const active = quotes.filter((q) => !q.archived);
  return {
    month: active
      .filter((q) => q.createdAt.slice(0, 7) === today.slice(0, 7))
      .reduce((s, q) => s + q.totalCents, 0),
    outstanding: active
      .filter((q) => effectiveStatus(q, today) === "sent")
      .reduce((s, q) => s + q.totalCents, 0),
    accepted: active
      .filter((q) => q.status === "accepted")
      .reduce((s, q) => s + q.totalCents, 0),
    due: active.filter(
      (q) =>
        q.followUp &&
        !q.followUpDone &&
        q.followUp <= today &&
        effectiveStatus(q, today) === "sent",
    ),
  };
}
