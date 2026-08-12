import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";

import { components } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutesLazy(http, createAuth, {
  basePath: "/api/auth",
});
registerStaticRoutes(http, components.staticHosting);

export default http;
