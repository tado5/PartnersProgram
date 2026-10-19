"use client";

import { useId, useRef, useState, type ComponentPropsWithoutRef, type SubmitEvent } from "react";
import { collectFormProblems, focusProblem, isFormControl, type FormProblem } from "@/lib/form-validation";

type Props = ComponentPropsWithoutRef<"form"> & { maxRangeDays?: number };

export function ValidatedForm({
  children, onSubmit, onBlurCapture, onChangeCapture, onReset, maxRangeDays, ...props
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [problems, setProblems] = useState<FormProblem[]>([]);
  const submitted = useRef(false);
  const touched = useRef(new Set<Element>());
  const id = useId();

  function updateFeedback(all = false) {
    const form = formRef.current;
    if (!form) return [];
    const next = collectFormProblems(form, maxRangeDays).filter((problem) => all || touched.current.has(problem.control));
    for (const control of Array.from(form.elements)) {
      if (!isFormControl(control)) continue;
      const index = next.findIndex((problem) => problem.control === control ||
        (control instanceof HTMLInputElement && control.type === "radio" && control.name &&
          problem.control instanceof HTMLInputElement && problem.control.type === "radio" && problem.control.name === control.name));
      const descriptions = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((item) => item && !item.startsWith(`${id}-error-`));
      if (index >= 0) {
        control.setAttribute("aria-invalid", "true");
        descriptions.push(`${id}-error-${index}`);
      } else {
        control.removeAttribute("aria-invalid");
      }
      if (descriptions.length) control.setAttribute("aria-describedby", descriptions.join(" "));
      else control.removeAttribute("aria-describedby");
    }
    setProblems(next);
    return next;
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    const submitter = event.submitter;
    if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
      if (submitter.formNoValidate) {
        onSubmit?.(event);
        return;
      }
    }
    submitted.current = true;
    const next = updateFeedback(true);
    if (next.length) {
      event.preventDefault();
      focusProblem(next[0].control);
      return;
    }
    onSubmit?.(event);
  }

  return (
    <form {...props} ref={formRef} noValidate onSubmit={submit}
      onBlurCapture={(event) => {
        onBlurCapture?.(event);
        if (isFormControl(event.target)) {
          touched.current.add(event.target);
          updateFeedback(submitted.current);
        }
      }}
      onChangeCapture={(event) => {
        onChangeCapture?.(event);
        if (submitted.current || touched.current.has(event.target)) updateFeedback(submitted.current);
      }}
      onReset={(event) => {
        onReset?.(event);
        submitted.current = false;
        touched.current.clear();
        setProblems([]);
        for (const control of Array.from(event.currentTarget.elements)) {
          if (!isFormControl(control)) continue;
          control.removeAttribute("aria-invalid");
          const descriptions = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((item) => item && !item.startsWith(`${id}-error-`));
          if (descriptions.length) control.setAttribute("aria-describedby", descriptions.join(" "));
          else control.removeAttribute("aria-describedby");
        }
      }}>
      {problems.length ? (
        <div role="alert" data-validation-summary className="validation-summary w-full min-w-0 rounded-lg border p-4 text-sm">
          <p className="font-semibold">Skontrolujte označené polia:</p>
          <ul className="mt-2 space-y-2">
            {problems.map((problem, index) => (
              <li key={`${problem.control.name}-${index}`} id={`${id}-error-${index}`}>
                <button className="text-left underline underline-offset-2" type="button"
                  onClick={() => focusProblem(problem.control)}>
                  <strong>{problem.label}:</strong> {problem.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {children}
    </form>
  );
}
