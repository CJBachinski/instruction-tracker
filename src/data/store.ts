import type { AppData, Booking, Lists, Request, Term } from "../model";
import type { Conflict } from "../logic/merge";

export type SaveResult =
  | { ok: true; saved: Booking }
  | { ok: false; conflicts: Conflict[]; current: Booking }
  | { ok: false; deleted: true; current: Booking };

/** Everything the screens need from wherever the data lives. */
export interface DataStore {
  readonly mode: "demo" | "sharepoint";
  readonly user: string;
  load(): Promise<AppData>;
  createBooking(b: Booking): Promise<Booking>;
  /** Saves `edited`; merges with anyone else's changes since `base` was loaded. */
  updateBooking(base: Booking, edited: Booking): Promise<SaveResult>;
  importBookings(bs: Booking[]): Promise<void>;
  addRequest(r: Request): Promise<void>;
  updateRequest(r: Request): Promise<void>;
  saveTerms(terms: Term[]): Promise<void>;
  saveLists(lists: Lists): Promise<void>;
  /** Puts a closed term's snapshot next to the database (SharePoint) or downloads it (demo). */
  saveArchive(fileName: string, data: ArrayBuffer): Promise<string>;
}
