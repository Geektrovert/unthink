import { useParams } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "../ui/button";
import { ui } from "../ui/classes";
import { Field, Panel, ProductPage, Status } from "../ui/surface";
import { fire, operationId } from "./support";

export function ProofsPage() {
  const proofs = useQuery(api.evidence.listMine, { limit: 25 });
  return (
    <ProductPage>
      <Panel title="Proofs">
        {proofs === undefined ? <Status>Loading private proofs…</Status> : null}
        {proofs?.length === 0 ? <p>No proof yet. One completed quest is enough.</p> : null}
        <div className={ui.list}>
          {proofs?.map((proof) => (
            <a href={`/proofs/${proof._id}`} key={proof._id}>
              <strong>{proof.family}</strong>
              <span>{new Date(proof.createdAt).toLocaleString()}</span>
            </a>
          ))}
        </div>
      </Panel>
    </ProductPage>
  );
}

export function ProofDetailPage() {
  const params = useParams({ from: "/proofs/$proofId" });
  // SAFETY: The route value remains untrusted; every generated Convex function validates the
  // evidence ID and owner before reading or deleting the document.
  const proofId = params.proofId as Id<"evidence">;
  const profile = useQuery(api.profile.get, {});
  const [deletedReceipt, setDeletedReceipt] = useState<{
    counts: { files: number; rows: number };
    operationId: string;
    state: string;
  } | null>(null);
  const proof = useQuery(api.evidence.getMine, deletedReceipt === null ? { proofId } : "skip");
  const preview = useQuery(
    api.privacy.preview,
    deletedReceipt === null ? { kind: "delete_proof", proofId } : "skip",
  );
  const confirmDelete = useAction(api.privacy.confirmDelete);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deleteIdempotencyKey] = useState(() => operationId("delete-proof"));
  const [deleteOperationId] = useState(() => operationId("privacy-delete-proof"));
  if (deletedReceipt !== null) {
    return (
      <ProductPage>
        <Panel title="Deletion receipt">
          <p>State · {deletedReceipt.state}</p>
          <p>Operation · {deletedReceipt.operationId}</p>
          <p>
            Deleted · {deletedReceipt.counts.rows} row, {deletedReceipt.counts.files} file
          </p>
          <a href="/proofs">Back to Proofs</a>
        </Panel>
      </ProductPage>
    );
  }
  if (proof === undefined) return <Status>Loading proof…</Status>;
  return (
    <ProductPage>
      <Panel title={`${proof.family} proof`}>
        <p>
          <strong>{proof.quest.title}</strong> · {proof.quest.mode}
        </p>
        <p>{proof.quest.objective}</p>
        <p className={ui.muted}>Done condition: {proof.quest.doneCondition}</p>
        <p>{proof.note}</p>
        {proof.referenceUrl === undefined ? null : <a href={proof.referenceUrl}>Open reference</a>}
        {proof.signedStorageUrl === null ? null : (
          <a href={proof.signedStorageUrl}>Open private file</a>
        )}
        <dl className={ui.capsule}>
          {Object.entries(proof.capsule).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {profile?.rewardPreferences?.showXp === false ? null : (
          <p>{proof.reward.reduce((total, row) => total + row.amount, 0)} XP awarded</p>
        )}
        <div className={ui.stack}>
          <p className={ui.muted}>
            Delete this proof only: {preview?.counts.rows ?? 1} row and {preview?.counts.files ?? 0}{" "}
            file.
          </p>
          <Field label={`Type ${preview?.confirmation ?? "DELETE PROOF"}`}>
            <input onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
          </Field>
          <Button
            disabled={deleting || preview === undefined}
            onClick={() =>
              fire(async () => {
                if (preview === undefined) return;
                setDeleting(true);
                setDeleteError(false);
                try {
                  const receipt = await confirmDelete({
                    confirmation,
                    consequenceHash: preview.consequenceHash,
                    idempotencyKey: deleteIdempotencyKey,
                    kind: "delete_proof",
                    operationId: deleteOperationId,
                    proofId,
                  });
                  if (receipt.state !== "completed") {
                    throw new Error(receipt.failureClass ?? "DELETION_INCOMPLETE");
                  }
                  setDeletedReceipt(receipt);
                  setDeleting(false);
                } catch {
                  setDeleteError(true);
                  setDeleting(false);
                }
              })
            }
            tone="danger"
          >
            Delete this proof
          </Button>
          {deleteError ? (
            <p className={ui.error}>
              Deletion did not complete. Sign in again and review the preview.
            </p>
          ) : null}
        </div>
      </Panel>
    </ProductPage>
  );
}
