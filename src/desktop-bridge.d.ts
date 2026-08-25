export {};

declare global {
  interface Window {
    localOpsDesktop?: {
      getState(): Promise<{ desktop: true; topmost: boolean; closeBehavior: "tray"; startup: import("./types").StartupState }>;
      setAlwaysOnTop(enabled: boolean): Promise<{ supported: boolean; topmost: boolean; message: string }>;
      showDesk(path?: string): Promise<{ opened: boolean }>;
      showPet(): Promise<{ opened: boolean }>;
      setLoginStartup(enabled: boolean): Promise<{ startup: import("./types").StartupState }>;
    };
  }
}
