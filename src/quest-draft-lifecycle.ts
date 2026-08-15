export type EditableQuestStep = "retrieve" | "make" | "connect" | "feedback";

export function createQuestDraftTracker(initialValue: string) {
  let currentValue = initialValue;

  return {
    observe(nextValue: string) {
      if (nextValue === currentValue) return null;
      currentValue = nextValue;
      return nextValue;
    },
    replace(nextValue: string) {
      currentValue = nextValue;
    },
  };
}

export function questProgressUpdate(step: EditableQuestStep, text: string) {
  return { step, text } as const;
}
