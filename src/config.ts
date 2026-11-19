// Runtime settings read from config.json next to index.html, so IT can
// switch from demo to SharePoint without rebuilding the app.

export interface AppConfig {
  mode: "demo" | "sharepoint";
  appTitle: string;
  auth: { tenantId: string; clientId: string; redirectUri?: string };
  sharepoint: { siteUrl: string; filePath: string };
  allowedUsers: string[];
  refreshSeconds: number;
  showFormPreview: boolean;
}

const DEFAULTS: AppConfig = {
  mode: "demo",
  appTitle: "Instruction Tracker",
  auth: { tenantId: "", clientId: "" },
  sharepoint: { siteUrl: "", filePath: "InstructionTracker/InstructionTracker-DB.xlsx" },
  allowedUsers: [],
  refreshSeconds: 20,
  showFormPreview: true,
};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const res = await fetch("./config.json", { cache: "no-store" });
    if (!res.ok) return DEFAULTS;
    const c = (await res.json()) as Partial<AppConfig>;
    return {
      ...DEFAULTS,
      ...c,
      auth: { ...DEFAULTS.auth, ...(c.auth ?? {}) },
      sharepoint: { ...DEFAULTS.sharepoint, ...(c.sharepoint ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

/** What is missing before SharePoint mode can work, in plain words. */
export function sharepointProblems(c: AppConfig): string[] {
  const p: string[] = [];
  if (!c.auth.tenantId) p.push("auth.tenantId (the DeSales Microsoft 365 tenant ID)");
  if (!c.auth.clientId) p.push("auth.clientId (from the app registration IT creates)");
  if (!c.sharepoint.siteUrl) p.push("sharepoint.siteUrl (the SharePoint site that holds the workbook)");
  if (!c.sharepoint.filePath) p.push("sharepoint.filePath (the workbook's path in that site's Documents)");
  return p;
}
