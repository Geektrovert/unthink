import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { api } from "../../convex/_generated/api";
import {
  capacityModes,
  rewardCategoryOptions,
  supportOptions,
} from "../../shared/product-contract";
import { authClient } from "../auth-client";
import { beginBrowserJourney, newJourneyId, resetTelemetryIdentity } from "../posthog";
import { Button } from "../ui/button";
import { ui } from "../ui/classes";
import { useAppForm } from "../ui/form";
import { Panel, ProductPage, Status } from "../ui/surface";
import {
  initialLearningSettings,
  initialRewardSettings,
  learningSettingsMutationArgs,
  learningSettingsSchema,
  reconcileLearningSettings,
  reconcileRewardSettings,
  rewardSettingsMutationArgs,
  rewardSettingsSchema,
} from "./settings-form";
import { clearDeviceDrafts, fire, operationId } from "./support";

export function SettingsPage({
  section,
}: {
  section: "learning" | "rewards" | "security" | "privacy";
}) {
  const profile = useQuery(api.profile.get, {});
  const deletePreview = useQuery(
    api.privacy.preview,
    section === "privacy" ? { kind: "delete_learning" } : "skip",
  );
  const prepareExport = useAction(api.privacy.prepareExport);
  const getExportDownload = useAction(api.privacy.exportDownload);
  const confirmDelete = useAction(api.privacy.confirmDelete);
  const updateLearningSettings = useMutation(api.profile.updateLearningSettings);
  const updateRewardSettings = useMutation(api.profile.updateRewardSettings);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [privacyReceipt, setPrivacyReceipt] = useState<{
    counts: { files: number; rows: number };
    operationId: string;
    state: string;
  } | null>(null);
  const [deleteLearningKey] = useState(() => operationId("delete-learning"));
  const [deleteLearningOperationId] = useState(() => newJourneyId("delete_learning_data"));

  const learningForm = useAppForm({
    defaultValues: initialLearningSettings(),
    validators: { onSubmit: learningSettingsSchema },
    onSubmit: async ({ formApi, value }) => {
      const settings = learningSettingsSchema.parse(value);
      const settingsOperationId = newJourneyId("update_learning_settings");
      const browserOperation = beginBrowserJourney("update_learning_settings", settingsOperationId);
      try {
        await updateLearningSettings(learningSettingsMutationArgs(settings, settingsOperationId));
        formApi.reset(settings);
        browserOperation.succeeded();
        setMessage("Learning settings saved.");
      } catch (cause) {
        browserOperation.failed(cause);
        setMessage("Learning settings were not saved. Check the fields and retry.");
      }
    },
  });

  const rewardForm = useAppForm({
    defaultValues: initialRewardSettings(),
    validators: { onSubmit: rewardSettingsSchema },
    onSubmit: async ({ formApi, value }) => {
      const preferences = rewardSettingsSchema.parse(value);
      const settingsOperationId = newJourneyId("update_reward_settings");
      const browserOperation = beginBrowserJourney("update_reward_settings", settingsOperationId);
      try {
        await updateRewardSettings(rewardSettingsMutationArgs(preferences, settingsOperationId));
        formApi.reset(preferences);
        browserOperation.succeeded();
        setMessage("Reward settings saved.");
      } catch (cause) {
        browserOperation.failed(cause);
        setMessage("Reward settings were not saved. Retry the same action.");
      }
    },
  });

  const privacyForm = useAppForm({
    defaultValues: { confirmation: "" },
    validators: {
      onSubmit: z.object({ confirmation: z.string().min(1, "Type the confirmation phrase.") }),
    },
    onSubmit: async ({ value }) => {
      if (deletePreview === undefined) return;
      const browserOperation = beginBrowserJourney(
        "delete_learning_data",
        deleteLearningOperationId,
      );
      try {
        const receipt = await confirmDelete({
          confirmation: value.confirmation,
          consequenceHash: deletePreview.consequenceHash,
          idempotencyKey: deleteLearningKey,
          kind: "delete_learning",
          operationId: deleteLearningOperationId,
        });
        if (receipt.state !== "completed") {
          browserOperation.failed(new Error("DELETION_INCOMPLETE"));
          setMessage(`Deletion is retryable: ${receipt.failureClass ?? "incomplete"}.`);
          return;
        }
        clearDeviceDrafts();
        setPrivacyReceipt(receipt);
        browserOperation.succeeded();
        setMessage("Learning data deletion receipt saved; device drafts cleared.");
      } catch (cause) {
        browserOperation.failed(cause);
        setMessage("Deletion did not complete. Review the current preview and sign in again.");
      }
    },
  });

  useEffect(() => {
    if (profile === undefined || profile === null) return;
    const learning = reconcileLearningSettings(profile, {
      isDirty: learningForm.state.isDirty,
    });
    if (learning.kind === "replace-from-profile") learningForm.reset(learning.values);
    const rewards = reconcileRewardSettings(profile, {
      isDirty: rewardForm.state.isDirty,
    });
    if (rewards.kind === "replace-from-profile") rewardForm.reset(rewards.values);
  }, [learningForm, profile, rewardForm]);

  return (
    <ProductPage>
      <div className={ui.settingsNav}>
        {(["learning", "rewards", "security", "privacy"] as const).map((item) => (
          <a
            aria-current={item === section ? "page" : undefined}
            href={`/settings/${item}`}
            key={item}
          >
            {item}
          </a>
        ))}
      </div>
      <Panel title={`Settings · ${section}`}>
        {section === "learning" ? (
          <learningForm.AppForm>
            <learningForm.FormRoot>
              {(
                [
                  ["anchor", "Anchor"],
                  ["revival", "Revival (optional)"],
                  ["northStar", "North Star"],
                ] as const
              ).map(([name, label]) => (
                <learningForm.AppField key={name} name={name}>
                  {(field) => <field.TextField label={label} />}
                </learningForm.AppField>
              ))}
              <learningForm.AppField name="defaultMode">
                {(field) => (
                  <field.SelectField
                    items={capacityModes.map((mode) => ({ label: titleCase(mode), value: mode }))}
                    label="Default capacity mode"
                  />
                )}
              </learningForm.AppField>
              <learningForm.AppField name="supports">
                {(field) => (
                  <field.CheckboxGroupField
                    items={supportOptions.map((value) => ({ label: value, value }))}
                    legend="Supports"
                  />
                )}
              </learningForm.AppField>
              {(
                [
                  ["lowStimulation", "Use low-stimulation presentation"],
                  ["timerVisible", "Show the optional timer"],
                ] as const
              ).map(([name, label]) => (
                <learningForm.AppField key={name} name={name}>
                  {(field) => <field.CheckboxField label={label} />}
                </learningForm.AppField>
              ))}
              <p className={ui.muted}>
                Why this shape? One Anchor, at most one Revival, and one horizon keep wider
                interests visible but not due.
              </p>
              <learningForm.SubmitButton
                idleLabel="Save learning settings"
                pendingLabel="Saving…"
              />
            </learningForm.FormRoot>
          </learningForm.AppForm>
        ) : null}
        {section === "rewards" ? (
          <rewardForm.AppForm>
            <rewardForm.FormRoot>
              {(
                [
                  ["showXp", "Show deterministic XP"],
                  ["celebration", "Show celebration"],
                  ["sound", "Play sound"],
                  ["motion", "Use motion"],
                  ["rewardSuggestions", "Show real-world reward suggestions"],
                ] as const
              ).map(([name, label]) => (
                <rewardForm.AppField key={name} name={name}>
                  {(field) => <field.CheckboxField label={label} />}
                </rewardForm.AppField>
              ))}
              <rewardForm.AppField name="rewardCategories">
                {(field) => (
                  <field.CheckboxGroupField
                    items={rewardCategoryOptions.map((value) => ({ label: value, value }))}
                    legend="Allowed pre-agreed reward categories"
                  />
                )}
              </rewardForm.AppField>
              <rewardForm.SubmitButton idleLabel="Save reward settings" pendingLabel="Saving…" />
            </rewardForm.FormRoot>
          </rewardForm.AppForm>
        ) : null}
        {section === "security" ? (
          <div className={ui.stack}>
            <p>
              Password is the currently tested recovery credential. Passkeys appear only after the
              live compatibility gate.
            </p>
            <Button onClick={() => void authClient.revokeOtherSessions()}>
              Sign out other sessions
            </Button>
            <Button
              onClick={() =>
                fire(async () => {
                  const result = await authClient.signOut();
                  if (!result.error) {
                    resetTelemetryIdentity();
                    clearDeviceDrafts();
                  }
                })
              }
              tone="quiet"
            >
              Sign out here
            </Button>
          </div>
        ) : null}
        {section === "privacy" ? (
          <div className={ui.stack}>
            <p>
              Convex stores canonical learning data. Optional PostHog receives only redacted
              operation facts.
            </p>
            <Button
              onClick={() =>
                fire(async () => {
                  const exportOperationId = newJourneyId("prepare_learning_data_export");
                  const browserOperation = beginBrowserJourney(
                    "prepare_learning_data_export",
                    exportOperationId,
                  );
                  try {
                    const receipt = await prepareExport({
                      idempotencyKey: operationId("export"),
                      operationId: exportOperationId,
                    });
                    setExportUrl(await getExportDownload({ operationId: receipt.operationId }));
                    browserOperation.succeeded();
                    setMessage(
                      `Export prepared: ${receipt.counts.rows} rows, checksum ${receipt.checksum.slice(0, 12)}…`,
                    );
                  } catch (cause) {
                    browserOperation.failed(cause);
                    setMessage("Sign in again, then retry the export.");
                  }
                })
              }
            >
              Prepare private export
            </Button>
            {exportUrl ? <a href={exportUrl}>Download the short-lived private export</a> : null}
            <privacyForm.AppForm>
              <privacyForm.FormRoot>
                <privacyForm.AppField name="confirmation">
                  {(field) => (
                    <field.TextField
                      label={`Type ${deletePreview?.confirmation ?? "the confirmation phrase"}`}
                    />
                  )}
                </privacyForm.AppField>
                <privacyForm.SubmitButton
                  disabled={deletePreview === undefined}
                  idleLabel="Delete all learning data"
                  pendingLabel="Deleting…"
                  tone="danger"
                />
              </privacyForm.FormRoot>
            </privacyForm.AppForm>
            <p className={ui.muted}>
              Account closure stays hidden until live Better Auth identity deletion and session
              revocation pass the compatibility gate.
            </p>
          </div>
        ) : null}
        {message ? <Status>{message}</Status> : null}
        {privacyReceipt === null ? null : (
          <div className={ui.stack}>
            <strong>Durable deletion receipt</strong>
            <span>State · {privacyReceipt.state}</span>
            <span>Operation · {privacyReceipt.operationId}</span>
            <span>
              Deleted · {privacyReceipt.counts.rows} rows, {privacyReceipt.counts.files} files
            </span>
          </div>
        )}
      </Panel>
    </ProductPage>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
