import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private baseUrl = 'http://localhost:3000/api';

    constructor(private http: HttpClient) { }

    // POST /api/executions/run
    executeRequest(payload: any): Observable<any> {
        return this.http.post(`${this.baseUrl}/executions/run`, payload);
    }

    // GET /api/executions/history
    getHistory(): Observable<any[]> {
        return this.http.get<any[]>(`${this.baseUrl}/executions/history`);
    }

    // DELETE /api/executions/history/:id
    deleteHistory(id: number): Observable<any> {
        return this.http.delete<any>(`${this.baseUrl}/executions/history/${id}`);
    }
}
