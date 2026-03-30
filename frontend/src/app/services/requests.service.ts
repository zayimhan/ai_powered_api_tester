import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SavedRequest } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class RequestsService {
    private baseUrl = `${environment.apiUrl}/requests`;

    constructor(private http: HttpClient) { }

    getAll(): Observable<SavedRequest[]> { return this.http.get<SavedRequest[]>(this.baseUrl); }
    getById(id: number): Observable<SavedRequest> { return this.http.get<SavedRequest>(`${this.baseUrl}/${id}`); }
    create(data: Omit<SavedRequest, 'id' | 'created_at'>): Observable<SavedRequest> { return this.http.post<SavedRequest>(this.baseUrl, data); }
    update(id: number, data: Partial<SavedRequest>): Observable<SavedRequest> { return this.http.put<SavedRequest>(`${this.baseUrl}/${id}`, data); }
    delete(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/${id}`); }
}
