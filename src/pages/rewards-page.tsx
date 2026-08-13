import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";

import { api } from "../../convex/_generated/api";
import { Button } from "../ui/button";
import { ui } from "../ui/classes";
import { Field, Panel, ProductPage, Status } from "../ui/surface";
import { fire, operationId } from "./support";

export function RewardsPage() {
  const profile = useQuery(api.profile.get, {});
  const rewards = useQuery(api.rewards.listAvailable, {});
  const ledger = useQuery(api.rewards.getLedger, {});
  const redemptions = useQuery(api.rewards.listRedemptions, {});
  const eligibleIntents = useQuery(api.rewards.getEligibleIntents, {});
  const redeem = useMutation(api.rewards.redeem);
  const [message, setMessage] = useState("");
  const [nextIntent, setNextIntent] = useState<
    "anchor" | "recall" | "bridge" | "teach" | "revival" | "north-star" | "review"
  >("anchor");
  useEffect(() => {
    if (eligibleIntents?.includes(nextIntent) === false)
      setNextIntent(eligibleIntents[0] ?? "anchor");
  }, [eligibleIntents, nextIntent]);
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
                <Field label="Choose the next reviewed intent">
                  <select
                    onChange={(event) => setNextIntent(event.target.value as typeof nextIntent)}
                    value={nextIntent}
                  >
                    {eligibleIntents?.map((intent) => (
                      <option key={intent} value={intent}>
                        {intent}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Button
                disabled={reward.state !== "available"}
                onClick={() =>
                  fire(async () => {
                    try {
                      await redeem({
                        catalogueVersion: reward.catalogueVersion,
                        ...(reward.rewardKey === "choose-next-intent"
                          ? { choiceKey: nextIntent }
                          : {}),
                        idempotencyKey: operationId("redeem"),
                        operationId: operationId("reward"),
                        rewardKey: reward.rewardKey,
                      });
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
