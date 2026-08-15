import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";

import { api } from "../../convex/_generated/api";
import { beginBrowserJourney, newJourneyId } from "../posthog";
import { Button } from "../ui/button";
import { ui } from "../ui/classes";
import { useAppForm } from "../ui/form";
import { Panel, ProductPage, Status } from "../ui/surface";
import { fire, operationId } from "./support";

type NextIntent = "anchor" | "recall" | "bridge" | "teach" | "revival" | "north-star" | "review";
const defaultNextIntent: NextIntent = "anchor";

export function RewardsPage() {
  const profile = useQuery(api.profile.get, {});
  const rewards = useQuery(api.rewards.listAvailable, {});
  const ledger = useQuery(api.rewards.getLedger, {});
  const redemptions = useQuery(api.rewards.listRedemptions, {});
  const eligibleIntents = useQuery(api.rewards.getEligibleIntents, {});
  const redeem = useMutation(api.rewards.redeem);
  const [message, setMessage] = useState("");
  const nextIntentForm = useAppForm({
    defaultValues: { nextIntent: defaultNextIntent },
  });
  useEffect(() => {
    if (eligibleIntents === undefined) return;
    if (!eligibleIntents.includes(nextIntentForm.state.values.nextIntent)) {
      nextIntentForm.setFieldValue("nextIntent", eligibleIntents[0] ?? "anchor");
    }
  }, [eligibleIntents, nextIntentForm]);
  return (
    <ProductPage>
      <Panel title="Deterministic rewards">
        <p className={ui.muted}>Unlocks never consume or rewrite lifetime XP.</p>
        {profile?.rewardPreferences?.showXp === false ? null : (
          <p>Lifetime XP · {ledger?.lifetimeXp ?? 0}</p>
        )}
        {profile?.rewardPreferences?.rewardSuggestions === false ? (
          <p>Reward suggestions are hidden. You can enable them in Reward settings.</p>
        ) : null}
        <div className={ui.list}>
          {rewards?.map((reward) => (
            <div className={ui.listItem} key={reward.rewardKey}>
              <strong>
                {reward.title}
                {profile?.rewardPreferences?.showXp === false ? "" : ` · ${reward.threshold} XP`}
              </strong>
              <span>{reward.description}</span>
              {reward.rewardKey === "choose-next-intent" && reward.state === "available" ? (
                <nextIntentForm.AppField name="nextIntent">
                  {(field) => (
                    <field.SelectField
                      items={(eligibleIntents ?? []).map((intent) => ({
                        label: intent,
                        value: intent,
                      }))}
                      label="Choose the next reviewed intent"
                    />
                  )}
                </nextIntentForm.AppField>
              ) : null}
              <Button
                disabled={reward.state !== "available"}
                onClick={() =>
                  fire(async () => {
                    try {
                      const receipt = {
                        catalogueVersion: reward.catalogueVersion,
                        idempotencyKey: operationId("redeem"),
                        operationId: newJourneyId("redeem_reward"),
                        rewardKey: reward.rewardKey,
                      };
                      const browserOperation = beginBrowserJourney(
                        "redeem_reward",
                        receipt.operationId,
                      );
                      try {
                        if (reward.rewardKey === "choose-next-intent") {
                          await redeem({
                            ...receipt,
                            choiceKey: nextIntentForm.state.values.nextIntent,
                          });
                        } else {
                          await redeem(receipt);
                        }
                        browserOperation.succeeded();
                      } catch (cause) {
                        browserOperation.failed(cause);
                        throw cause;
                      }
                      setMessage("Receipt saved. Lifetime XP is unchanged.");
                    } catch {
                      setMessage("The reward state changed. Refresh and try again.");
                    }
                  })
                }
              >
                {reward.state === "available" ? "Use once" : reward.state}
              </Button>
            </div>
          ))}
        </div>
        <div className={ui.stack}>
          <strong>Immutable award ledger</strong>
          {ledger?.rows.length === 0 ? <p>No awards yet.</p> : null}
          {ledger?.rows.map((row) => (
            <p className={ui.muted} key={row.operationId + row.awardKind}>
              {row.awardKind} · +{row.amount} · {new Date(row.createdAt).toLocaleString()}
            </p>
          ))}
        </div>
        <div className={ui.stack}>
          <strong>Redemption receipts</strong>
          {redemptions?.length === 0 ? <p>No redemptions yet.</p> : null}
          {redemptions?.map((receipt) => (
            <p className={ui.muted} key={receipt.operationId}>
              {receipt.rewardKey} · {receipt.state} · operation {receipt.operationId} ·{" "}
              {new Date(receipt.redeemedAt).toLocaleString()}
              {receipt.targetDayKey === undefined ? "" : ` · target ${receipt.targetDayKey}`}
              {receipt.appliedSeedKey === undefined ? "" : ` · seed ${receipt.appliedSeedKey}`}
            </p>
          ))}
        </div>
        {message ? <Status>{message}</Status> : null}
      </Panel>
    </ProductPage>
  );
}
