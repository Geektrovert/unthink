export function localDayKey(date = new Date(), timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function operationId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function fire(task: () => Promise<unknown>) {
  void task();
}

export function clearDeviceDrafts() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("unthink:")) localStorage.removeItem(key);
  }
}

export function playCompletionChime() {
  try {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 523.25;
    gain.gain.setValueAtTime(0.025, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.14);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.14);
    oscillator.addEventListener("ended", () => void audio.close(), { once: true });
  } catch {
    // Optional presentation cannot revise a committed completion.
  }
}
