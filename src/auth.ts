// Single sign-on with the university's Microsoft 365 accounts (MSAL.js, redirect flow).
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";
import type { AppConfig } from "./config";

// Delegated permissions: the app can only reach files the signed-in person can already reach.
export const GRAPH_SCOPES = ["User.Read", "Sites.ReadWrite.All"];

export class Auth {
  account: AccountInfo | null = null;

  private constructor(private pca: PublicClientApplication) {}

  static async create(cfg: AppConfig): Promise<Auth> {
    const pca = new PublicClientApplication({
      auth: {
        clientId: cfg.auth.clientId,
        authority: `https://login.microsoftonline.com/${cfg.auth.tenantId}`,
        redirectUri: cfg.auth.redirectUri || window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await pca.initialize();
    const a = new Auth(pca);
    const result = await pca.handleRedirectPromise();
    a.account = result?.account ?? pca.getAllAccounts()[0] ?? null;
    if (a.account) pca.setActiveAccount(a.account);
    return a;
  }

  login() {
    return this.pca.loginRedirect({ scopes: GRAPH_SCOPES });
  }

  logout() {
    return this.pca.logoutRedirect({ account: this.account ?? undefined });
  }

  get email(): string {
    return (this.account?.username ?? "").toLowerCase();
  }

  get displayName(): string {
    return this.account?.name || this.account?.username || "";
  }

  async token(): Promise<string> {
    if (!this.account) throw new Error("Not signed in.");
    try {
      const r = await this.pca.acquireTokenSilent({ scopes: GRAPH_SCOPES, account: this.account });
      return r.accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        await this.pca.acquireTokenRedirect({ scopes: GRAPH_SCOPES, account: this.account });
      }
      throw e;
    }
  }
}
