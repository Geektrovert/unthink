const unexpectedConsole =
  (level: "error" | "warn") =>
  (..._values: ReadonlyArray<unknown>): never => {
    throw new Error(`Unexpected console.${level} event`);
  };

console.error = unexpectedConsole("error");
console.warn = unexpectedConsole("warn");
