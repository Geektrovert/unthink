import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";

import { Today } from "./today";

const rootRoute = createRootRoute({ component: Outlet });
const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Today,
});

const routeTree = rootRoute.addChildren([todayRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
