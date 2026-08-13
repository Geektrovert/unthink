import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";

import { api } from "../../convex/_generated/api";
import { authClient } from "../auth-client";
import { beginBrowserJourney, newJourneyId, resetTelemetryIdentity } from "../posthog";
import { Button } from "../ui/button";
import { ui } from "../ui/classes";
import { Field, Panel, ProductPage, Status } from "../ui/surface";
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
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [privacyReceipt, setPrivacyReceipt] = useState<{
    counts: { files: number; rows: number };
    operationId: string;
    state: string;
  } | null>(null);
  const [deleteLearningKey] = useState(() => operationId("delete-learning"));
  const [deleteLearningOperationId] = useState(() => newJourneyId("delete_learning_data"));
  const [settingsAnchor, setSettingsAnchor] = useState("");
  const [settingsRevival, setSettingsRevival] = useState("");
  const [settingsNorthStar, setSettingsNorthStar] = useState("");
  const [settingsSupports, setSettingsSupports] = useState<
    Array<"exact-resume" | "written-outline" | "low-stimulation" | "optional-timer">
  >([]);
  const [defaultMode, setDefaultMode] = useState<"rescue" | "standard" | "deep">("standard");
  const [lowStimulation, setLowStimulation] = useState(false);
  const [timerVisible, setTimerVisible] = useState(false);
  const [showXpSetting, setShowXpSetting] = useState(true);
  const [celebrationSetting, setCelebrationSetting] = useState(true);
  const [soundSetting, setSoundSetting] = useState(false);
  const [motionSetting, setMotionSetting] = useState(true);
  const [rewardSuggestionsSetting, setRewardSuggestionsSetting] = useState(true);
  const [rewardCategories, setRewardCategories] = useState<Array<"creative" | "choice">>([]);

  useEffect(() => {
    if (profile === undefined || profile === null) return;
    setSettingsAnchor(profile.anchor ?? "");
    setSettingsRevival(profile.revival ?? "");
    setSettingsNorthStar(profile.northStar ?? "");
    setSettingsSupports(profile.supports ?? []);
    setDefaultMode(profile.learningPreferences?.defaultMode ?? "standard");
    setLowStimulation(profile.learningPreferences?.lowStimulation ?? false);
    setTimerVisible(profile.learningPreferences?.timerVisible ?? false);
    setShowXpSetting(profile.rewardPreferences?.showXp ?? true);
    setCelebrationSetting(profile.rewardPreferences?.celebration ?? true);
    setSoundSetting(profile.rewardPreferences?.sound ?? false);
    setMotionSetting(profile.rewardPreferences?.motion ?? true);
    setRewardSuggestionsSetting(profile.rewardPreferences?.rewardSuggestions ?? true);
    setRewardCategories(profile.rewardPreferences?.rewardCategories ?? []);
  }, [profile]);

  const supportOptions = [
    "exact-resume",
    "written-outline",
    "low-stimulation",
    "optional-timer",
  ] as const;
  const rewardCategoryOptions = ["creative", "choice"] as const;
  const rewardToggles = [
    { checked: showXpSetting, label: "Show deterministic XP", setChecked: setShowXpSetting },
    {
      checked: celebrationSetting,
      label: "Show celebration",
      setChecked: setCelebrationSetting,
    },
    { checked: soundSetting, label: "Play sound", setChecked: setSoundSetting },
    { checked: motionSetting, label: "Use motion", setChecked: setMotionSetting },
    {
      checked: rewardSuggestionsSetting,
      label: "Show real-world reward suggestions",
      setChecked: setRewardSuggestionsSetting,
    },
  ];

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
          <form
            className={ui.stack}
            onSubmit={(event) => {
              event.preventDefault();
              fire(async () => {
                const settingsOperationId = newJourneyId("update_learning_settings");
                const browserOperation = beginBrowserJourney(
                  "update_learning_settings",
                  settingsOperationId,
                );
                try {
                  await updateLearningSettings({
                    anchor: settingsAnchor,
                    learningPreferences: { defaultMode, lowStimulation, timerVisible },
                    northStar: settingsNorthStar,
                    operationId: settingsOperationId,
                    revival: settingsRevival || undefined,
                    supports: settingsSupports,
                  });
                  browserOperation.succeeded();
                  setMessage("Learning settings saved.");
                } catch (cause) {
                  browserOperation.failed(cause);
                  setMessage("Learning settings were not saved. Check the fields and retry.");
                }
              });
            }}
          >
            <Field label="Anchor">
              <input
                onChange={(event) => setSettingsAnchor(event.target.value)}
                required
                value={settingsAnchor}
              />
            </Field>
            <Field label="Revival (optional)">
              <input
                onChange={(event) => setSettingsRevival(event.target.value)}
                value={settingsRevival}
              />
            </Field>
            <Field label="North Star">
              <input
                onChange={(event) => setSettingsNorthStar(event.target.value)}
                required
                value={settingsNorthStar}
              />
            </Field>
            <Field label="Default capacity mode">
              <select
                onChange={(event) => {
                  const selected = (["rescue", "standard", "deep"] as const).find(
                    (mode) => mode === event.target.value,
                  );
                  if (selected !== undefined) setDefaultMode(selected);
                }}
                value={defaultMode}
              >
                <option value="rescue">Rescue</option>
                <option value="standard">Standard</option>
                <option value="deep">Deep</option>
              </select>
            </Field>
            <div className={ui.stack}>
              <strong>Supports</strong>
              {supportOptions.map((support) => (
                <label className={ui.check} key={support}>
                  <input
                    checked={settingsSupports.includes(support)}
                    onChange={(event) =>
                      setSettingsSupports((current) =>
                        event.target.checked
                          ? [...new Set([...current, support])]
                          : current.filter((value) => value !== support),
                      )
                    }
                    type="checkbox"
                  />{" "}
                  {support}
                </label>
              ))}
            </div>
            <label className={ui.check}>
              <input
                checked={lowStimulation}
                onChange={(event) => setLowStimulation(event.target.checked)}
                type="checkbox"
              />{" "}
              Use low-stimulation presentation
            </label>
            <label className={ui.check}>
              <input
                checked={timerVisible}
                onChange={(event) => setTimerVisible(event.target.checked)}
                type="checkbox"
              />{" "}
              Show the optional timer
            </label>
            <p className={ui.muted}>
              Why this shape? One Anchor, at most one Revival, and one horizon keep wider interests
              visible but not due.
            </p>
            <Button type="submit">Save learning settings</Button>
          </form>
        ) : null}
        {section === "rewards" ? (
          <form
            className={ui.stack}
            onSubmit={(event) => {
              event.preventDefault();
              fire(async () => {
                const settingsOperationId = newJourneyId("update_reward_settings");
                const browserOperation = beginBrowserJourney(
                  "update_reward_settings",
                  settingsOperationId,
                );
                try {
                  await updateRewardSettings({
                    operationId: settingsOperationId,
                    preferences: {
                      celebration: celebrationSetting,
                      motion: motionSetting,
                      rewardCategories,
                      rewardSuggestions: rewardSuggestionsSetting,
                      showXp: showXpSetting,
                      sound: soundSetting,
                    },
                  });
                  browserOperation.succeeded();
                  setMessage("Reward settings saved.");
                } catch (cause) {
                  browserOperation.failed(cause);
                  setMessage("Reward settings were not saved. Retry the same action.");
                }
              });
            }}
          >
            {rewardToggles.map(({ checked, label, setChecked }) => (
              <label className={ui.check} key={label}>
                <input
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  type="checkbox"
                />{" "}
                {label}
              </label>
            ))}
            <div className={ui.stack}>
              <strong>Allowed pre-agreed reward categories</strong>
              {rewardCategoryOptions.map((category) => (
                <label className={ui.check} key={category}>
                  <input
                    checked={rewardCategories.includes(category)}
                    onChange={(event) =>
                      setRewardCategories((current) =>
                        event.target.checked
                          ? [...new Set([...current, category])]
                          : current.filter((value) => value !== category),
                      )
                    }
                    type="checkbox"
                  />{" "}
                  {category}
                </label>
              ))}
            </div>
            <Button type="submit">Save reward settings</Button>
          </form>
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
            <Field label="Typed confirmation">
              <input
                onChange={(event) => setConfirmation(event.target.value)}
                value={confirmation}
              />
            </Field>
            <Button
              tone="danger"
              onClick={() =>
                fire(async () => {
                  if (deletePreview === undefined) return;
                  const browserOperation = beginBrowserJourney(
                    "delete_learning_data",
                    deleteLearningOperationId,
                  );
                  try {
                    const receipt = await confirmDelete({
                      confirmation,
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
                    setMessage(
                      "Deletion did not complete. Review the current preview and sign in again.",
                    );
                  }
                })
              }
            >
              Delete all learning data
            </Button>
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
