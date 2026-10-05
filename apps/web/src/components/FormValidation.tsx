import type { FormEvent, ReactNode } from "react";

export type FieldErrors = Record<string, string>;
type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function fieldLabel(control: FormControl) {
  return control.dataset.label || control.closest("label")?.querySelector("span")?.textContent?.trim() || control.name || "This field";
}

function nativeMessage(control: FormControl) {
  const label = fieldLabel(control);
  if (control.validity.valueMissing) return `${label} is required.`;
  if (control.validity.typeMismatch) return `Enter a valid ${label.toLowerCase()}.`;
  if (control.validity.tooShort && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return `${label} must be at least ${control.minLength} characters.`;
  if (control.validity.tooLong && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return `${label} must be no more than ${control.maxLength} characters.`;
  if (control.validity.rangeUnderflow && control instanceof HTMLInputElement) return `${label} must be at least ${control.min}.`;
  if (control.validity.rangeOverflow && control instanceof HTMLInputElement) return `${label} must be no more than ${control.max}.`;
  if (control.validity.patternMismatch) return control.dataset.patternMessage || `${label} has an invalid format.`;
  return `${label} is invalid.`;
}

export function validateForm(form: HTMLFormElement, custom: Record<string, (value: string) => string | null> = {}) {
  const errors: FieldErrors = {};
  const controls = Array.from(form.elements).filter((element): element is FormControl =>
    element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
  );
  for (const control of controls) {
    if (!control.name || control.disabled) continue;
    if (!control.validity.valid) errors[control.name] = nativeMessage(control);
    else {
      const customMessage = custom[control.name]?.(control.value) ?? null;
      if (customMessage) errors[control.name] = customMessage;
    }
  }
  if (Object.keys(errors).length) controls.find((control) => errors[control.name])?.focus();
  return errors;
}

export function clearFieldError(event: FormEvent<HTMLFormElement>, setErrors: (updater: (current: FieldErrors) => FieldErrors) => void) {
  const control = event.target;
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.name) return;
  setErrors((current) => {
    if (!current[control.name]) return current;
    const next = { ...current };
    delete next[control.name];
    return next;
  });
}

export function fieldErrorProps(errors: FieldErrors, name: string) {
  return {
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  } as const;
}

export function FieldError({ errors, name }: { errors: FieldErrors; name: string }): ReactNode {
  return errors[name] ? <small className="field-error" id={`${name}-error`}>{errors[name]}</small> : null;
}
