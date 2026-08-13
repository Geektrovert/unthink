import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & {
  tone?: "primary" | "quiet" | "danger";
};

export function Button({ tone = "primary", ...props }: ButtonProps) {
  const tones = {
    danger: "border-0 bg-[oklch(0.48_0.18_25)] text-on-action hover:bg-[oklch(0.42_0.18_25)]",
    primary: "border-0 bg-action text-on-action hover:bg-action-hover",
    quiet:
      "border border-line bg-surface text-ink hover:bg-[color-mix(in_oklch,var(--ds-action)_8%,var(--ds-surface))]",
  } as const;
  return (
    <BaseButton
      className={`ds-button min-h-11 cursor-pointer rounded-control px-4 font-semibold transition duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-action-disabled ${tones[tone]}`}
      {...props}
    />
  );
}
