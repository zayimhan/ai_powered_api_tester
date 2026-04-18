export interface User {
  id: number;
  username: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Collection {
  id: number;
  name: string;
  user_id?: number;
  created_at?: string;
}

export interface SavedRequest {
  id: number;
  collection_id: number;
  name: string;
  title?: string;
  method: string;
  url: string;
  headers?: string;
  query_params?: string;
  body?: string | null;
  body_type?: string;
  created_at?: string;
}

export interface ExecutionPayload {
  method: string;
  url: string;
  headers: Record<string, string>;
  query_params: Record<string, string>;
  body: string | null;
  body_type: string;
}

export interface ExecutionResult {
  success: boolean;
  status_code: number;
  response_body?: string;
  response_headers?: Record<string, string>;
  response_time_ms?: number;
  error_message?: string;
  executed_at?: string;
}

export interface HistoryItem {
  id: number;
  method: string;
  url: string;
  status_code: number;
  response_time_ms?: number;
  request_body?: string;
  body_type?: string;
  request_headers?: string;
  request_query_params?: string;
  executed_at: string;
}

export interface KeyValuePair {
  key: string;
  value: string;
}
// ─── Scenario Models ───

export interface Scenario {
  id: number;
  collection_id: number;
  user_id?: number;
  name: string;
  natural_language_command: string;
  generated_plan?: any;
  status: "pending" | "planned" | "running" | "passed" | "failed";
  created_at?: string;
  updated_at?: string;
}

export interface ScenarioStep {
  id: number;
  scenario_id: number;
  step_order: number;
  request_id: number | null;
  description?: string;
  request_name?: string;
  request_method?: string;
  request_url?: string;
  actor_name?: string;
  resolved_inputs?: any;
  assertions?: Assertion[];
  status: "pending" | "passed" | "failed" | "error";
  result_snapshot?: StepResult;
  executed_at?: string;
}

export interface Assertion {
  type:
    | "status_success"
    | "status_failure"
    | "status_code"
    | "body_contains"
    | "body_not_contains"
    | "body_empty"
    | "body_not_empty"
    | "body_field_equals"
    | "body_field_exists"
    | "body_field_not_exists"
    | "response_time_below";
  field?: string;
  expected?: string | number;
  passed?: boolean;
  actual?: any;
  error?: string;
}

export interface StepResult {
  status_code?: number;
  response_time_ms?: number;
  response_body?: any;
  success?: boolean;
  assertions?: Assertion[];
  extracted_variables?: Record<string, string>;
  error?: string;
}

export interface AnalyzeRequest {
  collection_id: number;
  natural_language_command: string;
}

export interface AnalyzeResponse {
  scenario: Scenario;
  steps: ScenarioStep[];
}

export interface ScenarioRunResult {
  scenario_id: number;
  status: "passed" | "failed";
  steps: {
    step_id: number;
    step_order: number;
    status: string;
    status_code?: number;
    response_time_ms?: number;
    assertions?: Assertion[];
    extracted_variables?: Record<string, string>;
    used_credentials?: Record<string, string>;
    request_name?: string;
    request_method?: string;
    request_url?: string;
    request_headers?: Record<string, string>;
    request_body?: string | null;
    response_headers?: Record<string, string>;
    response_body?: any;
    actor?: string;
    error?: string;
    heal_attempts?: number;
    evaluator_feedback?: string;
  }[];
}
