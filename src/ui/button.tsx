import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className">;

export function Button(props: ButtonProps) {
  return <BaseButton className="ds-button" {...props} />;
}
