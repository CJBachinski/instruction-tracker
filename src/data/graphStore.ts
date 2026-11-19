// SharePoint mode: the database is an Excel workbook in a SharePoint document library,
// read and written through Microsoft Graph's Excel API with the signed-in person's access.
// Each kind of record lives in a named Excel table: Bookings, Requests, Terms, Lists, AuditLog.
import type { Auth } from "../auth";
import {
  DEFAULT_LISTS,
  type AppData,
  type AuditEntry,
  type Booking,
  type ListName,
  type Lists,
  type Request,
  type Term,
} from "../model";
import { describeChanges, mergeBooking } from "../logic/merge";
import type { DataStore, SaveResult } from "./store";
import {
  AUDIT_COLUMNS,
  BOOKING_COLUMNS,
  REQUEST_COLUMNS,
  TERM_COLUMNS,
  fromRow,
  isBlankRow,
  toRow,
} from "./tables";

const GRAPH = "https://graph.microsoft.com/v1.0";

interface TableData {
  headers: string[];
  rows: unknown[][];
}

const BLANK_BOOKING = {} as Booking;
const BLANK_REQUEST = {} as Request;
const BLANK_TERM = {} as Term;

export class GraphStore implements DataStore {
  readonly mode = "sharepoint" as const;
  private base = "";
  private driveId = "";
  private parentId = "";
  private session = "";
  private headers: Record<string, string[]> = {};

  constructor(
    private auth: Auth,
    private cfg: { siteUrl: string; filePath: string },
    readonly user: string,
  ) {}

  // ---------- low-level ----------

  private async call(path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const token = await this.auth.token();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (this.session && path.includes("/workbook/")) headers["workbook-session-id"] = this.session;
    const res = await fetch(path.startsWith("http") ? path : GRAPH + path, { ...init, headers });
    if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 4) {
      const wait = Number(res.headers.get("Retry-After") ?? 2) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      return this.call(path, init, attempt + 1);
    }
    if (res.status === 404 && this.session && attempt === 0 && path.includes("/workbook/")) {
      // An expired workbook session looks like a 404: start a new one and retry once.
      this.session = "";
      await this.ensureSession();
      return this.call(path, init, attempt + 1);
    }
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const j = await res.json();
        msg = j?.error?.message ? `${msg}: ${j.error.message}` : msg;
      } catch {
        /* keep the status text */
      }
      throw new Error(`SharePoint request failed (${msg})`);
    }
    return res;
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.call(path, init);
    return (res.status === 204 ? {} : await res.json()) as T;
  }

  private async resolve() {
    if (this.base) return;
    const url = new URL(this.cfg.siteUrl);
    const site = await this.json<{ id: string }>(`/sites/${url.hostname}:${url.pathname.replace(/\/$/, "")}`);
    const file = this.cfg.filePath.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
    const item = await this.json<{ id: string; parentReference: { driveId: string; id: string } }>(
      `/sites/${site.id}/drive/root:/${file}`,
    );
    this.driveId = item.parentReference.driveId;
    this.parentId = item.parentReference.id;
    this.base = `/drives/${this.driveId}/items/${item.id}/workbook`;
    await this.ensureSession();
  }

  private async ensureSession() {
    if (this.session) return;
    const s = await this.json<{ id: string }>(`${this.base}/createSession`, {
      method: "POST",
      body: JSON.stringify({ persistChanges: true }),
    });
    this.session = s.id;
  }

  private async readTable(name: string): Promise<TableData> {
    const r = await this.json<{ values: unknown[][] }>(`${this.base}/tables/${name}/range`);
    const [headers = [], ...rows] = r.values ?? [];
    const h = headers.map((x) => String(x).trim());
    this.headers[name] = h;
    return { headers: h, rows };
  }

  private async rowRange(name: string, index: number) {
    return this.json<{ address: string; values: unknown[][] }>(
      `${this.base}/tables/${name}/rows/itemAt(index=${index})/range`,
    );
  }

  private async writeRange(address: string, values: unknown[][]) {
    const bang = address.lastIndexOf("!");
    const sheet = address.slice(0, bang).replace(/^'|'$/g, "").replace(/''/g, "'");
    const cells = address.slice(bang + 1);
    await this.call(
      `${this.base}/worksheets/${encodeURIComponent(sheet)}/range(address='${cells}')`,
      { method: "PATCH", body: JSON.stringify({ values }) },
    );
  }

  private async append(name: string, rows: unknown[][]) {
    if (!rows.length) return;
    const t = await this.readTable(name);
    // A brand-new Excel table always has one empty row: fill it before adding more.
    const blanks = t.rows.map((r, i) => (isBlankRow(r) ? i : -1)).filter((i) => i >= 0);
    const queue = [...rows];
    for (const i of blanks) {
      if (!queue.length) break;
      const rr = await this.rowRange(name, i);
      await this.writeRange(rr.address, [queue.shift()!]);
    }
    if (queue.length) {
      await this.call(`${this.base}/tables/${name}/rows`, {
        method: "POST",
        body: JSON.stringify({ values: queue }),
      });
    }
  }

  /** Overwrites a small table (Terms, Lists) with these rows, blanking leftovers. */
  private async replace(name: string, rows: unknown[][]) {
    const t = await this.readTable(name);
    const width = t.headers.length;
    for (let i = 0; i < Math.max(rows.length, t.rows.length); i++) {
      const values = rows[i] ?? new Array(width).fill("");
      if (i < t.rows.length) {
        const rr = await this.rowRange(name, i);
        await this.writeRange(rr.address, [values]);
      } else {
        await this.call(`${this.base}/tables/${name}/rows`, {
          method: "POST",
          body: JSON.stringify({ values: [values] }),
        });
      }
    }
  }

  private async audit(e: Omit<AuditEntry, "at" | "user">) {
    try {
      const headers = this.headers.AuditLog ?? (await this.readTable("AuditLog")).headers;
      const entry: AuditEntry = { at: new Date().toISOString(), user: this.user, ...e };
      await this.call(`${this.base}/tables/AuditLog/rows`, {
        method: "POST",
        body: JSON.stringify({ values: [toRow(AUDIT_COLUMNS, entry, headers)] }),
      });
    } catch {
      /* the change log is best effort; never block a save on it */
    }
  }

  // ---------- DataStore ----------

  async load(): Promise<AppData> {
    await this.resolve();
    const [b, r, t, l] = await Promise.all([
      this.readTable("Bookings"),
      this.readTable("Requests"),
      this.readTable("Terms"),
      this.readTable("Lists"),
    ]);
    const bookings = b.rows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => !isBlankRow(row))
      .map(({ row, i }) => {
        const x = fromRow(BOOKING_COLUMNS, b.headers, row, BLANK_BOOKING);
        return { ...x, version: x.version ?? 1, source: x.source || "manual", rowIndex: i } as Booking;
      })
      .filter((x) => x.id);
    const requests = r.rows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => !isBlankRow(row))
      .map(({ row, i }) => {
        const x = fromRow(REQUEST_COLUMNS, r.headers, row, BLANK_REQUEST);
        return { ...x, id: x.id || `row-${i}`, status: (x.status || "New") as Request["status"], rowIndex: i };
      });
    const terms = t.rows
      .filter((row) => !isBlankRow(row))
      .map((row, i) => {
        const x = fromRow(TERM_COLUMNS, t.headers, row, BLANK_TERM);
        return { ...x, status: (x.status === "Closed" ? "Closed" : "Open") as Term["status"], rowIndex: i };
      });
    const lists: Lists = Object.fromEntries(
      Object.keys(DEFAULT_LISTS).map((k) => [k, [] as string[]]),
    ) as unknown as Lists;
    for (const row of l.rows) {
      const [name, value] = [String(row[0] ?? "").trim(), String(row[1] ?? "").trim()];
      if (name in lists && value) lists[name as ListName].push(value);
    }
    for (const k of Object.keys(lists) as ListName[]) {
      if (!lists[k].length && k !== "college") lists[k] = [...DEFAULT_LISTS[k]];
    }
    return { bookings, requests, terms, lists };
  }

  async createBooking(b: Booking): Promise<Booking> {
    await this.resolve();
    const headers = this.headers.Bookings ?? (await this.readTable("Bookings")).headers;
    await this.append("Bookings", [toRow(BOOKING_COLUMNS, b, headers)]);
    await this.audit({ action: "create", bookingId: b.id, changes: describeChanges(null, b) });
    return b;
  }

  private async locate(id: string, hint?: number): Promise<{ index: number; address: string; values: unknown[] }> {
    const headers = this.headers.Bookings ?? (await this.readTable("Bookings")).headers;
    const idCol = headers.indexOf("ID");
    if (hint !== undefined) {
      const rr = await this.rowRange("Bookings", hint);
      if (String(rr.values[0][idCol]) === id) return { index: hint, address: rr.address, values: rr.values[0] };
    }
    // Rows moved (someone sorted the table in Excel): find it again by ID.
    const t = await this.readTable("Bookings");
    const index = t.rows.findIndex((r) => String(r[idCol]) === id);
    if (index < 0) throw new Error("That booking is no longer in the workbook.");
    const rr = await this.rowRange("Bookings", index);
    return { index, address: rr.address, values: rr.values[0] };
  }

  async updateBooking(base: Booking, edited: Booking): Promise<SaveResult> {
    await this.resolve();
    const loc = await this.locate(base.id, base.rowIndex);
    const headers = this.headers.Bookings;
    const current = {
      ...fromRow(BOOKING_COLUMNS, headers, loc.values, BLANK_BOOKING),
      rowIndex: loc.index,
    } as Booking;
    current.version = current.version ?? 1;
    if (current.deletedAt && !base.deletedAt && !edited.deletedAt) {
      return { ok: false, deleted: true, current };
    }
    const { merged, conflicts } = mergeBooking(base, edited, current);
    if (conflicts.length) return { ok: false, conflicts, current };
    const saved: Booking = {
      ...merged,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: this.user,
      rowIndex: loc.index,
    };
    await this.writeRange(loc.address, [toRow(BOOKING_COLUMNS, saved, headers, loc.values)]);
    await this.audit({
      action: saved.deletedAt && !current.deletedAt ? "delete" : "update",
      bookingId: saved.id,
      changes: describeChanges(current, saved),
    });
    return { ok: true, saved };
  }

  async importBookings(bs: Booking[]): Promise<void> {
    await this.resolve();
    const headers = this.headers.Bookings ?? (await this.readTable("Bookings")).headers;
    for (let i = 0; i < bs.length; i += 50) {
      await this.append(
        "Bookings",
        bs.slice(i, i + 50).map((b) => toRow(BOOKING_COLUMNS, b, headers)),
      );
    }
    await this.audit({ action: "import", bookingId: "", changes: `${bs.length} bookings imported` });
  }

  async addRequest(r: Request): Promise<void> {
    await this.resolve();
    const headers = this.headers.Requests ?? (await this.readTable("Requests")).headers;
    await this.append("Requests", [toRow(REQUEST_COLUMNS, r, headers)]);
  }

  async updateRequest(r: Request): Promise<void> {
    await this.resolve();
    const t = await this.readTable("Requests");
    const idCol = t.headers.indexOf("Request ID");
    let index = r.rowIndex ?? -1;
    if (index < 0 || String(t.rows[index]?.[idCol] ?? `row-${index}`) !== r.id) {
      index = t.rows.findIndex((row, i) => String(row[idCol] || `row-${i}`) === r.id);
    }
    if (index < 0) throw new Error("That request is no longer in the workbook.");
    const rr = await this.rowRange("Requests", index);
    await this.writeRange(rr.address, [toRow(REQUEST_COLUMNS, r, t.headers, rr.values[0])]);
    await this.audit({
      action: r.status === "Accepted" ? "accept_request" : "reject_request",
      bookingId: r.bookingId,
      changes: `request ${r.id}: ${r.status}${r.rejectReason ? ` (${r.rejectReason})` : ""}`,
    });
  }

  async saveTerms(terms: Term[]): Promise<void> {
    await this.resolve();
    const headers = this.headers.Terms ?? (await this.readTable("Terms")).headers;
    await this.replace("Terms", terms.map((t) => toRow(TERM_COLUMNS, t, headers)));
    await this.audit({ action: "settings", bookingId: "", changes: "terms updated" });
  }

  async saveLists(lists: Lists): Promise<void> {
    await this.resolve();
    const rows: unknown[][] = [];
    for (const [name, values] of Object.entries(lists)) for (const v of values) rows.push([name, v]);
    await this.replace("Lists", rows);
    await this.audit({ action: "settings", bookingId: "", changes: "dropdown lists updated" });
  }

  async saveArchive(fileName: string, data: ArrayBuffer): Promise<string> {
    await this.resolve();
    await this.call(
      `/drives/${this.driveId}/items/${this.parentId}:/archive/${encodeURIComponent(fileName)}:/content`,
      {
        method: "PUT",
        body: data,
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      },
    );
    return `saved to the archive folder next to the database`;
  }
}
