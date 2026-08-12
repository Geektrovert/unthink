import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & {
  tone?: "primary" | "quiet" | "danger";
};

export function Button({ tone = "primary", ...props }: ButtonProps) {
  return <BaseButton className={`ds-button ds-button--${tone}`} {...props} />;
}
