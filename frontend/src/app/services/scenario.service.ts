import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../environments/environment";
import {
  Scenario,
  ScenarioStep,
  AnalyzeRequest,
  AnalyzeResponse,
  ScenarioRunResult,
} from "../models/api.models";

@Injectable({ providedIn: "root" })
export class ScenarioService {
  private baseUrl = `${environment.apiUrl}/scenarios`;

  constructor(private http: HttpClient) {}

  // ─── CRUD ───
  getAll(): Observable<Scenario[]> {
    return this.http.get<Scenario[]>(this.baseUrl);
  }

  getById(id: number): Observable<Scenario> {
    return this.http.get<Scenario>(`${this.baseUrl}/${id}`);
  }

  create(data: Partial<Scenario>): Observable<Scenario> {
    return this.http.post<Scenario>(this.baseUrl, data);
  }

  update(id: number, data: Partial<Scenario>): Observable<Scenario> {
    return this.http.put<Scenario>(`${this.baseUrl}/${id}`, data);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  getByCollection(collectionId: number): Observable<Scenario[]> {
    return this.http.get<Scenario[]>(
      `${this.baseUrl}/collection/${collectionId}`,
    );
  }

  // ─── Steps ───
  getSteps(scenarioId: number): Observable<ScenarioStep[]> {
    return this.http.get<ScenarioStep[]>(`${this.baseUrl}/${scenarioId}/steps`);
  }

  // ─── AI Agent Actions ───
  analyze(data: AnalyzeRequest): Observable<AnalyzeResponse> {
    return this.http.post<AnalyzeResponse>(`${this.baseUrl}/analyze`, data);
  }

  run(scenarioId: number): Observable<ScenarioRunResult> {
    return this.http.post<ScenarioRunResult>(
      `${this.baseUrl}/${scenarioId}/run`,
      {},
    );
  }

  replan(scenarioId: number): Observable<AnalyzeResponse> {
    return this.http.post<AnalyzeResponse>(
      `${this.baseUrl}/${scenarioId}/replan`,
      {},
    );
  }
}
