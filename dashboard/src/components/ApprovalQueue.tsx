import { useState } from "react";
import type { Approval } from "../types.js";
export function ApprovalQueue({
  approvals,
  onDecision,
}: {
  approvals: Approval[];
  onDecision(
    id: string,
    decision: "APPROVE_ONCE" | "APPROVE_SESSION" | "DENY",
  ): Promise<void>;
}) {
  const pending = approvals.filter((item) => item.status === "PENDING");
  const [selected, setSelected] = useState<string | null>(
    pending[0]?.id ?? null,
  );
  const active = pending.find((item) => item.id === selected) ?? pending[0];
  const [busy, setBusy] = useState(false);
  const decide = async (
    decision: "APPROVE_ONCE" | "APPROVE_SESSION" | "DENY",
  ) => {
    if (!active) return;
    setBusy(true);
    try {
      await onDecision(active.id, decision);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel approvals">
      <div className="panel-title">
        <h2>Approval queue</h2>
        <span>{pending.length} pending</span>
      </div>
      {active ? (
        <>
          <div className="approval-detail">
            <div className="approval-heading">
              <span className={`risk ${active.risk.toLowerCase()}`}>
                {active.risk} risk
              </span>
              <strong>{active.toolName}</strong>
            </div>
            <dl>
              <div>
                <dt>Reason</dt>
                <dd>{active.reason}</dd>
              </div>
              <div>
                <dt>Impact</dt>
                <dd>{active.impact}</dd>
              </div>
              <div>
                <dt>Resources</dt>
                <dd>
                  {active.affectedResources.join(", ") || "Not specified"}
                </dd>
              </div>
            </dl>
            <div className="approval-actions">
              <button
                disabled={busy}
                className="approve"
                onClick={() => void decide("APPROVE_ONCE")}
              >
                Approve once
              </button>
              <button
                disabled={busy}
                onClick={() => void decide("APPROVE_SESSION")}
              >
                Approve session
              </button>
              <button
                disabled={busy}
                className="deny"
                onClick={() => void decide("DENY")}
              >
                Deny
              </button>
            </div>
          </div>
          <div className="approval-list">
            {pending
              .filter((item) => item.id !== active.id)
              .map((item) => (
                <button key={item.id} onClick={() => setSelected(item.id)}>
                  <span className={`risk ${item.risk.toLowerCase()}`}>
                    {item.risk}
                  </span>
                  <span>{item.toolName}</span>
                </button>
              ))}
          </div>
        </>
      ) : (
        <div className="empty approval-empty">
          No operations are waiting for approval.
        </div>
      )}
    </section>
  );
}
