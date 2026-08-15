import { Button as BaseButton } from "@base-ui/react/button";
import { Input, type InputProps } from "@base-ui/react/input";
import { useState } from "react";

import { ui } from "./classes";

type PasswordInputProps = Omit<InputProps, "type">;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={ui.passwordControl}>
      <BaseButton
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className={ui.passwordToggle}
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </BaseButton>
      <Input {...props} className={ui.passwordInput} type={visible ? "text" : "password"} />
    </div>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M2.75 12s3.4-5.25 9.25-5.25S21.25 12 21.25 12 17.85 17.25 12 17.25 2.75 12 2.75 12Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="m4 4 16 16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path
        d="M9.45 7.18A8.6 8.6 0 0 1 12 6.75C17.85 6.75 21.25 12 21.25 12a15.2 15.2 0 0 1-2.42 2.91M14.56 16.82a8.7 8.7 0 0 1-2.56.43C6.15 17.25 2.75 12 2.75 12a15.3 15.3 0 0 1 2.43-2.92"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}
