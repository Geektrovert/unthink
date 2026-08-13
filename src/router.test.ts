import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

import { ProductRouteError } from "./router";

test("route failures render redacted retry and recovery controls", () => {
  const markup = renderToStaticMarkup(
    createElement(ProductRouteError, {
      error: new Error("private proof text must not render"),
      info: { componentStack: "private component data" },
      reset: vi.fn(),
    }),
  );
  expect(markup).toContain("Try again");
  expect(markup).toContain("Sign in again");
  expect(markup).not.toContain("private proof text");
  expect(markup).not.toContain("private component data");
});
