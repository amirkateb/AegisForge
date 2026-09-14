export interface InstallStep {
  name: string;
  apply(): Promise<void>;
  rollback(): Promise<void>;
}

export class InstallTransaction {
  private readonly steps: InstallStep[] = [];
  private readonly completed: InstallStep[] = [];
  constructor(
    private readonly onProgress: (event: {
      type: "START" | "DONE" | "ROLLBACK";
      name: string;
    }) => void = () => undefined,
  ) {}
  add(step: InstallStep): void {
    this.steps.push(step);
  }
  async run(): Promise<void> {
    try {
      for (const step of this.steps) {
        this.onProgress({ type: "START", name: step.name });
        await step.apply();
        this.completed.push(step);
        this.onProgress({ type: "DONE", name: step.name });
      }
    } catch (error) {
      for (const step of this.completed.toReversed()) {
        this.onProgress({ type: "ROLLBACK", name: step.name });
        try {
          await step.rollback();
        } catch {
          /* preserve original failure */
        }
      }
      throw error;
    }
  }
}
