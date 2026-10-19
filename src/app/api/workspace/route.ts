import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, bootstrap, limit, mutate, readState } from "@/lib/store";
export const runtime = "nodejs";
const cookie = "flow_demo";
function failure(e: unknown) {
  if (e instanceof ZodError)
    return NextResponse.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  if (e instanceof AppError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  const message = e instanceof Error ? e.message : "";
  if (message.startsWith("Discount") || message.startsWith("Quote exceeds"))
    return NextResponse.json({ error: message }, { status: 400 });
  console.error(
    "Workspace request failed:",
    e instanceof Error ? e.name : "Unknown error",
  );
  return NextResponse.json(
    {
      error:
        message === "DATABASE_NOT_CONFIGURED"
          ? "Add MONGODB_URI and MONGODB_DB to .env.local, then restart the development server."
          : "Unable to reach the database or save the change. Check Atlas access and your connection settings, then retry. Your form has been kept.",
    },
    { status: 503 },
  );
}
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await readState(req.cookies.get(cookie)?.value), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (
      !origin ||
      origin !== req.nextUrl.origin ||
      req.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new AppError(403, "Requests must come from this application");
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      throw new AppError(415, "Use JSON");
    const raw = await req.text();
    if (raw.length > 65536) throw new AppError(413, "Request too large");
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new AppError(400, "Invalid JSON");
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new AppError(400, "Use a JSON object");
    if (input.action === "bootstrap") {
      // Vercel overwrites this header. Outside Vercel use a shared bucket rather than trusting forwarded IPs.
      const ip = process.env.VERCEL
        ? req.headers.get("x-vercel-forwarded-for") || "unknown"
        : "local";
      await limit("bootstrap:" + ip, 20);
      const token = await bootstrap(req.cookies.get(cookie)?.value);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(cookie, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 86400,
      });
      return response;
    }
    return NextResponse.json(
      await mutate(req.cookies.get(cookie)?.value, input),
    );
  } catch (e) {
    return failure(e);
  }
}
