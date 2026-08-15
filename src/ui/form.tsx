import { Checkbox } from "@base-ui/react/checkbox";
import { CheckboxGroup } from "@base-ui/react/checkbox-group";
import { Field } from "@base-ui/react/field";
import { Fieldset } from "@base-ui/react/fieldset";
import { Form } from "@base-ui/react/form";
import { Input, type InputProps } from "@base-ui/react/input";
import { Select } from "@base-ui/react/select";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { z } from "zod";

import { Button } from "./button";
import { ui } from "./classes";
import { PasswordInput } from "./password-input";

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();
const formValidationErrorsSchema = z.array(
  z.union([z.string(), z.object({ message: z.string() }).transform(({ message }) => message)]),
);

type TextFieldProps = Omit<InputProps, "onBlur" | "onValueChange" | "value"> & {
  label: string;
};

function TextField({ label, ...inputProps }: TextFieldProps) {
  const field = useFieldContext<string>();
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <Field.Root
      className={ui.field}
      dirty={field.state.meta.isDirty}
      invalid={invalid}
      name={field.name}
      touched={field.state.meta.isTouched}
    >
      <Field.Label>{label}</Field.Label>
      <Input
        {...inputProps}
        onBlur={field.handleBlur}
        onValueChange={field.handleChange}
        value={field.state.value}
      />
      <FieldValidationError errors={field.state.meta.errors} invalid={invalid} />
    </Field.Root>
  );
}

function PasswordField({ label, ...inputProps }: TextFieldProps) {
  const field = useFieldContext<string>();
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <Field.Root
      className={ui.field}
      dirty={field.state.meta.isDirty}
      invalid={invalid}
      name={field.name}
      touched={field.state.meta.isTouched}
    >
      <Field.Label>{label}</Field.Label>
      <PasswordInput
        {...inputProps}
        onBlur={field.handleBlur}
        onValueChange={field.handleChange}
        value={field.state.value}
      />
      <FieldValidationError errors={field.state.meta.errors} invalid={invalid} />
    </Field.Root>
  );
}

function TextAreaField({ label, rows }: { label: string; rows?: number }) {
  const field = useFieldContext<string>();
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <Field.Root
      className={ui.field}
      dirty={field.state.meta.isDirty}
      invalid={invalid}
      name={field.name}
      touched={field.state.meta.isTouched}
    >
      <Field.Label>{label}</Field.Label>
      <Field.Control
        onBlur={field.handleBlur}
        onValueChange={field.handleChange}
        render={<textarea rows={rows ?? 2} />}
        value={field.state.value}
      />
      <FieldValidationError errors={field.state.meta.errors} invalid={invalid} />
    </Field.Root>
  );
}

export type SelectOption = { label: string; value: string };

function SelectField({ items, label }: { items: readonly SelectOption[]; label: string }) {
  const field = useFieldContext<string>();

  return (
    <Field.Root
      className={ui.field}
      dirty={field.state.meta.isDirty}
      invalid={field.state.meta.isTouched && !field.state.meta.isValid}
      name={field.name}
      touched={field.state.meta.isTouched}
    >
      <Select.Root
        items={[...items]}
        onValueChange={(value) => value !== null && field.handleChange(value)}
        value={field.state.value}
      >
        <Select.Label>{label}</Select.Label>
        <Select.Trigger className={ui.selectTrigger} onBlur={field.handleBlur}>
          <Select.Value />
          <Select.Icon className={ui.selectIcon}>↕</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className={ui.selectPositioner} sideOffset={4}>
            <Select.Popup className={ui.selectPopup}>
              <Select.List>
                {items.map((item) => (
                  <Select.Item className={ui.selectItem} key={item.value} value={item.value}>
                    <Select.ItemIndicator>✓</Select.ItemIndicator>
                    <Select.ItemText>{item.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </Field.Root>
  );
}

function CheckboxField({ label }: { label: string }) {
  const field = useFieldContext<boolean>();

  return (
    <Field.Root
      dirty={field.state.meta.isDirty}
      name={field.name}
      touched={field.state.meta.isTouched}
    >
      <Field.Label className={ui.check}>
        <Checkbox.Root
          checked={field.state.value}
          className={ui.checkbox}
          onBlur={field.handleBlur}
          onCheckedChange={field.handleChange}
        >
          <Checkbox.Indicator className={ui.checkboxIndicator}>✓</Checkbox.Indicator>
        </Checkbox.Root>
        {label}
      </Field.Label>
    </Field.Root>
  );
}

function CheckboxGroupField({ items, legend }: { items: readonly SelectOption[]; legend: string }) {
  const field = useFieldContext<string[]>();
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <Field.Root
      dirty={field.state.meta.isDirty}
      invalid={invalid}
      name={field.name}
      touched={field.state.meta.isTouched}
    >
      <Fieldset.Root
        className={ui.stack}
        render={
          <CheckboxGroup
            onBlur={field.handleBlur}
            onValueChange={field.handleChange}
            value={field.state.value}
          />
        }
      >
        <Fieldset.Legend>{legend}</Fieldset.Legend>
        {items.map((item) => (
          <Field.Item key={item.value}>
            <Field.Label className={ui.check}>
              <Checkbox.Root className={ui.checkbox} value={item.value}>
                <Checkbox.Indicator className={ui.checkboxIndicator}>✓</Checkbox.Indicator>
              </Checkbox.Root>
              {item.label}
            </Field.Label>
          </Field.Item>
        ))}
      </Fieldset.Root>
      <FieldValidationError errors={field.state.meta.errors} invalid={invalid} />
    </Field.Root>
  );
}

function FileField({
  accept,
  label,
  onFileChange,
}: {
  accept: string;
  label: string;
  onFileChange?: (file: File | null) => void;
}) {
  const field = useFieldContext<File | null>();
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <Field.Root
      className={ui.field}
      dirty={field.state.meta.isDirty}
      invalid={invalid}
      name={field.name}
      touched={field.state.meta.isTouched}
    >
      <Field.Label>{label}</Field.Label>
      <Input
        accept={accept}
        onBlur={field.handleBlur}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          field.handleChange(file);
          onFileChange?.(file);
        }}
        type="file"
      />
      <FieldValidationError errors={field.state.meta.errors} invalid={invalid} />
    </Field.Root>
  );
}

function FormRoot({ children }: { children: ReactNode }) {
  const form = useFormContext();

  return (
    <Form className={ui.stack} onFormSubmit={() => void form.handleSubmit()}>
      {children}
    </Form>
  );
}

function SubmitButton({
  disabled,
  idleLabel,
  pending,
  pendingLabel,
  tone,
}: {
  disabled?: boolean;
  idleLabel: string;
  pending?: boolean;
  pendingLabel: string;
  tone?: "danger" | "quiet";
}) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
      {([canSubmit, isSubmitting]) => (
        <Button
          disabled={disabled === true || pending === true || !canSubmit || isSubmitting}
          tone={tone}
          type="submit"
        >
          {isSubmitting || pending === true ? pendingLabel : idleLabel}
        </Button>
      )}
    </form.Subscribe>
  );
}

function validationErrorText(errors: readonly unknown[]) {
  const parsed = formValidationErrorsSchema.safeParse(errors);
  return parsed.success ? parsed.data.join(" ") : "";
}

function FieldValidationError({
  errors,
  invalid,
}: {
  errors: readonly unknown[];
  invalid: boolean;
}) {
  if (!invalid) return <Field.Error />;
  return <Field.Error match>{validationErrorText(errors)}</Field.Error>;
}

export const { useAppForm } = createFormHook({
  fieldComponents: {
    CheckboxField,
    CheckboxGroupField,
    FileField,
    PasswordField,
    SelectField,
    TextAreaField,
    TextField,
  },
  fieldContext,
  formComponents: { FormRoot, SubmitButton },
  formContext,
});
