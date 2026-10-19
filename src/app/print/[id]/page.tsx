"use client";
import { use, useEffect, useState } from "react";
import QuoteDocument from "@/components/quote-document";
import type { Quote, State } from "@/lib/domain";
export default function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [quote, setQuote] = useState<Quote>();
  const [today, setToday] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d as State;
      })
      .then((d) => {
        const q = d.quotes.find((q) => q.id === id);
        if (!q) throw new Error("Quote not found in your workspace.");
        setQuote(q);
        setToday(d.today);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  return (
    <main className="print-page">
      <div className="print-controls">
        <a className="button" href="/">
          Back to workspace
        </a>
        <button
          className="primary"
          disabled={!quote}
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : quote ? (
        <QuoteDocument quote={quote} today={today} />
      ) : (
        <p>Loading quotation…</p>
      )}
    </main>
  );
}
