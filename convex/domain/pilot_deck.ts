export const PILOT_DECK_VERSION = "pilot-1";

const families = [
  "anchor",
  "recall",
  "bridge",
  "teach",
  "revival",
  "north-star",
  "review",
] as const;
export type QuestFamily = (typeof families)[number];

export type PilotSeed = {
  allowedProofKinds: Array<"text" | "reference" | "file">;
  capacityVariants: { deep: string; rescue: string; standard: string };
  checkMethod: string;
  key: string;
  version: number;
  family: QuestFamily;
  domainKeys: string[];
  title: string;
  objective: string;
  doneCondition: string;
  whyNow: string;
  evidenceLabels: string[];
  possibleXpTags: Array<"proof" | "retrieval-check" | "bridge-or-contribution">;
  stepSpec: {
    retrieve: string;
    make: string;
    connect: string;
    feedback: string;
    proof: string;
  };
};

function reviewedSeed(
  input: Omit<
    PilotSeed,
    | "allowedProofKinds"
    | "capacityVariants"
    | "checkMethod"
    | "evidenceLabels"
    | "possibleXpTags"
    | "stepSpec"
    | "version"
  > & {
    retrieve: string;
    make: string;
    connect: string;
  },
): PilotSeed {
  return {
    ...input,
    allowedProofKinds: ["text", "reference", "file"],
    capacityVariants: {
      deep: `${input.doneCondition} Include one alternative or counterexample.`,
      rescue: "One small inspectable example and its boundary exist.",
      standard: input.doneCondition,
    },
    checkMethod: "Inspect the artifact against the done condition and name one boundary.",
    evidenceLabels: ["general-learning-evidence", "product-hypothesis"],
    possibleXpTags: ["proof", "retrieval-check", "bridge-or-contribution"],
    stepSpec: {
      retrieve: input.retrieve,
      make: input.make,
      connect: input.connect,
      feedback: "Inspect the result. Name one thing that works and one boundary or revision.",
      proof: "Save an inspectable result and a five-part memory capsule.",
    },
    version: 1,
  };
}

export const fallbackSeed = reviewedSeed({
  connect: "Connect the idea to a system you already know, then state where the analogy fails.",
  domainKeys: ["software-design"],
  doneCondition: "One bounded example and one explicit limitation exist.",
  family: "review",
  key: "bounded-cancellation-review",
  make: "Write or sketch the smallest cooperative-cancellation example you can inspect.",
  objective: "Recover one durable idea without opening a new curriculum.",
  retrieve: "Before notes, explain what makes cancellation cooperative.",
  title: "Cancellation is a protocol",
  whyNow: "It is small enough for Rescue and deep enough to expose a real boundary.",
});

export const pilotDeck: PilotSeed[] = [
  reviewedSeed({
    connect: "Compare the boundary to a hardware interrupt handler and name the mismatch.",
    domainKeys: ["backend", "robotics"],
    doneCondition: "A cancellation point and its cleanup rule are visible.",
    family: "anchor",
    key: "cooperative-cancellation",
    make: "Implement or diagram one retry-safe cancellation path.",
    objective: "Make cancellation behavior explicit at one async boundary.",
    retrieve: "Explain cooperative cancellation without opening references.",
    title: "Make cancellation observable",
    whyNow: "Backend reliability improves when stop behavior is a protocol rather than a hope.",
  }),
  reviewedSeed({
    connect: "Compare idempotency to debouncing and identify why they are not equivalent.",
    domainKeys: ["backend", "distributed-systems"],
    doneCondition: "A repeated request returns the original durable receipt.",
    family: "anchor",
    key: "idempotent-receipt",
    make: "Add or sketch a receipt-keyed write with a duplicate request path.",
    objective: "Turn one retryable command into a replay-safe operation.",
    retrieve: "State the failure that an idempotency key prevents.",
    title: "Retry without doing it twice",
    whyNow: "Ambiguous network responses are ordinary, not exceptional.",
  }),
  reviewedSeed({
    connect:
      "Relate the module boundary to a physical control interface and name the hidden state.",
    domainKeys: ["software-design", "robotics"],
    doneCondition: "The public interface is smaller and one complexity is hidden behind it.",
    family: "anchor",
    key: "deepen-one-module",
    make: "Rewrite one interface on paper or in code so callers need less context.",
    objective: "Deepen one module instead of adding another abstraction.",
    retrieve: "Describe what makes a module deep in your own words.",
    title: "Hide one real complexity",
    whyNow: "Deep modules make both humans and agents more reliable collaborators.",
  }),
  reviewedSeed({
    connect:
      "Connect the recalled rule to an incident or bug and state where memory was incomplete.",
    domainKeys: ["retrieval", "engineering"],
    doneCondition: "The rule is recalled before reveal and corrected afterward.",
    family: "recall",
    key: "recall-retry-boundary",
    make: "Write a tiny counterexample that violates the recalled rule.",
    objective: "Retrieve one reliability rule before seeing the cue.",
    retrieve: "What must remain stable across an ambiguous retry?",
    title: "Retrieve before reveal",
    whyNow: "Fast recognition is not the same as durable recall.",
  }),
  reviewedSeed({
    connect: "Relate the idea to state-machine design and identify one case that does not fit.",
    domainKeys: ["retrieval", "frontend"],
    doneCondition: "A remembered rule and a corrected example are both saved.",
    family: "recall",
    key: "recall-interruptible-ui",
    make: "Sketch one UI transition that can be interrupted safely.",
    objective: "Recall how interruptibility changes interface behavior.",
    retrieve: "What should happen when an animation or async action is interrupted?",
    title: "Recall the interruption contract",
    whyNow: "A resume-safe product needs the same honesty in its interface motion.",
  }),
  reviewedSeed({
    connect:
      "Connect the constraint to a recent architecture choice and state what remains unknown.",
    domainKeys: ["retrieval", "infrastructure"],
    doneCondition: "One constraint is recalled, tested, and corrected.",
    family: "recall",
    key: "recall-free-boundary",
    make: "Write one failure response that preserves committed truth at a hard cap.",
    objective: "Retrieve the Free-plan failure boundary without browsing.",
    retrieve: "What can the product promise after the shell has loaded but the backend is capped?",
    title: "Remember the honest failure",
    whyNow: "A product floor is real only when its failure behavior is explicit.",
  }),
  reviewedSeed({
    connect: "Map the analogy in both directions and list one misleading correspondence.",
    domainKeys: ["physics", "software-design"],
    doneCondition: "The transfer value and the analogy limit are both explicit.",
    family: "bridge",
    key: "feedback-control-boundary",
    make: "Draw a feedback loop for one software operation and label the observation delay.",
    objective: "Use feedback-control vocabulary to inspect a software loop.",
    retrieve: "What are the signal, observation, and correction in a feedback loop?",
    title: "Bridge feedback loops",
    whyNow: "Cross-domain transfer is useful only when the mismatch stays visible.",
  }),
  reviewedSeed({
    connect:
      "Compare visual negative space to API surface area and state where the metaphor fails.",
    domainKeys: ["art", "developer-experience"],
    doneCondition: "One interface edit is justified by both the transfer and its limit.",
    family: "bridge",
    key: "negative-space-api",
    make: "Remove or group one interface element so the next action has more room.",
    objective: "Transfer a composition principle into developer experience.",
    retrieve: "What does negative space do besides make a layout look empty?",
    title: "Use negative space in an API",
    whyNow: "Restraint can reduce negotiation in both visual and technical interfaces.",
  }),
  reviewedSeed({
    connect: "Connect the explanation to a mistake a capable engineer could still make.",
    domainKeys: ["teaching", "backend"],
    doneCondition: "A concise explanation includes one concrete failure mode.",
    family: "teach",
    key: "teach-ownership-check",
    make: "Write a short private explanation or review comment about document ownership.",
    objective: "Teach why authentication alone does not authorize an object.",
    retrieve: "Explain the difference between who is calling and what they may touch.",
    title: "Teach the ownership boundary",
    whyNow: "Explaining a boundary exposes gaps that recognition hides.",
  }),
  reviewedSeed({
    connect:
      "Relate the contribution to future-you as a user and name what should not be automated.",
    domainKeys: ["developer-experience", "open-source"],
    doneCondition: "One reusable note, test, or tiny contribution is inspectable.",
    family: "teach",
    key: "contribute-one-recovery-note",
    make: "Improve one recovery instruction, test name, or contributor note.",
    objective: "Turn one learned boundary into a useful contribution.",
    retrieve: "What did you have to reconstruct the last time this failed?",
    title: "Leave a recovery breadcrumb",
    whyNow: "A small contribution converts private understanding into durable leverage.",
  }),
  reviewedSeed({
    connect:
      "Relate the gesture to a UI motion principle and identify what physical feedback is missing.",
    domainKeys: ["drawing", "interface-motion"],
    doneCondition: "One tiny study exists without requiring a polished piece.",
    family: "revival",
    key: "revive-line-weight",
    make: "Draw eight lines that vary pressure or weight, on paper or digitally.",
    objective: "Re-enter drawing through one tactile constraint.",
    retrieve: "Describe how line weight can imply depth or emphasis.",
    title: "Revive one line",
    whyNow: "Revival should feel like re-entry, not a second curriculum.",
  }),
  reviewedSeed({
    connect:
      "Compare the rhythm to a loading sequence and name where musical timing stops mapping.",
    domainKeys: ["music", "interaction-design"],
    doneCondition: "A four-beat pattern is recorded or notated once.",
    family: "revival",
    key: "revive-four-beats",
    make: "Tap, record, or notate one four-beat variation.",
    objective: "Re-enter music through a bounded rhythmic act.",
    retrieve: "Recall one rhythm you can reproduce without playback.",
    title: "Return for four beats",
    whyNow: "A tiny finished pattern is enough to reopen a dormant practice.",
  }),
  reviewedSeed({
    connect:
      "Connect the diagram to a software state transition and state why the physics is stricter.",
    domainKeys: ["physics", "systems"],
    doneCondition:
      "One force diagram includes direction, reference object, and a checked boundary.",
    family: "north-star",
    key: "north-star-force-diagram",
    make: "Draw a force diagram for one ordinary object and inspect each arrow.",
    objective: "Build a physics foundation through an observable representation.",
    retrieve: "What must be named before drawing a force vector?",
    title: "Name the forces",
    whyNow: "The North Star starts with a small accurate representation, not a course backlog.",
  }),
  fallbackSeed,
];

type JsonRecord = { readonly [key: string]: JSONValue };

const proofKinds = ["text", "reference", "file"] as const;
const xpTags = ["proof", "retrieval-check", "bridge-or-contribution"] as const;

function jsonTag(value: JSONValue | undefined) {
  return Object.prototype.toString.call(value);
}

function isJsonRecord(value: JSONValue | undefined): value is JsonRecord {
  return jsonTag(value) === "[object Object]";
}

function isNonemptyString(value: JSONValue | undefined): value is string {
  return (
    jsonTag(value) === "[object String]" &&
    Object(value) !== value &&
    String.prototype.trim.call(value).length > 0
  );
}

function isInteger(value: JSONValue | undefined): value is number {
  return jsonTag(value) === "[object Number]" && Object(value) !== value && Number.isInteger(value);
}

function parseStringArray(value: JSONValue | undefined): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parsed: string[] = [];
  for (const entry of value) {
    if (!isNonemptyString(entry)) return null;
    parsed.push(entry);
  }
  return parsed;
}

function parseEnumArray<const Allowed extends ReadonlyArray<string>>(
  value: JSONValue | undefined,
  allowed: Allowed,
): Array<Allowed[number]> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parsed: Array<Allowed[number]> = [];
  for (const entry of value) {
    if (!isNonemptyString(entry)) return null;
    const member = allowed.find((candidate) => candidate === entry);
    if (member === undefined) return null;
    parsed.push(member);
  }
  return parsed;
}

function parsePilotSeed(value: JSONValue): PilotSeed | null {
  if (!isJsonRecord(value)) return null;
  const capacity = value.capacityVariants;
  const steps = value.stepSpec;
  if (!isJsonRecord(capacity) || !isJsonRecord(steps)) return null;
  const key = value.key;
  const version = value.version;
  const family = families.find((candidate) => candidate === value.family);
  const title = value.title;
  const objective = value.objective;
  const doneCondition = value.doneCondition;
  const whyNow = value.whyNow;
  const checkMethod = value.checkMethod;
  const rescue = capacity.rescue;
  const standard = capacity.standard;
  const deep = capacity.deep;
  const retrieve = steps.retrieve;
  const make = steps.make;
  const connect = steps.connect;
  const feedback = steps.feedback;
  const proof = steps.proof;
  const domainKeys = parseStringArray(value.domainKeys);
  const evidenceLabels = parseStringArray(value.evidenceLabels);
  const allowedProofKinds = parseEnumArray(value.allowedProofKinds, proofKinds);
  const possibleXpTags = parseEnumArray(value.possibleXpTags, xpTags);
  if (
    !isNonemptyString(key) ||
    !isInteger(version) ||
    family === undefined ||
    !isNonemptyString(title) ||
    !isNonemptyString(objective) ||
    !isNonemptyString(doneCondition) ||
    !isNonemptyString(whyNow) ||
    !isNonemptyString(checkMethod) ||
    !isNonemptyString(rescue) ||
    !isNonemptyString(standard) ||
    !isNonemptyString(deep) ||
    !isNonemptyString(retrieve) ||
    !isNonemptyString(make) ||
    !isNonemptyString(connect) ||
    !isNonemptyString(feedback) ||
    !isNonemptyString(proof) ||
    domainKeys === null ||
    evidenceLabels === null ||
    allowedProofKinds === null ||
    possibleXpTags === null
  ) {
    return null;
  }
  return {
    allowedProofKinds,
    capacityVariants: { deep, rescue, standard },
    checkMethod,
    domainKeys,
    doneCondition,
    evidenceLabels,
    family,
    key,
    objective,
    possibleXpTags,
    stepSpec: { connect, feedback, make, proof, retrieve },
    title,
    version,
    whyNow,
  };
}

export function decodePilotDeck(value: JSONValue): PilotSeed[] {
  if (!Array.isArray(value) || value.length !== 14) return [fallbackSeed];
  const keys = new Set<string>();
  const decoded: PilotSeed[] = [];
  for (const seed of value) {
    const parsed = parsePilotSeed(seed);
    if (parsed === null || keys.has(parsed.key)) {
      return [fallbackSeed];
    }
    keys.add(parsed.key);
    decoded.push(parsed);
  }
  return decoded;
}

export function selectPilotSeed(dayKey: string, eligibleFamilies?: ReadonlySet<string>) {
  const fullDeck = decodePilotDeck(pilotDeck);
  const deck =
    eligibleFamilies === undefined
      ? fullDeck
      : fullDeck.filter(({ family }) => eligibleFamilies.has(family));
  const numericDay = Number(dayKey.replaceAll("-", ""));
  return deck[Number.isSafeInteger(numericDay) ? numericDay % deck.length : 0] ?? fallbackSeed;
}
import type { JSONValue } from "convex/values";
