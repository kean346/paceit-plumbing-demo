import { money, effectiveStatus, type Quote } from "@/lib/domain";
export default function QuoteDocument({
  quote: q,
  today,
}: {
  quote: Quote;
  today: string;
}) {
  return (
    <article className="quote-paper">
      <header className="paper-header">
        <div>
          <div className="paper-brand">
            {q.company.name}
            <span>.</span>
          </div>
          <p>
            {q.company.address}
            <br />
            {q.company.email}
          </p>
        </div>
        <div className="align-right">
          <span className="eyebrow">QUOTATION</span>
          <h2>{q.number}</h2>
          <span className={`status ${effectiveStatus(q, today)}`}>
            {effectiveStatus(q, today)}
          </span>
        </div>
      </header>
      <div className="paper-meta">
        <div>
          <span className="eyebrow">PREPARED FOR</span>
          <h3>{q.customer.name}</h3>
          <p>
            {q.customer.email}
            <br />
            {q.jobAddress}
          </p>
        </div>
        <dl>
          <dt>Issue date</dt>
          <dd>{q.issueDate}</dd>
          <dt>Valid until</dt>
          <dd>{q.expiryDate}</dd>
        </dl>
      </div>
      <h2 className="job-title">{q.title}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th className="numeric">Qty</th>
              <th className="numeric">Unit price</th>
              <th className="numeric">Amount</th>
            </tr>
          </thead>
          <tbody>
            {q.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="numeric">{l.quantity}</td>
                <td className="numeric">{money(l.unitCents)}</td>
                <td className="numeric">
                  {money(
                    Math.floor(
                      (Math.round(l.quantity * 100) * l.unitCents + 50) / 100,
                    ),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="paper-totals">
        <dl>
          <dt>Subtotal</dt>
          <dd>{money(q.subtotalCents)}</dd>
          <dt>Discount</dt>
          <dd>−{money(q.discountCents)}</dd>
          <dt>Demo tax ({q.taxBps / 100}%)</dt>
          <dd>{money(q.taxCents)}</dd>
          <dt className="grand">Total quote value</dt>
          <dd className="grand">{money(q.totalCents)}</dd>
        </dl>
      </div>
      {q.notes && (
        <section>
          <h4>Job notes</h4>
          <p className="preserve">{q.notes}</p>
        </section>
      )}
      <section>
        <h4>Terms</h4>
        <p className="preserve">{q.terms}</p>
      </section>
      <footer>
        Demo · fictional data · Illustrative prices · No payment requested
        <br />
        Built by paceIT
      </footer>
    </article>
  );
}
