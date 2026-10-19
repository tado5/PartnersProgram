import { characterCount, fieldFormatHint, fieldLabel } from "./validation-errors";

export type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export type FormProblem = { control: FormControl; label: string; message: string };

export function isFormControl(element: unknown): element is FormControl {
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement;
}

export function controlLabel(control: FormControl) {
  const explicit = control.getAttribute("aria-label");
  if (explicit) return explicit;
  const labelledBy = control.getAttribute("aria-labelledby");
  if (labelledBy) {
    const label = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    if (label) return label;
  }
  if (control instanceof HTMLInputElement && control.type === "radio") {
    const legend = control.closest("fieldset")?.querySelector("legend");
    if (legend?.textContent) return legend.textContent.trim();
  }
  const label = control.labels?.[0]?.cloneNode(true);
  if (label instanceof HTMLElement) {
    label.querySelectorAll("input, select, textarea, span, small, p, [data-validation-summary]").forEach((element) => element.remove());
    const text = label.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text.replace(/\s*\*$/, "");
  }
  return fieldLabel(control.name || control.id);
}

export function controlError(control: FormControl): string | null {
  if (!control.willValidate) return null;
  const validity = control.validity;
  const isChoice = control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type);
  const isFile = control instanceof HTMLInputElement && control.type === "file";
  const isPassword = control instanceof HTMLInputElement && control.type === "password";
  const value = isPassword ? control.value : control.value.trim();
  if (validity.valueMissing || (control.required && !isChoice && !isFile && !value)) {
    if (control instanceof HTMLSelectElement || (control instanceof HTMLInputElement && control.type === "radio")) return "Vyberte jednu z možností.";
    if (control instanceof HTMLInputElement && control.type === "checkbox") return "Zaškrtnite toto potvrdenie.";
    if (isFile) return "Vyberte súbor.";
    return "Vyplňte toto pole.";
  }
  if (validity.badInput) return "Zadajte platné číslo alebo dátum.";
  if (validity.typeMismatch) return control instanceof HTMLInputElement && control.type === "email"
    ? "Zadajte platnú e-mailovú adresu." : "Zadajte platnú adresu.";
  if (validity.patternMismatch) return control.title || fieldFormatHint(control.name);
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    if (value && control.minLength > 0 && value.length < control.minLength) return `Zadajte aspoň ${characterCount(control.minLength)}.`;
    if (control.maxLength >= 0 && value.length > control.maxLength) return `Zadajte najviac ${characterCount(control.maxLength)}.`;
  }
  if (control instanceof HTMLInputElement) {
    if (validity.rangeUnderflow) return `Hodnota musí byť aspoň ${control.min}.`;
    if (validity.rangeOverflow) return `Hodnota môže byť najviac ${control.max}.`;
    if (validity.stepMismatch) return `Zadajte hodnotu v krokoch ${control.step || "1"}.`;
    if (["entityId", "partnerId", "userId"].includes(control.name) && value &&
        (!/^\d{1,20}$/.test(value) || BigInt(value) === BigInt(0) || BigInt(value) > BigInt("18446744073709551615"))) {
      return "Zadajte platné kladné číselné ID.";
    }
  }
  return validity.valid ? null : "Skontrolujte zadanú hodnotu.";
}

export function collectFormProblems(form: HTMLFormElement, maxRangeDays?: number): FormProblem[] {
  const problems: FormProblem[] = [];
  const radioGroups = new Set<string>();
  const controls = Array.from(form.elements);
  for (const control of controls) {
    if (!isFormControl(control)) continue;
    const message = controlError(control);
    if (!message) continue;
    if (control instanceof HTMLInputElement && control.type === "radio" && control.name) {
      if (radioGroups.has(control.name)) continue;
      radioGroups.add(control.name);
    }
    problems.push({ control, label: controlLabel(control), message });
  }
  const from = form.elements.namedItem("from");
  const to = form.elements.namedItem("to");
  if (from instanceof HTMLInputElement && to instanceof HTMLInputElement &&
      from.willValidate && to.willValidate && from.value && to.value && from.validity.valid && to.validity.valid) {
    const days = (Date.parse(`${to.value}T00:00:00Z`) - Date.parse(`${from.value}T00:00:00Z`)) / 86_400_000 + 1;
    const message = from.value > to.value
      ? "Koncový dátum nesmie byť pred počiatočným dátumom."
      : maxRangeDays !== undefined && days > maxRangeDays
        ? `Obdobie môže mať najviac ${maxRangeDays} dní.`
        : null;
    if (message) problems.push({ control: to, label: controlLabel(to), message });
  }
  return problems.sort((left, right) => controls.indexOf(left.control) - controls.indexOf(right.control));
}

export function focusProblem(control: FormControl) {
  let details = control.closest("details");
  while (details) {
    details.open = true;
    details = details.parentElement?.closest("details") ?? null;
  }
  control.focus({ preventScroll: true });
  control.scrollIntoView({ block: "center", behavior: "auto" });
}
