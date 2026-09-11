/**
 * The workspace's shared primitives. Extracted from App so the facility
 * panels can use the same card, row and badge rather than growing a second
 * visual language beside them.
 */
import type React from "react";
import { PROVENANCE_COPY, type Provenance } from "./facility-view";

export function Card({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return <section className={`card ${className}`}><h2>{title}</h2>{children}</section>;
}

export function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="data-row"><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong></div>;
}

export function RailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rail-row"><span>{label}</span><strong>{children}</strong></div>;
}

export function Badge({ tone, children }: { tone: "success" | "warning" | "danger" | "accent" | "neutral"; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/**
 * Where a number on this screen came from.
 *
 * The workspace derives a great deal that the Hedera controller will
 * eventually enforce. Both are useful; confusing them is not. This marker is
 * deliberately plain and always present rather than tucked into a tooltip —
 * a reader should never have to hunt for whether a figure is binding.
 */
export function Source({ provenance, children }: { provenance: Provenance; children?: React.ReactNode }) {
  return (
    <span className={`source-mark source-${provenance}`} title={PROVENANCE_COPY[provenance]}>
      <span className="source-dot" aria-hidden="true" />
      {children ?? PROVENANCE_COPY[provenance]}
    </span>
  );
}

/** A control the controller will own, shown as unavailable rather than hidden. */
export function PendingAction({ label, because }: { label: string; because: string }) {
  return (
    <div className="pending-action">
      <button type="button" disabled aria-describedby={`pending-${label.replace(/\W+/g, "-")}`}>{label}</button>
      <small id={`pending-${label.replace(/\W+/g, "-")}`}>{because}</small>
    </div>
  );
}
