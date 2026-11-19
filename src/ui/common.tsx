import type { ReactNode } from "react";
import type { AppData } from "../model";
import type { DataStore } from "../data/store";

export interface PageProps {
  data: AppData;
  store: DataStore;
  refresh: () => Promise<void>;
  notify: (msg: string, error?: boolean) => void;
}

export const LIBRARIAN_COLORS = ["#2f65b5", "#c2611f", "#2e8b57", "#7b4fb3", "#b03a6f", "#0f7c8c"];
export const NOT_SET_COLOR = "#a19f97";

export function colorFor(librarian: string, librarians: string[]): string {
  if (!librarian) return NOT_SET_COLOR;
  const i = librarians.indexOf(librarian);
  return LIBRARIAN_COLORS[(i < 0 ? librarians.length : i) % LIBRARIAN_COLORS.length];
}

export function Select(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const opts = props.value && !props.options.includes(props.value) ? [...props.options, props.value] : props.options;
  return (
    <label className="field">
      {props.label}
      {props.required ? " *" : ""}
      <select value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {props.error && <span className="err">{props.error}</span>}
    </label>
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
}) {
  return (
    <label className="field">
      {props.label}
      {props.required ? " *" : ""}
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        list={props.list}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error && <span className="err">{props.error}</span>}
    </label>
  );
}

export function NumberField(props: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  error?: string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      {props.label}
      <input
        type="number"
        min={0}
        value={props.value ?? ""}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
      {props.hint && <span className="muted" style={{ fontWeight: 400 }}>{props.hint}</span>}
      {props.error && <span className="err">{props.error}</span>}
    </label>
  );
}

export function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
