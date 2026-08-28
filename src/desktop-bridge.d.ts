export {};

declare global {
  interface Window {
    localOpsDesktop?: {
      getState(): Promise<{ desktop: true; topmost: boolean; closeBehavior: "tray"; startup: import("./types").StartupState }>;
      setAlwaysOnTop(enabled: boolean): Promise<{ supported: boolean; topmost: boolean; message: string }>;
      hidePet(): Promise<{ hidden: boolean }>;
      showDesk(path?: string): Promise<{ opened: boolean }>;
      showPet(): Promise<{ opened: boolean }>;
      hideCodexPet(): Promise<{ hidden: boolean }>;
      showCodexPet(): Promise<{ opened: boolean }>;
      setCodexCompanionHover(active: boolean): Promise<{ visible: boolean }>;
      setCodexPanelDetail(detail: boolean): Promise<{ detail: boolean; bounds: { x: number; y: number; width: number; height: number } }>;
      resizeCodexPet(direction: -1 | 1): Promise<{ bounds: { x: number; y: number; width: number; height: number } }>;
      showNotification(request: { kind: "ready" | "test" } | { kind: "status"; critical: number; warning: number; unknown: number }): Promise<{ accepted: boolean; channel: "windows-tray" | "unsupported" | "rejected"; message: string }>;
      setLoginStartup(enabled: boolean): Promise<{ startup: import("./types").StartupState }>;
    };
  }
}
