import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function Field({ label, hint, error, htmlFor, children, className = "" }: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={["ui-field", className].filter(Boolean).join(" ")} htmlFor={htmlFor}>
      <span className="ui-field__label">{label}</span>
      {children}
      {error ? <span className="ui-field__error" id={`${htmlFor}-error`}>{error}</span> : hint ? <span className="ui-field__hint" id={`${htmlFor}-hint`}>{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={["ui-input", className].filter(Boolean).join(" ")} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = "", children, ...props }, ref) {
  return <select ref={ref} className={["ui-select", className].filter(Boolean).join(" ")} {...props}>{children}</select>;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={["ui-textarea", className].filter(Boolean).join(" ")} {...props} />;
});
