import { Navigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { z } from "zod";

import { api } from "../convex/_generated/api";
import { authClient } from "./auth-client";
import { ui } from "./ui/classes";
import { useAppForm } from "./ui/form";

type AuthMode = "sign-in" | "bootstrap";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(128, "Use no more than 128 characters."),
});

export function AuthPage() {
  const session = authClient.useSession();
  const bootstrapStatus = useQuery(api.auth_public.getBootstrapStatus, {});
  const [requestedMode, setRequestedMode] = useState<AuthMode>("sign-in");
  const bootstrapEnabled = bootstrapStatus?.enabled === true;
  const mode = bootstrapEnabled ? requestedMode : "sign-in";

  if (session.data?.session) return <Navigate to="/today" replace />;

  return (
    <main className={ui.page}>
      <section className={ui.panel} aria-labelledby="auth-title">
        <p className={ui.eyebrow}>Private learning space</p>
        <h1 id="auth-title">{mode === "sign-in" ? "Welcome back." : "Create the owner."}</h1>
        <p className={ui.muted}>
          {mode === "sign-in"
            ? "Sign in with the owner recovery credential."
            : "Bootstrap works only while the operator-controlled window is open."}
        </p>
        <CredentialsForm
          key={mode}
          mode={mode}
          onBootstrapCreated={() => setRequestedMode("sign-in")}
        />
        {mode === "bootstrap" || bootstrapEnabled ? (
          <button
            className={ui.textButton}
            onClick={() =>
              setRequestedMode((current) => (current === "sign-in" ? "bootstrap" : "sign-in"))
            }
            type="button"
          >
            {mode === "sign-in" ? "Operator bootstrap" : "Back to sign in"}
          </button>
        ) : null}
      </section>
    </main>
  );
}

function CredentialsForm({
  mode,
  onBootstrapCreated,
}: {
  mode: AuthMode;
  onBootstrapCreated: () => void;
}) {
  const [submissionError, setSubmissionError] = useState("");
  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: credentialsSchema },
    onSubmit: async ({ value }) => {
      setSubmissionError("");
      const credentials = credentialsSchema.parse(value);

      try {
        const result =
          mode === "sign-in"
            ? await authClient.signIn.email(credentials)
            : await authClient.signUp.email({ ...credentials, name: "Owner" });
        if (result.error) {
          setSubmissionError("That request could not be completed.");
          return;
        }
        if (mode === "bootstrap") {
          form.reset();
          onBootstrapCreated();
        }
      } catch {
        setSubmissionError("That request could not be completed.");
      }
    },
  });

  return (
    <form.AppForm>
      <form.FormRoot>
        <form.AppField name="email">
          {(field) => (
            <field.TextField autoComplete="email" inputMode="email" label="Email" type="email" />
          )}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.PasswordField
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              label="Password"
            />
          )}
        </form.AppField>
        {submissionError ? (
          <p className={ui.error} role="alert">
            {submissionError}
          </p>
        ) : null}
        <form.SubmitButton
          idleLabel={mode === "sign-in" ? "Sign in" : "Create owner"}
          pendingLabel="Checking…"
        />
      </form.FormRoot>
    </form.AppForm>
  );
}

export function AuthRecoveryPage() {
  const [submissionError, setSubmissionError] = useState("");
  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: credentialsSchema },
    onSubmit: async ({ value }) => {
      setSubmissionError("");
      const credentials = credentialsSchema.parse(value);

      try {
        const result = await authClient.signIn.email(credentials);
        if (result.error) {
          setSubmissionError("Recovery could not be completed.");
          return;
        }
        const revoked = await authClient.revokeOtherSessions();
        if (revoked.error) {
          setSubmissionError("Signed in, but other sessions were not revoked. Retry recovery.");
          return;
        }
        window.location.href = "/today";
      } catch {
        setSubmissionError("Recovery could not be completed.");
      }
    },
  });

  return (
    <main className={ui.page}>
      <section className={ui.panel}>
        <p className={ui.eyebrow}>Configured recovery</p>
        <h1>Recover with the owner password.</h1>
        <p className={ui.muted}>
          No email delivery or recovery codes are configured. A successful password sign-in revokes
          the other sessions before returning to Today.
        </p>
        <form.AppForm>
          <form.FormRoot>
            <form.AppField name="email">
              {(field) => (
                <field.TextField
                  autoComplete="email"
                  inputMode="email"
                  label="Email"
                  type="email"
                />
              )}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.PasswordField autoComplete="current-password" label="Owner password" />
              )}
            </form.AppField>
            {submissionError ? (
              <p className={ui.error} role="alert">
                {submissionError}
              </p>
            ) : null}
            <form.SubmitButton
              idleLabel="Recover and revoke other sessions"
              pendingLabel="Recovering…"
            />
          </form.FormRoot>
        </form.AppForm>
      </section>
    </main>
  );
}
