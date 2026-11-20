import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { loadConfig, sharepointProblems, type AppConfig } from "./config";
import type { Auth } from "./auth";
import type { AppData } from "./model";
import type { DataStore } from "./data/store";
import { DEMO_STORAGE_KEY, DemoStore } from "./data/demoStore";
import BookingsPage from "./ui/BookingsPage";
import RequestsPage from "./ui/RequestsPage";
import DashboardPage from "./ui/DashboardPage";
import SettingsPage from "./ui/SettingsPage";
import FormPreviewPage from "./ui/FormPreviewPage";
import { CalendarDays, ChartColumn, Check, ChevronsUpDown, FileText, Inbox, LogOut, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { statusOf } from "./model";

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
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [demoUser, setDemoUser] = useState<string>(() => {
    try {
      return localStorage.getItem(DEMO_USER_KEY) || "Kathleen";
    } catch {
      return "Kathleen";
    }
  });

  const notify = useCallback((msg: string, error = false) => {
    if (error) toast.error(msg, { duration: 9000 });
    else toast(msg, { duration: 4500 });
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
        const [{ Auth }, { GraphStore }] = await Promise.all([import("./auth"), import("./data/graphStore")]);
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

  // The sidebar highlight slides to the current page instead of jumping.
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    setPill(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [page, boot.state, data === null]);

  if (boot.state === "loading") return <Splash title="Loading" />;
  if (boot.state === "setup")
    return (
      <Splash title="Almost ready">
        <p>config.json is set to SharePoint mode, but these settings are missing:</p>
        <ul className="list-disc space-y-1 pl-5">
          {boot.problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          See docs/SETUP.md, or set "mode" to "demo" to try the app without SharePoint.
        </p>
      </Splash>
    );
  if (boot.state === "signin")
    return (
      <Splash title={boot.cfg.appTitle}>
        <p>Sign in with your DeSales Microsoft 365 account.</p>
        <Button size="lg" onClick={() => boot.auth.login()}>
          Sign in
        </Button>
      </Splash>
    );
  if (boot.state === "denied")
    return (
      <Splash title="No access">
        <p>{boot.email} isn't on the list of people who can use this app. Ask the library to add you.</p>
        <Button variant="outline" onClick={() => boot.auth.logout()}>
          Sign out
        </Button>
      </Splash>
    );
  if (boot.state === "error")
    return (
      <Splash title="Couldn't start">
        <p>{boot.message}</p>
      </Splash>
    );

  const cfg = boot.cfg;
  const newRequests = data?.requests.filter((r) => r.status === "New").length ?? 0;
  const needAttention =
    data?.bookings.filter((b) => !b.deletedAt && ["New", "Wrap-up"].includes(statusOf(b))).length ?? 0;
  const isDemo = store?.mode === "demo";
  const userName = isDemo ? demoUser : (store?.user ?? "");
  const librarians = data?.lists.librarian ?? ["Kathleen", "Lisa", "Michele"];

  const pickDemoUser = (name: string) => {
    setDemoUser(name);
    try {
      localStorage.setItem(DEMO_USER_KEY, name);
    } catch {
      /* ignore */
    }
  };

  const nav: { id: Page; label: string; icon: ReactNode; count?: number; show: boolean }[] = [
    { id: "bookings", label: "Bookings", icon: <CalendarDays />, count: needAttention, show: true },
    { id: "requests", label: "Requests", icon: <Inbox />, count: newRequests, show: true },
    { id: "dashboard", label: "Dashboard", icon: <ChartColumn />, show: true },
    { id: "settings", label: "Settings", icon: <Settings />, show: true },
    { id: "form", label: "Faculty form preview", icon: <FileText />, show: cfg.showFormPreview },
  ];

  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="flex shrink-0 flex-row flex-wrap items-center gap-x-2 gap-y-1 border-b border-sidebar-border bg-sidebar px-3 py-2 md:sticky md:top-0 md:h-screen md:w-56 md:flex-col md:flex-nowrap md:items-stretch md:gap-0 md:border-r md:border-b-0 md:px-3 md:py-5">
          <div className="px-2 md:pb-5">
            <div className="text-[15px] leading-tight font-semibold">{cfg.appTitle}</div>
            <div className="hidden text-[13px] text-muted-foreground md:block">Trexler Library</div>
          </div>
          <nav ref={navRef} aria-label="Main" className="relative flex flex-1 flex-row flex-wrap gap-0.5 md:flex-none md:flex-col">
            {pill && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 hidden rounded-lg bg-sidebar-accent transition-[transform,height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] md:block"
                style={{ height: pill.height, transform: `translateY(${pill.top}px)` }}
              />
            )}
            {nav
              .filter((n) => n.show)
              .map((n) => {
                const active = page === n.id;
                return (
                  <a
                    key={n.id}
                    href={`#/${n.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-9 items-center gap-2.5 rounded-lg px-2 text-[14px] text-foreground/80 transition-colors [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
                      "hover:bg-sidebar-accent/70",
                      active && "bg-sidebar-accent font-semibold text-foreground md:bg-transparent md:hover:bg-transparent [&_svg]:text-foreground",
                      n.id === "form" && "md:mt-4",
                    )}
                  >
                    {n.icon}
                    <span className="truncate">{n.label}</span>
                    {!!n.count && (
                      <span
                        className="ml-auto pl-2 text-[13px] font-medium text-muted-foreground tabular-nums"
                        aria-label={n.id === "requests" ? `${n.count} new requests` : `${n.count} need attention`}
                      >
                        {n.count}
                      </span>
                    )}
                  </a>
                );
              })}
          </nav>
          <div className="md:mt-auto md:pt-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent/70"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] font-semibold text-background">
                    {(userName[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{userName || "Signed out"}</span>
                    <span className="hidden text-[12px] text-muted-foreground md:block">
                      {isDemo ? "Demo mode" : "SharePoint"}
                    </span>
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-60">
                {isDemo ? (
                  <>
                    <DropdownMenuLabel>Use the demo as</DropdownMenuLabel>
                    {librarians.map((l) => (
                      <DropdownMenuItem key={l} onSelect={() => pickDemoUser(l)}>
                        <span className="flex-1">{l}</span>
                        {l === demoUser && <Check />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <p className="px-1.5 py-1 text-[12px] leading-snug text-muted-foreground">
                      Demo data stays in this browser until SharePoint is connected.
                    </p>
                  </>
                ) : (
                  <DropdownMenuItem onSelect={() => boot.auth?.logout()}>
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {lastSync && (
              <p
                className="hidden px-2 pt-2 text-[12px] text-muted-foreground md:block"
                title="The app checks for other people's changes automatically"
              >
                Updated {lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <div key={page} className="view-in mx-auto w-full max-w-[1180px] px-6 py-8 lg:px-10">
            {!data || !store ? (
              <p className="py-24 text-center text-muted-foreground">Loading bookings</p>
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
                        demoUser={store.mode === "demo" ? { value: demoUser, set: pickDemoUser } : undefined}
                      />
                    );
                  case "form":
                    return <FormPreviewPage {...props} />;
                  default:
                    return <BookingsPage {...props} />;
                }
              })()
            )}
          </div>
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

function Splash(props: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-start gap-4 rounded-2xl border bg-card p-8">
        <h1 className="text-[24px] font-semibold">{props.title}</h1>
        {props.children}
      </div>
    </div>
  );
}
