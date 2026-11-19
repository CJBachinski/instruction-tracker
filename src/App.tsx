import { useCallback, useEffect, useRef, useState } from "react";
import { loadConfig, sharepointProblems, type AppConfig } from "./config";
import { Auth } from "./auth";
import type { AppData } from "./model";
import type { DataStore } from "./data/store";
import { DEMO_STORAGE_KEY, DemoStore } from "./data/demoStore";
import { GraphStore } from "./data/graphStore";
import BookingsPage from "./ui/BookingsPage";
import RequestsPage from "./ui/RequestsPage";
import DashboardPage from "./ui/DashboardPage";
import SettingsPage from "./ui/SettingsPage";
import FormPreviewPage from "./ui/FormPreviewPage";

type Page = "bookings" | "requests" | "dashboard" | "settings" | "form";
const PAGES: Page[] = ["bookings", "requests", "dashboard", "settings", "form"];

function pageFromHash(): Page {
  const h = window.location.hash.replace(/^#\/?/, "") as Page;
  return PAGES.includes(h) ? h : "bookings";
}

type Boot =
  | { state: "loading" }
  | { state: "setup"; problems: string[] }
  | { state: "signin"; auth: Auth; cfg: AppConfig }
  | { state: "denied"; email: string; auth: Auth }
  | { state: "error"; message: string }
  | { state: "ready"; cfg: AppConfig; auth: Auth | null };

const DEMO_USER_KEY = "instruction-tracker-demo-user";

export default function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const [store, setStore] = useState<DataStore | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [page, setPage] = useState<Page>(pageFromHash());
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [demoUser, setDemoUser] = useState<string>(() => {
    try {
      return localStorage.getItem(DEMO_USER_KEY) || "Kathleen";
    } catch {
      return "Kathleen";
    }
  });
  const toastTimer = useRef<number>();

  const notify = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 9000 : 4500);
  }, []);

  // Start up: read config, sign in if SharePoint mode, then build the data store.
  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      document.title = cfg.appTitle;
      if (cfg.mode !== "sharepoint") {
        setBoot({ state: "ready", cfg, auth: null });
        return;
      }
      const problems = sharepointProblems(cfg);
      if (problems.length) {
        setBoot({ state: "setup", problems });
        return;
      }
      try {
        const auth = await Auth.create(cfg);
        if (!auth.account) {
          setBoot({ state: "signin", auth, cfg });
          return;
        }
        const allowed = cfg.allowedUsers.map((u) => u.toLowerCase());
        if (allowed.length && !allowed.includes(auth.email)) {
          setBoot({ state: "denied", email: auth.email, auth });
          return;
        }
        setStore(new GraphStore(auth, cfg.sharepoint, auth.displayName));
        setBoot({ state: "ready", cfg, auth });
      } catch (e) {
        setBoot({ state: "error", message: (e as Error).message });
      }
    })();
  }, []);

  // Demo store follows the "I am" picker.
  useEffect(() => {
    if (boot.state === "ready" && !boot.auth) setStore(new DemoStore(demoUser));
  }, [boot, demoUser]);

  const refresh = useCallback(async () => {
    if (!store) return;
    try {
      setData(await store.load());
      setLastSync(new Date());
    } catch (e) {
      notify((e as Error).message, true);
    }
  }, [store, notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep everyone's screen current: poll SharePoint; in demo, follow other tabs.
  useEffect(() => {
    if (boot.state !== "ready" || !store) return;
    const secs = store.mode === "demo" ? 5 : Math.max(10, boot.cfg.refreshSeconds);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, secs * 1000);
    const onStorage = (e: StorageEvent) => e.key === DEMO_STORAGE_KEY && refresh();
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("storage", onStorage);
    };
  }, [boot, store, refresh]);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (boot.state === "loading") return <div className="center">Loading…</div>;
  if (boot.state === "setup")
    return (
      <div className="center">
        <div className="card">
          <h1>Almost ready</h1>
          <p>config.json is set to SharePoint mode, but these settings are missing:</p>
          <ul>{boot.problems.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="muted">See docs/SETUP.md, or set "mode" to "demo" to try the app without SharePoint.</p>
        </div>
      </div>
    );
  if (boot.state === "signin")
    return (
      <div className="center">
        <div className="card">
          <h1>{boot.cfg.appTitle}</h1>
          <p>Sign in with your DeSales Microsoft 365 account.</p>
          <button className="btn primary" onClick={() => boot.auth.login()}>Sign in</button>
        </div>
      </div>
    );
  if (boot.state === "denied")
    return (
      <div className="center">
        <div className="card">
          <h1>No access</h1>
          <p>{boot.email} isn't on the list of people who can use this app. Ask the library to add you.</p>
          <button className="btn" onClick={() => boot.auth.logout()}>Sign out</button>
        </div>
      </div>
    );
  if (boot.state === "error")
    return (
      <div className="center">
        <div className="card">
          <h1>Couldn't start</h1>
          <p>{boot.message}</p>
        </div>
      </div>
    );

  const cfg = boot.cfg;
  const newRequests = data?.requests.filter((r) => r.status === "New").length ?? 0;
  const nav: { id: Page; label: string; show: boolean }[] = [
    { id: "bookings", label: "Bookings", show: true },
    { id: "requests", label: "Requests", show: true },
    { id: "dashboard", label: "Dashboard", show: true },
    { id: "settings", label: "Settings", show: true },
    { id: "form", label: "Faculty form (preview)", show: cfg.showFormPreview },
  ];

  return (
    <>
      <div className="topbar">
        <span className="brand">{cfg.appTitle}</span>
        <nav className="nav" aria-label="Main">
          {nav.filter((n) => n.show).map((n) => (
            <a key={n.id} href={`#/${n.id}`} className={page === n.id ? "active" : ""} aria-current={page === n.id ? "page" : undefined}>
              {n.label}
              {n.id === "requests" && newRequests > 0 && <span className="count">{newRequests}</span>}
            </a>
          ))}
        </nav>
        <span className="spacer" />
        <div className="who">
          {store?.mode === "demo" ? (
            <span className="badge demo" title="Data stays in this browser until SharePoint is connected">Demo mode</span>
          ) : (
            <span className="badge live">SharePoint</span>
          )}
          {lastSync && <span title="The app checks for other people's changes automatically">Updated {lastSync.toLocaleTimeString()}</span>}
          {store?.mode === "demo" ? (
            <label>
              I am{" "}
              <select
                value={demoUser}
                onChange={(e) => {
                  setDemoUser(e.target.value);
                  try {
                    localStorage.setItem(DEMO_USER_KEY, e.target.value);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {(data?.lists.librarian ?? ["Kathleen", "Lisa", "Michele"]).map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
          ) : (
            <>
              <span>{store?.user}</span>
              <button className="btn small" onClick={() => boot.auth?.logout()}>Sign out</button>
            </>
          )}
        </div>
      </div>
      <main>
        {!data || !store ? (
          <div className="empty">Loading bookings…</div>
        ) : (
          (() => {
            const props = { data, store, refresh, notify };
            switch (page) {
              case "requests":
                return <RequestsPage {...props} />;
              case "dashboard":
                return <DashboardPage {...props} />;
              case "settings":
                return (
                  <SettingsPage
                    {...props}
                    demoUser={store.mode === "demo" ? { value: demoUser, set: setDemoUser } : undefined}
                  />
                );
              case "form":
                return <FormPreviewPage {...props} />;
              default:
                return <BookingsPage {...props} />;
            }
          })()
        )}
      </main>
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          {toast.msg}
        </div>
      )}
    </>
  );
}
