import { Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { authClient } from "./auth-client";
import { Button } from "./ui/button";

type AuthMode = "sign-in" | "bootstrap";

export function AuthPage() {
  const session = authClient.useSession();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);

  if (session.data?.session) {
    return <Navigate to="/today" replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDenied(false);
    setPending(true);
    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, name: "Owner", password });
      if (result.error) {
        setDenied(true);
        return;
      }
      if (mode === "bootstrap") {
        setMode("sign-in");
        setPassword("");
      }
    } catch {
      setDenied(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="ds-page">
      <section className="ds-panel" aria-labelledby="auth-title">
        <p className="ds-eyebrow">Private learning space</p>
        <h1 id="auth-title">{mode === "sign-in" ? "Welcome back." : "Create the owner."}</h1>
        <p className="ds-muted">
          {mode === "sign-in"
            ? "Sign in with the owner recovery credential."
            : "Bootstrap works only while the operator-controlled window is open."}
        </p>
        <form className="ds-stack" onSubmit={(event) => void submit(event)}>
          <label className="ds-field">
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="ds-field">
            <span>Password</span>
            <input
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {denied ? (
            <p className="ds-error" role="alert">
              That request could not be completed.
            </p>
          ) : null}
          <Button disabled={pending} type="submit">
            {pending ? "Checking…" : mode === "sign-in" ? "Sign in" : "Create owner"}
          </Button>
        </form>
        <button
          className="ds-text-button"
          onClick={() => {
            setDenied(false);
            setMode(mode === "sign-in" ? "bootstrap" : "sign-in");
          }}
          type="button"
        >
          {mode === "sign-in" ? "Operator bootstrap" : "Back to sign in"}
        </button>
      </section>
    </main>
  );
}

export function AuthRecoveryPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <main className="ds-page">
      <section className="ds-panel">
        <p className="ds-eyebrow">Configured recovery</p>
        <h1>Recover with the owner password.</h1>
        <p className="ds-muted">
          No email delivery or recovery codes are configured. A successful password sign-in revokes
          the other sessions before returning to Today.
        </p>
        <form
          className="ds-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              setPending(true);
              setMessage("");
              try {
                const result = await authClient.signIn.email({ email, password });
                if (result.error) {
                  setMessage("Recovery could not be completed.");
                  return;
                }
                const revoked = await authClient.revokeOtherSessions();
                if (revoked.error) {
                  setMessage("Signed in, but other sessions were not revoked. Retry recovery.");
                  return;
                }
                window.location.href = "/today";
              } catch {
                setMessage("Recovery could not be completed.");
              } finally {
                setPending(false);
              }
            })();
          }}
        >
          <label className="ds-field">
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="ds-field">
            <span>Owner password</span>
            <input
              autoComplete="current-password"
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {message ? <p className="ds-error">{message}</p> : null}
          <Button disabled={pending} type="submit">
            {pending ? "Recovering…" : "Recover and revoke other sessions"}
          </Button>
        </form>
      </section>
    </main>
  );
}
