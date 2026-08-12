import { Button } from "./ui/button";

export function Today() {
  return (
    <main className="ds-page">
      <section className="ds-panel">
        <p className="text-sm font-medium text-muted">Today</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">One useful thing.</h1>
        <p className="mt-3 max-w-prose text-muted">
          Pick the smallest version that matches the brain you have today.
        </p>
        <div className="mt-6">
          <Button>Start a rescue quest</Button>
        </div>
      </section>
    </main>
  );
}
