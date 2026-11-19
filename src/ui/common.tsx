import { useId, type ReactNode } from "react";
import type { AppData } from "../model";
import type { DataStore } from "../data/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface PageProps {
  data: AppData;
  store: DataStore;
  refresh: () => Promise<void>;
  notify: (msg: string, error?: boolean) => void;
}

const NONE = "__none__";

/** Label above a control, with an optional hint and error line below. */
export function Field(props: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", props.className)}>
      <Label htmlFor={props.htmlFor} className="text-[13px] font-medium text-muted-foreground">
        {props.label}
        {props.required && <span className="text-foreground"> (required)</span>}
      </Label>
      {props.children}
      {props.hint && !props.error && <p className="text-[13px] text-muted-foreground">{props.hint}</p>}
      {props.error && <p className="text-[13px] font-medium text-destructive">{props.error}</p>}
    </div>
  );
}

export function Select(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const id = useId();
  const opts = props.value && !props.options.includes(props.value) ? [...props.options, props.value] : props.options;
  return (
    <Field label={props.label} htmlFor={id} required={props.required} error={props.error} className={props.className}>
      <UiSelect
        value={props.value || NONE}
        disabled={props.disabled}
        onValueChange={(v) => props.onChange(v === NONE ? "" : v)}
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={!!props.error}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="text-muted-foreground">
            {props.placeholder ?? "Not set"}
          </SelectItem>
          {opts.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </UiSelect>
    </Field>
  );
}

export function Text(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  list?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <Field label={props.label} htmlFor={id} required={props.required} error={props.error} className={props.className}>
      <Input
        id={id}
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        list={props.list}
        disabled={props.disabled}
        aria-invalid={!!props.error}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </Field>
  );
}

export function NumberField(props: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  error?: string;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <Field label={props.label} htmlFor={id} error={props.error} hint={props.hint} className={props.className}>
      <Input
        id={id}
        type="number"
        min={0}
        inputMode="numeric"
        value={props.value ?? ""}
        disabled={props.disabled}
        aria-invalid={!!props.error}
        onChange={(e) => props.onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </Field>
  );
}

export function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** "Tue" / "Sep 1" pieces for the date column of a list row. */
export function dateParts(iso: string): { weekday: string; day: string; year: string } | null {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return null;
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    year: String(d.getFullYear()),
  };
}

/** Page title row: large title, a line of help, and the page's actions on the right. */
export function PageHeader(props: { title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-semibold">{props.title}</h1>
        {props.description && <p className="mt-1 max-w-[62ch] text-muted-foreground">{props.description}</p>}
      </div>
      {props.children && <div className="flex flex-wrap items-center gap-2">{props.children}</div>}
    </header>
  );
}
