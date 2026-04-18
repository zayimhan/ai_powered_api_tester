import { Component, OnInit } from "@angular/core";
import { ScenarioService } from "../../services/scenario.service";
import { CollectionsService } from "../../services/collections.service";
import { ToastService } from "../../services/toast.service";
import {
  Collection,
  Scenario,
  ScenarioStep,
  ScenarioRunResult,
} from "../../models/api.models";

@Component({
  selector: "app-scenario-runner",
  templateUrl: "./scenario-runner.component.html",
  styleUrls: ["./scenario-runner.component.css"],
})
export class ScenarioRunnerComponent implements OnInit {
  // ─── State ───
  collections: Collection[] = [];
  selectedCollectionId: number | null = null;
  command = "";

  // Current scenario
  scenario: Scenario | null = null;
  steps: ScenarioStep[] = [];
  runResult: ScenarioRunResult | null = null;

  // Past scenarios
  scenarios: Scenario[] = [];

  // UI state
  loading = false;
  analyzing = false;
  running = false;
  smartRunning = false;
  resuming = false;
  lastRunEngine: 'deterministic' | 'langgraph' = 'deterministic';
  activeView: "input" | "plan" | "results" = "input";

  constructor(
    private scenarioService: ScenarioService,
    private collectionsService: CollectionsService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadCollections();
    this.loadScenarios();
  }

  // ─── Data Loading ───

  loadCollections(): void {
    this.collectionsService.getAll().subscribe({
      next: (data) => (this.collections = data),
      error: () => this.toast.error("Failed to load collections"),
    });
  }

  loadScenarios(): void {
    this.scenarioService.getAll().subscribe({
      next: (data) => (this.scenarios = data),
      error: () => {},
    });
  }

  // ─── Analyze (Send to CrewAI) ───

  analyze(): void {
    if (!this.selectedCollectionId || !this.command.trim()) {
      this.toast.error("Select a collection and enter a command");
      return;
    }

    this.analyzing = true;
    this.scenarioService
      .analyze({
        collection_id: this.selectedCollectionId,
        natural_language_command: this.command.trim(),
      })
      .subscribe({
        next: (res) => {
          this.scenario = res.scenario;
          this.steps = res.steps;
          this.runResult = null;
          this.activeView = "plan";
          this.analyzing = false;
          this.loadScenarios();
          this.toast.success("Plan generated successfully");
        },
        error: (err) => {
          this.analyzing = false;
          this.toast.error(err.error?.error || "Analysis failed");
        },
      });
  }

  // ─── Run Scenario ───

  runScenario(): void {
    if (!this.scenario) return;

    this.running = true;
    this.scenarioService.run(this.scenario.id).subscribe({
      next: (result) => {
        this.runResult = result;
        this.activeView = "results";
        this.running = false;
        this.loadScenarios();

        const passed = result.steps.filter((s) => s.status === "passed").length;
        const total = result.steps.length;
        if (result.status === "passed") {
          this.toast.success(`Execution complete: ${passed}/${total} passed`);
        } else {
          this.toast.error(`Execution complete: ${passed}/${total} passed`);
        }
      },
      error: (err) => {
        this.running = false;
        this.toast.error(err.error?.error || "Execution failed");
      },
    });
  }

  // ─── Smart Run (LangGraph) ───

  runGraphScenario(): void {
    if (!this.scenario) return;

    this.smartRunning = true;
    this.scenarioService.runGraph(this.scenario.id).subscribe({
      next: (data) => {
        // Normalize LangGraph response to ScenarioRunResult shape
        const steps = (data.step_results || []).map((s: any) => ({
          step_id: s.step_index ?? 0,
          step_order: s.step_order ?? s.step_index + 1,
          status: s.passed ? 'passed' : 'failed',
          status_code: s.status_code,
          response_time_ms: s.response_time_ms,
          assertions: s.assertions,
          extracted_variables: s.extracted_variables,
          used_credentials: s.used_credentials,
          actor: s.actor,
          evaluator_feedback: s.evaluator_feedback,
          heal_attempts: s.heal_attempts ?? 0,
          request_method: s.request_method,
          request_url: s.request_url,
          request_headers: s.request_headers,
          request_body: s.request_body,
          response_body: s.response_body,
          response_headers: s.response_headers,
          error: s.error_message,
        }));

        this.runResult = {
          scenario_id: this.scenario!.id,
          status: data.final_status === 'passed' ? 'passed' : 'failed',
          steps,
        };
        this.lastRunEngine = 'langgraph';
        this.activeView = 'results';
        this.smartRunning = false;
        this.loadScenarios();

        const passed = steps.filter((s: any) => s.status === 'passed').length;
        const total = steps.length;
        if (data.final_status === 'passed') {
          this.toast.success(`Smart Run complete: ${passed}/${total} passed`);
        } else {
          this.toast.error(`Smart Run complete: ${passed}/${total} passed`);
        }
      },
      error: (err) => {
        this.smartRunning = false;
        this.toast.error(err.error?.error || 'Smart Run failed');
      },
    });
  }

  // ─── Resume LangGraph ───

  resumeScenario(): void {
    if (!this.scenario) return;

    this.resuming = true;
    this.scenarioService.resumeGraph(this.scenario.id).subscribe({
      next: (data) => {
        const steps = (data.step_results || []).map((s: any) => ({
          step_id: s.step_index ?? 0,
          step_order: s.step_order ?? s.step_index + 1,
          status: s.passed ? 'passed' : 'failed',
          status_code: s.status_code,
          response_time_ms: s.response_time_ms,
          assertions: s.assertions,
          extracted_variables: s.extracted_variables,
          used_credentials: s.used_credentials,
          actor: s.actor,
          evaluator_feedback: s.evaluator_feedback,
          heal_attempts: s.heal_attempts ?? 0,
          request_method: s.request_method,
          request_url: s.request_url,
          request_headers: s.request_headers,
          request_body: s.request_body,
          response_body: s.response_body,
          response_headers: s.response_headers,
          error: s.error_message,
        }));

        this.runResult = {
          scenario_id: this.scenario!.id,
          status: data.final_status === 'passed' ? 'passed' : 'failed',
          steps,
        };
        this.lastRunEngine = 'langgraph';
        this.activeView = 'results';
        this.resuming = false;
        this.loadScenarios();

        const passed = steps.filter((s: any) => s.status === 'passed').length;
        const total = steps.length;
        if (data.final_status === 'passed') {
          this.toast.success(`Resume complete: ${passed}/${total} passed`);
        } else {
          this.toast.error(`Resume complete: ${passed}/${total} passed`);
        }
      },
      error: (err) => {
        this.resuming = false;
        this.toast.error(err.error?.error || 'Resume failed');
      },
    });
  }

  // ─── Replan ───

  replan(): void {
    if (!this.scenario) return;

    this.analyzing = true;
    this.scenarioService.replan(this.scenario.id).subscribe({
      next: (res) => {
        this.scenario = res.scenario;
        this.steps = res.steps;
        this.runResult = null;
        this.activeView = "plan";
        this.analyzing = false;
        this.toast.success("Plan regenerated");
      },
      error: (err) => {
        this.analyzing = false;
        this.toast.error(err.error?.error || "Replan failed");
      },
    });
  }

  // ─── Load Past Scenario ───

  loadScenario(id: number): void {
    this.loading = true;
    this.scenarioService.getById(id).subscribe({
      next: (scenario) => {
        this.scenario = scenario;
        this.scenarioService.getSteps(id).subscribe({
          next: (steps) => {
            this.steps = steps;
            this.runResult = null;
            this.activeView = "plan";
            this.loading = false;
          },
        });
      },
      error: () => {
        this.loading = false;
        this.toast.error("Failed to load scenario");
      },
    });
  }

  deleteScenario(id: number): void {
    this.scenarioService.delete(id).subscribe({
      next: () => {
        this.scenarios = this.scenarios.filter((s) => s.id !== id);
        if (this.scenario?.id === id) {
          this.scenario = null;
          this.steps = [];
          this.runResult = null;
          this.activeView = "input";
        }
        this.toast.success("Scenario deleted");
      },
    });
  }

  // ─── Helpers ───

  resetToInput(): void {
    this.scenario = null;
    this.steps = [];
    this.runResult = null;
    this.command = "";
    this.activeView = "input";
  }

  getStatusClass(status: string): string {
    switch (status) {
      case "passed":
        return "status-passed";
      case "failed":
        return "status-failed";
      case "error":
        return "status-error";
      case "running":
        return "status-running";
      case "planned":
        return "status-planned";
      default:
        return "status-pending";
    }
  }

  getMethodClass(method: string): string {
    return `method-${(method || "get").toLowerCase()}`;
  }

  getFieldLabel(key: string): string {
    const labels: Record<string, string> = {
      email: "E-posta",
      username: "Kullanıcı adı",
      password: "Şifre",
      name: "Ad",
      phone: "Telefon",
    };
    return labels[key] ?? key;
  }

  getPassedCount(): number {
    return (
      this.runResult?.steps.filter((s) => s.status === "passed").length || 0
    );
  }

  getFailedCount(): number {
    return (
      this.runResult?.steps.filter((s) => s.status !== "passed").length || 0
    );
  }

  // ─── Request/Response Detail Toggle ───

  expandedSteps = new Set<number>();

  toggleDetail(stepId: number): void {
    if (this.expandedSteps.has(stepId)) {
      this.expandedSteps.delete(stepId);
    } else {
      this.expandedSteps.add(stepId);
    }
  }

  isExpanded(stepId: number): boolean {
    return this.expandedSteps.has(stepId);
  }

  formatJson(value: any): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  hasHeaders(headers: Record<string, string> | null | undefined): boolean {
    return !!headers && Object.keys(headers).length > 0;
  }
}
