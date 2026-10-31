type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type InstallPrompt = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<InstallChoice>;
};

/** A prompt is single-use. No reload, cached credentials or offline writes. */
export class InstallController {
  private pending: InstallPrompt | null = null;
  private listeners = new Set<() => void>();
  private standalone = () => false;

  getSnapshot = () => this.pending !== null && !this.standalone();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  start(target: EventTarget, standalone: () => boolean) {
    this.standalone = standalone;
    const capture = (event: Event) => {
      if (
        !("prompt" in event) ||
        typeof event.prompt !== "function" ||
        !("userChoice" in event)
      )
        return;
      event.preventDefault();
      this.pending = standalone() ? null : (event as InstallPrompt);
      this.notify();
    };
    const installed = () => {
      this.pending = null;
      this.notify();
    };
    target.addEventListener("beforeinstallprompt", capture);
    target.addEventListener("appinstalled", installed);
    return () => {
      target.removeEventListener("beforeinstallprompt", capture);
      target.removeEventListener("appinstalled", installed);
      this.pending = null;
      this.notify();
    };
  }

  async install() {
    const event = this.pending;
    if (!event || this.standalone()) return null;
    this.pending = null;
    this.notify();
    await event.prompt();
    return (await event.userChoice).outcome;
  }
}

export const pwaInstall = new InstallController();
