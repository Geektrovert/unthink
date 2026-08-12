const unexpectedConsole =
  (level: "error" | "warn") =>
  (...values: ReadonlyArray<unknown>): never => {
    const firstValue = values.at(0);
    const eventCode =
      typeof firstValue === "object" && firstValue !== null && "code" in firstValue
        ? String(firstValue.code)
        : "unclassified";
    throw new Error(`Unexpected console.${level} event (${eventCode})`);
  };

console.error = unexpectedConsole("error");
console.warn = unexpectedConsole("warn");
