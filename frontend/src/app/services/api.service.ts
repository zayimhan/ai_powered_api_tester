import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ExecutionPayload, ExecutionResult, HistoryItem } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private baseUrl = environment.apiUrl;

    constructor(private http: HttpClient) { }

    executeRequest(payload: ExecutionPayload): Observable<ExecutionResult> {
        return this.http.post<ExecutionResult>(`${this.baseUrl}/executions/run`, payload);
    }

    getHistory(): Observable<HistoryItem[]> {
        return this.http.get<HistoryItem[]>(`${this.baseUrl}/executions/history`);
    }

    deleteHistory(id: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/executions/history/${id}`);
    }
}
