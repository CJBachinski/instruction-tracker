// Demo mode: data lives in this browser only, so Kathleen can try every feature
// before IT connects SharePoint and sign-in. Two tabs in the same browser stay in sync.
import type { AppData, Booking, Lists, Request, Term } from "../model";
import { mergeBooking } from "../logic/merge";
import type { DataStore, SaveResult } from "./store";
import { makeSeed } from "./seed";

const KEY = "instruction-tracker-demo-v1";

function read(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppData;
  } catch {
    /* fall through to a fresh seed */
  }
  const seed = makeSeed();
  write(seed);
  return seed;
}

function write(d: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage full or blocked: the session still works in memory */
  }
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export class DemoStore implements DataStore {
  readonly mode = "demo" as const;
  constructor(readonly user: string) {}

  async load(): Promise<AppData> {
    return read();
  }

  async createBooking(b: Booking): Promise<Booking> {
    const d = read();
    d.bookings.push(b);
    write(d);
    return b;
  }

  async updateBooking(base: Booking, edited: Booking): Promise<SaveResult> {
    const d = read();
    const i = d.bookings.findIndex((x) => x.id === base.id);
    if (i < 0) throw new Error("That booking no longer exists.");
    const current = d.bookings[i];
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
    };
    d.bookings[i] = saved;
    write(d);
    return { ok: true, saved };
  }

  async importBookings(bs: Booking[]): Promise<void> {
    const d = read();
    d.bookings.push(...bs);
    write(d);
  }

  async addRequest(r: Request): Promise<void> {
    const d = read();
    d.requests.push(r);
    write(d);
  }

  async updateRequest(r: Request): Promise<void> {
    const d = read();
    d.requests = d.requests.map((x) => (x.id === r.id ? r : x));
    write(d);
  }

  async saveTerms(terms: Term[]): Promise<void> {
    const d = read();
    d.terms = terms;
    write(d);
  }

  async saveLists(lists: Lists): Promise<void> {
    const d = read();
    d.lists = lists;
    write(d);
  }

  async saveArchive(fileName: string, data: ArrayBuffer): Promise<string> {
    const { downloadBlob } = await import("../io/download");
    downloadBlob(new Blob([data]), fileName);
    return `downloaded ${fileName}`;
  }
}

export const DEMO_STORAGE_KEY = KEY;
