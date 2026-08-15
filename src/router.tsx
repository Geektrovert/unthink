import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { PostHogProvider } from "posthog-js/react";
import { useConvexAuth } from "convex/react";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

import { authClient } from "./auth-client";
import { identifyTelemetryUser, posthog, resetTelemetryIdentity } from "./posthog";
import { Button } from "./ui/button";
import { ui } from "./ui/classes";

const AuthPage = lazy(async () => ({ default: (await import("./auth-page")).AuthPage }));
const AuthRecoveryPage = lazy(async () => ({
  default: (await import("./auth-page")).AuthRecoveryPage,
}));
const OnboardingPage = lazy(async () => ({
  default: (await import("./pages/onboarding-page")).OnboardingPage,
}));
const TodayPage = lazy(async () => ({
  default: (await import("./pages/today-page")).TodayPage,
}));
const QuestPage = lazy(async () => ({
  default: (await import("./pages/quest-page")).QuestPage,
}));
const ProofsPage = lazy(async () => ({
  default: (await import("./pages/proofs-page")).ProofsPage,
}));
const ProofDetailPage = lazy(async () => ({
  default: (await import("./pages/proofs-page")).ProofDetailPage,
}));
const RewardsPage = lazy(async () => ({
  default: (await import("./pages/rewards-page")).RewardsPage,
}));
const SettingsPage = lazy(async () => ({
  default: (await import("./pages/settings-page")).SettingsPage,
}));

export function ProductRouteError({ reset }: ErrorComponentProps) {
  return (
    <main className={ui.page}>
      <section className={ui.panel} role="alert">
        <p className={ui.eyebrow}>Unthink</p>
        <h1>This part did not load</h1>
        <p className={ui.muted}>
          Your saved work is still the source of truth. Retry the route, or sign in again if your
          session expired.
        </p>
        <div className={ui.actions}>
          <Button onClick={reset}>Try again</Button>
          <a className={ui.textButton} href="/auth/sign-in">
            Sign in again
          </a>
        </div>
      </section>
    </main>
  );
}

function AuthenticatedTelemetry() {
  const session = authClient.useSession();
  const userId = session.data?.user.id;

  useEffect(() => {
    if (session.isPending) return;
    if (userId === undefined) {
      resetTelemetryIdentity();
      return;
    }
    identifyTelemetryUser(userId);
  }, [session.isPending, userId]);

  return null;
}

function RootComponent() {
  return (
    <PostHogProvider client={posthog}>
      <AuthenticatedTelemetry />
      <Outlet />
    </PostHogProvider>
  );
}

const rootRoute = createRootRoute({ component: RootComponent, errorComponent: ProductRouteError });

function LoadingPrivateSpace() {
  return (
    <main className={ui.page} aria-busy="true">
      <section className={ui.panel}>Opening your private space…</section>
    </main>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingPrivateSpace />}>{children}</Suspense>;
}

function PrivateRoute({ children }: { children: ReactNode }) {
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
  component: () => (
    <LazyRoute>
      <AuthPage />
    </LazyRoute>
  ),
});
const recoverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/recover",
  component: () => (
    <LazyRoute>
      <AuthRecoveryPage />
    </LazyRoute>
  ),
});
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding/$step",
  component: () => (
    <PrivateRoute>
      <LazyRoute>
        <OnboardingPage />
      </LazyRoute>
    </PrivateRoute>
  ),
});
const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/today",
  component: () => (
    <PrivateRoute>
      <LazyRoute>
        <TodayPage />
      </LazyRoute>
    </PrivateRoute>
  ),
});
const questRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/quest/$questId",
  component: () => (
    <PrivateRoute>
      <LazyRoute>
        <QuestPage />
      </LazyRoute>
    </PrivateRoute>
  ),
});
const proofsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proofs",
  component: () => (
    <PrivateRoute>
      <LazyRoute>
        <ProofsPage />
      </LazyRoute>
    </PrivateRoute>
  ),
});
const proofRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proofs/$proofId",
  component: () => (
    <PrivateRoute>
      <LazyRoute>
        <ProofDetailPage />
      </LazyRoute>
    </PrivateRoute>
  ),
});
const rewardsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rewards",
  component: () => (
    <PrivateRoute>
      <LazyRoute>
        <RewardsPage />
      </LazyRoute>
    </PrivateRoute>
  ),
});
const settingsRoutes = (["learning", "rewards", "security", "privacy"] as const).map((section) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/settings/${section}`,
    component: () => (
      <PrivateRoute>
        <LazyRoute>
          <SettingsPage section={section} />
        </LazyRoute>
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

export const router = createRouter({ defaultErrorComponent: ProductRouteError, routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
