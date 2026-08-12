import { useQuery } from "convex/react";
import type { ReactNode } from "react";

import { api } from "../../convex/_generated/api";

export function ProductPage({ children }: { children: ReactNode }) {
  const profile = useQuery(api.profile.get, {});
  const presentationClasses = [
    "ds-app",
    profile?.learningPreferences?.lowStimulation ? "ds-low-stimulation" : "",
    profile?.rewardPreferences?.motion === false ? "ds-motion-off" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={presentationClasses}>
      <header className="ds-header">
        <a className="ds-brand" href="/today">
          Unthink
        </a>
        <nav aria-label="Primary">
          <a href="/today">Today</a>
          <a href="/proofs">Proofs</a>
          <a href="/rewards">Rewards</a>
          <a href="/settings/learning">Settings</a>
        </nav>
      </header>
      <main className="ds-content">{children}</main>
    </div>
  );
}

export function Panel({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="ds-panel">
      {title === undefined ? null : <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function Status({ children }: { children: ReactNode }) {
  return (
    <p className="ds-status" role="status">
      {children}
    </p>
  );
}

export function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="ds-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
