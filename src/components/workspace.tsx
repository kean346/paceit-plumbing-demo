"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings as SettingsIcon,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  Copy,
  Printer,
  Send,
  Check,
  Archive,
  RotateCcw,
  RefreshCw,
  Droplets,
  Clock3,
  CircleCheck,
  Menu,
} from "lucide-react";
import {
  money,
  totals,
  metrics,
  effectiveStatus,
  statuses,
  type State,
  type Quote,
  type QuoteInput,
  type Customer,
  type Settings,
  type Line,
} from "@/lib/domain";
import QuoteDocument from "./quote-document";
type View = "Overview" | "Quotes" | "Customers" | "Settings";
type Command = {
  action: string;
  id?: string;
  version?: number;
  data?: unknown;
};
const dateLabel = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
  });
async function api(command?: Command) {
  const response = await fetch(
    "/api/workspace",
    command
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }
      : { cache: "no-store" },
  );
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Request failed");
  return json;
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Badge({ q, today }: { q: Quote; today: string }) {
  const s = effectiveStatus(q, today);
  return (
    <span className={`status ${s}`}>
      <i />
      {s}
    </span>
  );
}
function QuoteTable({
  quotes,
  today,
  onOpen,
}: {
  quotes: Quote[];
  today: string;
  onOpen: (q: Quote) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="quote-table">
        <thead>
          <tr>
            <th>Quote / job</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Valid until</th>
            <th className="numeric">Quote value</th>
            <th>
              <span className="sr-only">Open quote</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id}>
              <td>
                <button
                  className="text-button quote-link"
                  onClick={() => onOpen(q)}
                >
                  {q.number}
                </button>
                <small>{q.title}</small>
              </td>
              <td>
                {q.customer.name}
                <small>{q.jobAddress.split(",")[1] || "Pretoria"}</small>
              </td>
              <td>
                <Badge q={q} today={today} />
                {q.archived && <small>Archived</small>}
              </td>
              <td>{dateLabel(q.expiryDate)}</td>
              <td className="numeric strong">{money(q.totalCents)}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Open ${q.number}`}
                  onClick={() => onOpen(q)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!quotes.length && (
        <div className="empty">
          <FileText />
          <h3>No quotes here yet</h3>
          <p>Create a quote or try a different filter.</p>
        </div>
      )}
    </div>
  );
}
export default function Workspace() {
  const [data, setData] = useState<State | null>(null),
    [view, setView] = useState<View>("Overview");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("newest"),
    [page, setPage] = useState(1),
    [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [editor, setEditor] = useState<Quote | "new" | null>(null),
    [customer, setCustomer] = useState<Customer | "new" | null>(null),
    [reset, setReset] = useState(false),
    [mobile, setMobile] = useState(false);
  const booting = useRef(false);
  async function refresh() {
    setData(await api());
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      await api({ action: "bootstrap" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!booting.current) {
      booting.current = true;
      void load();
    }
  }, []); // one session bootstrap per mount
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  async function run(command: Command, message: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api(command);
      await refresh();
      setNotice(message);
      return result as { id?: string };
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: View) {
    setView(next);
    setSearch("");
    setFilter("all");
    setPage(1);
    setMobile(false);
  }
  const q = data?.quotes.find((q) => q.id === selected);
  const m = data ? metrics(data.quotes, data.today) : null;
  const active = data?.quotes.filter((q) => !q.archived) || [];
  const filtered = (data?.quotes || [])
    .filter(
      (q) =>
        q.archived === archived &&
        (filter === "all" || effectiveStatus(q, data!.today) === filter) &&
        `${q.number} ${q.title} ${q.customer.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "value"
        ? b.totalCents - a.totalCents
        : sort === "customer"
          ? a.customer.name.localeCompare(b.customer.name)
          : b.createdAt.localeCompare(a.createdAt) ||
            b.number.localeCompare(a.number),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const safePage = Math.min(page, pages);
  const formError = error && (
    <div className="alert" role="alert">
      {error}
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a className="brand" href="/" aria-label="Flow Plumbing overview">
          <span className="brand-icon">
            <Droplets size={25} />
          </span>
          <span>
            flow<span className="brand-dot">.</span>
            <small>PLUMBING</small>
          </span>
        </a>
        <div className="workspace-label">QUOTES WORKSPACE</div>
        <nav>
          {(
            [
              ["Overview", LayoutDashboard],
              ["Quotes", FileText],
              ["Customers", Users],
              ["Settings", SettingsIcon],
            ] as const
          ).map(([v, Icon]) => (
            <button
              key={v}
              className={view === v ? "nav-item active" : "nav-item"}
              onClick={() => navigate(v)}
            >
              <Icon size={18} />
              {v}
              {v === "Quotes" && data && <span>{active.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="live-dot" /> Demo workspace
            <p>
              Explore freely. All customers
              <br />
              and quotes are fictional.
            </p>
          </div>
          <div className="built">
            Built by{" "}
            <strong>
              paceIT<span>.</span>
            </strong>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>{view}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">Demo · fictional data</span>
            <span className="avatar">FP</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">FLOW PLUMBING / PRETORIA</div>
              <h1>
                {view === "Overview"
                  ? "A clear view of your quotes."
                  : view === "Quotes"
                    ? "Every quote, in one place."
                    : view === "Customers"
                      ? "Good work starts with people."
                      : "Make this workspace yours."}
              </h1>
              <p>
                {view === "Overview"
                  ? "Know what’s out, what’s approved, and who needs a follow-up."
                  : view === "Quotes"
                    ? "Prepare, track and follow through on your next job."
                    : view === "Customers"
                      ? "Your fictional customer directory and quote history."
                      : "Company details and defaults for your next quotation."}
              </p>
            </div>
            {data && view !== "Settings" && (
              <button
                className="primary"
                onClick={() =>
                  view === "Customers" ? setCustomer("new") : setEditor("new")
                }
              >
                <Plus size={18} />
                {view === "Customers" ? "Add customer" : "New quote"}
              </button>
            )}
          </div>
          {!editor && !customer && !q && !reset && formError}
          {loading && !data ? (
            <div className="loading-panel">
              <span className="spinner" />
              <h3>Preparing your workspace</h3>
              <p>Loading your demo customers and quotes…</p>
            </div>
          ) : !data ? (
            <div className="panel setup">
              <h2>Let’s connect your database.</h2>
              <p>
                The interface is ready. Add your Atlas connection in{" "}
                <code>.env.local</code>, restart the server, and retry.
              </p>
              <button className="primary" onClick={load}>
                <RefreshCw size={16} />
                Retry connection
              </button>
            </div>
          ) : (
            <>
              {view === "Overview" && m && (
                <>
                  <div className="metrics">
                    <Metric
                      title="Quoted this month"
                      value={money(m.month)}
                      note="Created this month · active quotes"
                      icon={<FileText size={17} />}
                    />
                    <Metric
                      title="Awaiting a decision"
                      value={money(m.outstanding)}
                      note="Sent and still within validity"
                      icon={<Clock3 size={17} />}
                    />
                    <Metric
                      title="Accepted quote value"
                      value={money(m.accepted)}
                      note="All time · excludes archived"
                      icon={<CircleCheck size={17} />}
                      accent
                    />
                    <Metric
                      title="Follow-ups due"
                      value={String(m.due.length).padStart(2, "0")}
                      note="Due today or overdue · sent quotes"
                      icon={<ArrowUpRight size={17} />}
                    />
                  </div>
                  <p className="metric-caption">
                    Quote values include demo tax. These are quotations, not
                    revenue or payments collected.
                  </p>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-title">
                        <div>
                          <span className="eyebrow">THE LATEST</span>
                          <h2>Recent quotes</h2>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("Quotes")}
                        >
                          View all <ArrowRight size={15} />
                        </button>
                      </div>
                      <QuoteTable
                        quotes={[...active]
                          .sort((a, b) =>
                            b.createdAt.localeCompare(a.createdAt),
                          )
                          .slice(0, 6)}
                        today={data.today}
                        onOpen={(q) => setSelected(q.id)}
                      />
                    </section>
                    <section className="panel follow-panel">
                      <div className="panel-title">
                        <div>
                          <span className="eyebrow">KEEP THINGS MOVING</span>
                          <h2>Time to follow up</h2>
                        </div>
                        <span className="count">{m.due.length}</span>
                      </div>
                      <p className="panel-intro">
                        A quick check-in can turn an open quote into your next
                        job.
                      </p>
                      {m.due.length ? (
                        m.due
                          .sort((a, b) => a.followUp.localeCompare(b.followUp))
                          .slice(0, 5)
                          .map((q) => (
                            <div className="follow-item" key={q.id}>
                              <div className="initials">
                                {q.customer.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join("")}
                              </div>
                              <div>
                                <button
                                  className="text-button"
                                  onClick={() => setSelected(q.id)}
                                >
                                  {q.customer.name}
                                </button>
                                <small>
                                  {q.number} · {money(q.totalCents)}
                                </small>
                                <span
                                  className={
                                    q.followUp < data.today
                                      ? "due overdue"
                                      : "due"
                                  }
                                >
                                  {q.followUp < data.today
                                    ? "Overdue"
                                    : "Today"}{" "}
                                  · {dateLabel(q.followUp)}
                                </span>
                              </div>
                              <button
                                disabled={busy}
                                className="icon-button complete"
                                aria-label={`Complete follow-up for ${q.number}`}
                                onClick={() =>
                                  run(
                                    {
                                      action: "followUp",
                                      id: q.id,
                                      version: q.version,
                                      data: { date: q.followUp, done: true },
                                    },
                                    "Follow-up completed",
                                  )
                                }
                              >
                                <Check size={16} />
                              </button>
                            </div>
                          ))
                      ) : (
                        <div className="empty">
                          <CircleCheck />
                          <h3>All caught up</h3>
                          <p>No sent quotes need a follow-up today.</p>
                        </div>
                      )}
                      <div className="follow-footer">
                        <Clock3 size={15} />
                        Reminders only. No messages are sent.
                      </div>
                    </section>
                  </div>
                  <section className="workflow-strip">
                    <span className="workflow-number">01 — 04</span>
                    <div>
                      <strong>A simpler path from enquiry to approval.</strong>
                      <p>
                        Add a customer, prepare a quote, simulate sending, then
                        record their decision.
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setEditor("new")}
                    >
                      Try the workflow <ArrowUpRight size={18} />
                    </button>
                  </section>
                </>
              )}
              {view === "Quotes" && (
                <section className="panel">
                  <div className="quote-controls">
                    <div className="tabs">
                      {["all", ...statuses].map((s) => (
                        <button
                          className={filter === s ? "tab selected" : "tab"}
                          key={s}
                          onClick={() => {
                            setFilter(s);
                            setPage(1);
                          }}
                        >
                          {s === "all" ? "All quotes" : s}
                          <span>
                            {
                              data.quotes.filter(
                                (q) =>
                                  q.archived === archived &&
                                  (s === "all" ||
                                    effectiveStatus(q, data.today) === s),
                              ).length
                            }
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="filter-row">
                      <label className="search">
                        <Search size={17} />
                        <input
                          aria-label="Search quotes"
                          placeholder="Search quote, customer or job…"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                          }}
                        />
                      </label>
                      <label className="sort-label">
                        Sort by
                        <select
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="newest">Newest first</option>
                          <option value="value">Highest value</option>
                          <option value="customer">Customer name</option>
                        </select>
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={archived}
                          onChange={(e) => {
                            setArchived(e.target.checked);
                            setPage(1);
                          }}
                        />
                        Archived
                      </label>
                    </div>
                  </div>
                  <QuoteTable
                    quotes={filtered.slice((safePage - 1) * 8, safePage * 8)}
                    today={data.today}
                    onOpen={(q) => setSelected(q.id)}
                  />
                  <div className="pagination">
                    <span>
                      {filtered.length} quotes · Page {safePage} of {pages}
                    </span>
                    <div>
                      <button
                        aria-label="Previous page"
                        className="icon-button"
                        disabled={safePage === 1}
                        onClick={() => setPage(safePage - 1)}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        aria-label="Next page"
                        className="icon-button"
                        disabled={safePage === pages}
                        onClick={() => setPage(safePage + 1)}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </section>
              )}
              {view === "Customers" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>
                      Customer directory{" "}
                      <span className="muted">{data.customers.length}</span>
                    </h2>
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Search customers"
                        placeholder="Search customers…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Email</th>
                          <th>Job address</th>
                          <th className="numeric">Quotes</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.customers
                          .filter((c) =>
                            `${c.name} ${c.email} ${c.address}`
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                          )
                          .map((c) => (
                            <tr key={c.id}>
                              <td>
                                <button
                                  className="text-button strong"
                                  onClick={() => setCustomer(c)}
                                >
                                  {c.name}
                                </button>
                              </td>
                              <td>{c.email}</td>
                              <td>{c.address}</td>
                              <td className="numeric">
                                {
                                  data.quotes.filter(
                                    (q) => q.customerId === c.id,
                                  ).length
                                }
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={`Edit ${c.name}`}
                                  onClick={() => setCustomer(c)}
                                >
                                  <ArrowUpRight size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {!data.customers.some((c) =>
                      `${c.name} ${c.email} ${c.address}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    ) && (
                      <div className="empty">
                        No customers match your search.
                      </div>
                    )}
                  </div>
                </section>
              )}
              {view === "Settings" && (
                <SettingsForm
                  settings={data.settings}
                  busy={busy}
                  onSave={async (d) =>
                    !!(await run(
                      { action: "saveSettings", data: d },
                      "Settings saved",
                    ))
                  }
                  onReset={() => setReset(true)}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Flow Plumbing — Quotes workspace</span>
            <span>Fictional business. Real workflow.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CircleCheck size={17} />
          {notice}
        </div>
      )}
      {data && editor && (
        <Modal
          wide
          title={editor === "new" ? "Create a quote" : `Edit ${editor.number}`}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          {formError}
          <QuoteForm
            data={data}
            initial={editor === "new" ? undefined : editor}
            busy={busy}
            onSave={async (values) => {
              const result = await run(
                {
                  action: "saveQuote",
                  id: editor === "new" ? undefined : editor.id,
                  version: editor === "new" ? undefined : editor.version,
                  data: values,
                },
                "Quote saved",
              );
              if (result) {
                setEditor(null);
                setSelected(result.id || null);
              }
            }}
          />
        </Modal>
      )}
      {data && customer && (
        <Modal
          title={customer === "new" ? "Add a customer" : customer.name}
          onClose={() => {
            if (!busy) setCustomer(null);
          }}
        >
          {formError}
          <CustomerForm
            customer={customer === "new" ? undefined : customer}
            busy={busy}
            onSave={async (values) => {
              if (
                await run(
                  {
                    action: "saveCustomer",
                    id: customer === "new" ? undefined : customer.id,
                    data: values,
                  },
                  "Customer saved",
                )
              )
                setCustomer(null);
            }}
          />
          {customer !== "new" && (
            <div className="customer-history">
              <h3>Quote history</h3>
              {data.quotes
                .filter((q) => q.customerId === customer.id)
                .map((q) => (
                  <button
                    className="history-link"
                    key={q.id}
                    onClick={() => {
                      setCustomer(null);
                      setSelected(q.id);
                    }}
                  >
                    <span>
                      {q.number} · {q.title}
                    </span>
                    <strong>{money(q.totalCents)}</strong>
                  </button>
                ))}
              {!data.quotes.some((q) => q.customerId === customer.id) && (
                <p>No quotes yet.</p>
              )}
            </div>
          )}
        </Modal>
      )}
      {q && data && (
        <Modal
          wide
          title={`${q.number} · ${q.title}`}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          {formError}
          <div className="detail-actions">
            <a
              className="button"
              href={`/print/${q.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <Printer size={16} />
              Print / PDF
            </a>
            <button
              disabled={busy}
              onClick={async () => {
                const r = await run(
                  { action: "duplicate", id: q.id },
                  "New draft created",
                );
                if (r?.id) setSelected(r.id);
              }}
            >
              <Copy size={16} />
              Duplicate
            </button>
            {q.status === "draft" && !q.archived && (
              <>
                <button
                  disabled={busy}
                  onClick={() => {
                    setEditor(q);
                    setSelected(null);
                  }}
                >
                  Edit draft
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run(
                      {
                        action: "status",
                        id: q.id,
                        version: q.version,
                        data: "sent",
                      },
                      "Sending simulated. No message was sent.",
                    )
                  }
                >
                  <Send size={15} />
                  Simulate sending
                </button>
              </>
            )}
            {effectiveStatus(q, data.today) === "sent" && !q.archived && (
              <>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run(
                      {
                        action: "status",
                        id: q.id,
                        version: q.version,
                        data: "accepted",
                      },
                      "Acceptance simulated",
                    )
                  }
                >
                  Simulate acceptance
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(
                      {
                        action: "status",
                        id: q.id,
                        version: q.version,
                        data: "declined",
                      },
                      "Decline simulated",
                    )
                  }
                >
                  Simulate decline
                </button>
              </>
            )}
            <button
              disabled={busy}
              onClick={() =>
                run(
                  { action: "archive", id: q.id, version: q.version },
                  q.archived ? "Quote restored" : "Quote archived",
                )
              }
            >
              <Archive size={15} />
              {q.archived ? "Restore" : "Archive"}
            </button>
          </div>
          <QuoteDocument quote={q} today={data.today} />
          <div className="detail-bottom">
            <FollowUp
              key={`${q.id}-${q.version}`}
              q={q}
              busy={busy}
              onSave={(d) =>
                run(
                  { action: "followUp", id: q.id, version: q.version, data: d },
                  "Follow-up saved",
                )
              }
            />
            <section>
              <h3>Activity history</h3>
              <ol className="activity">
                {[...q.events].reverse().map((e, i) => (
                  <li key={i}>
                    <span>{e.text}</span>
                    <small>
                      {new Date(e.at).toLocaleString("en-ZA", {
                        timeZone: "Africa/Johannesburg",
                      })}{" "}
                      SAST
                    </small>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </Modal>
      )}
      {reset && (
        <Modal
          title="Reset your demo?"
          onClose={() => {
            if (!busy) setReset(false);
          }}
        >
          <div className="form-content">
            {formError}
            <p>
              This replaces your demo’s customers, quotes and settings with
              fresh fictional data. Other visitors’ workspaces are unaffected.
            </p>
            <div className="form-actions">
              <button disabled={busy} onClick={() => setReset(false)}>
                Cancel
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(
                      { action: "reset", data: "RESET" },
                      "Your demo has been reset",
                    )
                  ) {
                    setReset(false);
                    setSelected(null);
                  }
                }}
              >
                {busy ? "Resetting…" : "Reset my demo"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Metric({
  title,
  value,
  note,
  icon,
  accent = false,
}: {
  title: string;
  value: string;
  note: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={`metric ${accent ? "accent" : ""}`}>
      <div>
        <span>{title}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}
function CustomerForm({
  customer,
  busy,
  onSave,
}: {
  customer?: Customer;
  busy: boolean;
  onSave: (v: unknown) => void;
}) {
  const [v, setV] = useState({
    name: customer?.name || "",
    email: customer?.email || "",
    address: customer?.address || "",
  });
  return (
    <form
      className="form-content"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <p className="helper">
        Use fictional details and an @example.com email address.
      </p>
      <label>
        Customer name
        <input
          required
          maxLength={120}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
        />
      </label>
      <label>
        Email
        <input
          required
          type="email"
          placeholder="customer@example.com"
          value={v.email}
          onChange={(e) => setV({ ...v, email: e.target.value })}
        />
      </label>
      <label>
        Address
        <textarea
          required
          maxLength={300}
          value={v.address}
          onChange={(e) => setV({ ...v, address: e.target.value })}
        />
      </label>
      <div className="form-actions">
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save customer"}
        </button>
      </div>
    </form>
  );
}
function QuoteForm({
  data,
  initial,
  busy,
  onSave,
}: {
  data: State;
  initial?: Quote;
  busy: boolean;
  onSave: (v: QuoteInput) => void;
}) {
  const [v, setV] = useState<QuoteInput>(
    initial || {
      customerId: data.customers[0]?.id || "",
      title: "",
      jobAddress: data.customers[0]?.address || "",
      issueDate: data.today,
      expiryDate: new Date(Date.parse(data.today) + 14 * 86400000)
        .toISOString()
        .slice(0, 10),
      followUp: "",
      lines: [
        {
          description: "Call-out and initial assessment",
          quantity: 1,
          unitCents: 65000,
        },
      ],
      discountCents: 0,
      taxBps: data.settings.taxBps,
      notes: "",
      terms: data.settings.terms,
    },
  );
  function line(index: number, patch: Partial<Line>) {
    setV({
      ...v,
      lines: v.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    });
  }
  let calculated;
  try {
    calculated = totals(v.lines, v.discountCents, v.taxBps);
  } catch {}
  return (
    <form
      className="form-content quote-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <div className="form-section">
        <span className="section-number">01</span>
        <h3>The job</h3>
      </div>
      <div className="form-grid">
        <label>
          Customer
          <select
            required
            value={v.customerId}
            onChange={(e) => {
              const c = data.customers.find((c) => c.id === e.target.value);
              setV({
                ...v,
                customerId: e.target.value,
                jobAddress: c?.address || "",
              });
            }}
          >
            {data.customers.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Job title
          <input
            required
            maxLength={150}
            placeholder="e.g. Kitchen mixer replacement"
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
          />
        </label>
        <label className="full">
          Job address
          <input
            required
            maxLength={300}
            value={v.jobAddress}
            onChange={(e) => setV({ ...v, jobAddress: e.target.value })}
          />
        </label>
        <label>
          Issue date
          <input
            required
            type="date"
            value={v.issueDate}
            onChange={(e) => setV({ ...v, issueDate: e.target.value })}
          />
        </label>
        <label>
          Valid until
          <input
            required
            type="date"
            min={v.issueDate}
            value={v.expiryDate}
            onChange={(e) => setV({ ...v, expiryDate: e.target.value })}
          />
        </label>
      </div>
      <div className="form-section">
        <span className="section-number">02</span>
        <h3>Items & pricing</h3>
        <span className="helper">Catalogue prices are illustrative.</span>
      </div>
      <label>
        Quick-add a service
        <select
          value=""
          onChange={(e) => {
            const c = data.catalogue.find((c) => c.id === e.target.value);
            if (c)
              setV({
                ...v,
                lines: [
                  ...v.lines,
                  {
                    description: c.description,
                    quantity: 1,
                    unitCents: c.unitCents,
                  },
                ],
              });
          }}
        >
          <option value="">Choose from the service catalogue…</option>
          {data.catalogue.map((c) => (
            <option key={c.id} value={c.id}>
              {c.description} — {money(c.unitCents)}
            </option>
          ))}
        </select>
      </label>
      <div className="line-items">
        {v.lines.map((l, i) => (
          <div className="line-item" key={i}>
            <label>
              Description
              <input
                required
                maxLength={250}
                value={l.description}
                onChange={(e) => line(i, { description: e.target.value })}
              />
            </label>
            <label>
              Quantity
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                max="10000"
                value={l.quantity}
                onChange={(e) => line(i, { quantity: Number(e.target.value) })}
              />
            </label>
            <label>
              Unit price (R)
              <input
                required
                type="number"
                step="0.01"
                min="0"
                max="1000000"
                value={l.unitCents / 100}
                onChange={(e) =>
                  line(i, {
                    unitCents: Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove line ${i + 1}`}
              disabled={v.lines.length === 1}
              onClick={() =>
                setV({ ...v, lines: v.lines.filter((_, j) => i !== j) })
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={v.lines.length >= 50}
        onClick={() =>
          setV({
            ...v,
            lines: [...v.lines, { description: "", quantity: 1, unitCents: 0 }],
          })
        }
      >
        <Plus size={15} />
        Add line item
      </button>
      <div className="form-grid pricing-controls">
        <label>
          Discount (R)
          <input
            type="number"
            required
            min="0"
            step="0.01"
            value={v.discountCents / 100}
            onChange={(e) =>
              setV({
                ...v,
                discountCents: Math.round(Number(e.target.value) * 100),
              })
            }
          />
        </label>
        <label>
          Demo tax (%)
          <input
            type="number"
            required
            min="0"
            max="30"
            step="0.01"
            value={v.taxBps / 100}
            onChange={(e) =>
              setV({ ...v, taxBps: Math.round(Number(e.target.value) * 100) })
            }
          />
        </label>
      </div>
      <div className="live-total">
        <span>
          Estimated total <small>Final totals are verified when saved.</small>
        </span>
        <strong>
          {calculated ? money(calculated.totalCents) : "Check discount"}
        </strong>
      </div>
      <div className="form-section">
        <span className="section-number">03</span>
        <h3>The details</h3>
      </div>
      <label>
        Notes
        <textarea
          maxLength={3000}
          value={v.notes}
          onChange={(e) => setV({ ...v, notes: e.target.value })}
        />
      </label>
      <label>
        Terms
        <textarea
          required
          maxLength={2000}
          value={v.terms}
          onChange={(e) => setV({ ...v, terms: e.target.value })}
        />
      </label>
      <label>
        Follow-up date (optional)
        <input
          type="date"
          value={v.followUp}
          onChange={(e) => setV({ ...v, followUp: e.target.value })}
        />
      </label>
      <div className="form-actions">
        <span className="helper">Saved as a draft. No message is sent.</span>
        <button className="primary" disabled={busy || !calculated}>
          {busy ? "Saving…" : "Save quote"}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
function SettingsForm({
  settings,
  busy,
  onSave,
  onReset,
}: {
  settings: Settings;
  busy: boolean;
  onSave: (v: Settings) => Promise<boolean>;
  onReset: () => void;
}) {
  const [v, setV] = useState(settings);
  useEffect(() => setV(settings), [settings]);
  return (
    <div className="settings-grid">
      <form
        className="panel form-content"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(v);
        }}
      >
        <h2>Company details</h2>
        <p className="helper">
          These defaults apply to new drafts. Existing quotes keep their saved
          details.
        </p>
        <label>
          Company name
          <input
            required
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </label>
        <label>
          Demo email
          <input
            type="email"
            required
            value={v.email}
            onChange={(e) => setV({ ...v, email: e.target.value })}
          />
        </label>
        <label>
          Company address
          <textarea
            required
            value={v.address}
            onChange={(e) => setV({ ...v, address: e.target.value })}
          />
        </label>
        <label>
          Default quote terms
          <textarea
            required
            value={v.terms}
            onChange={(e) => setV({ ...v, terms: e.target.value })}
          />
        </label>
        <label>
          Default demo tax (%)
          <input
            required
            type="number"
            step="0.01"
            min="0"
            max="30"
            value={v.taxBps / 100}
            onChange={(e) =>
              setV({ ...v, taxBps: Math.round(Number(e.target.value) * 100) })
            }
          />
        </label>
        <p className="helper">
          Illustrative setting. This does not imply the business is VAT
          registered.
        </p>
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
      <section className="panel form-content reset-panel">
        <span className="eyebrow">A FRESH START</span>
        <h2>Your demo workspace</h2>
        <p>
          Your changes are saved in the database and tied to this browser’s demo
          cookie for up to seven days.
        </p>
        <p>
          This is visitor isolation, not staff authentication. Use fictional
          data only.
        </p>
        <button onClick={onReset}>
          <RotateCcw size={16} />
          Reset my demo
        </button>
      </section>
    </div>
  );
}
function FollowUp({
  q,
  busy,
  onSave,
}: {
  q: Quote;
  busy: boolean;
  onSave: (v: { date: string; done: boolean }) => unknown;
}) {
  const [date, setDate] = useState(q.followUp),
    [done, setDone] = useState(q.followUpDone);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ date, done });
      }}
    >
      <h3>Follow-up</h3>
      <label>
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setDone(false);
          }}
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => setDone(e.target.checked)}
        />
        Completed
      </label>
      <button disabled={busy || q.archived}>Save follow-up</button>
      <p className="helper">Only pending sent quotes appear in the due list.</p>
    </form>
  );
}
