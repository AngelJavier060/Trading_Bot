"use client";

// Piezas de interfaz reutilizables.

import type { ReactNode } from "react";
import { DECISIONS, num, signedText, tone } from "@/lib/format";

export function Card({ title, extra, children }: { title?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || extra) && (
        <div className="card-title">
          {title && <h2>{title}</h2>}
          {extra && <span className="muted small">{extra}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub !== undefined && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Signed({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  return <span className={tone(value)}>{signedText(value, digits)}</span>;
}

export function Num({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  return <>{num(value, digits)}</>;
}

export function DecisionBadge({ decision }: { decision: string }) {
  return <span className={`badge ${decision}`}>{DECISIONS[decision] || decision}</span>;
}

export interface Column<T> {
  title: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  wrap?: boolean;
}

export function DataTable<T>({ columns, rows, empty, rowKey }: {
  columns: Column<T>[];
  rows: T[];
  empty: string;
  rowKey: (row: T, index: number) => string | number;
}) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.title} className={c.numeric ? "num" : ""}>{c.title}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {columns.map((c) => (
                <td key={c.title} className={`${c.numeric ? "num" : ""} ${c.wrap ? "wrap" : ""}`}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Message({ text, kind }: { text: string; kind?: "err" | "ok" }) {
  if (!text) return null;
  return <p className={`msg ${kind || ""}`} role={kind === "err" ? "alert" : "status"}>{text}</p>;
}
