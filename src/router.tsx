import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

import { AuthPage, AuthRecoveryPage } from "./auth-page";
import {
  OnboardingPage,
  ProofDetailPage,
  ProofsPage,
  QuestPage,
  RewardsPage,
  SettingsPage,
  TodayPage,
} from "./pages";

const rootRoute = createRootRoute({ component: Outlet });

function LoadingPrivateSpace() {
  return (
    <main className="ds-page" aria-busy="true">
      <section className="ds-panel">Opening your private space…</section>
    </main>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <LoadingPrivateSpace />;
  if (!isAuthenticated) return <Navigate to="/auth/sign-in" replace />;
  return children;
}

function EntryRoute() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profile.get, isAuthenticated ? {} : "skip");
  if (isLoading) return <LoadingPrivateSpace />;
  if (!isAuthenticated) return <Navigate to="/auth/sign-in" replace />;
  if (profile === undefined) return <LoadingPrivateSpace />;
  if (profile?.onboardingComplete !== true) {
    const step =
      profile?.onboardingStep === "complete" ? "promise" : (profile?.onboardingStep ?? "promise");
    return <Navigate params={{ step }} to="/onboarding/$step" replace />;
  }
  return <Navigate to="/today" replace />;
}

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: EntryRoute,
});
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/sign-in",
  component: AuthPage,
});
const recoverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/recover",
  component: AuthRecoveryPage,
});
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding/$step",
  component: () => (
    <PrivateRoute>
      <OnboardingPage />
    </PrivateRoute>
  ),
});
const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/today",
  component: () => (
    <PrivateRoute>
      <TodayPage />
    </PrivateRoute>
  ),
});
const questRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/quest/$questId",
  component: () => (
    <PrivateRoute>
      <QuestPage />
    </PrivateRoute>
  ),
});
const proofsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proofs",
  component: () => (
    <PrivateRoute>
      <ProofsPage />
    </PrivateRoute>
  ),
});
const proofRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proofs/$proofId",
  component: () => (
    <PrivateRoute>
      <ProofDetailPage />
    </PrivateRoute>
  ),
});
const rewardsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rewards",
  component: () => (
    <PrivateRoute>
      <RewardsPage />
    </PrivateRoute>
  ),
});
const settingsRoutes = (["learning", "rewards", "security", "privacy"] as const).map((section) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/settings/${section}`,
    component: () => (
      <PrivateRoute>
        <SettingsPage section={section} />
      </PrivateRoute>
    ),
  }),
);

const routeTree = rootRoute.addChildren([
  entryRoute,
  signInRoute,
  recoverRoute,
  onboardingRoute,
  todayRoute,
  questRoute,
  proofsRoute,
  proofRoute,
  rewardsRoute,
  ...settingsRoutes,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
