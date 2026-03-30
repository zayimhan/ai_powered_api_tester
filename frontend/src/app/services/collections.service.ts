import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Collection, SavedRequest } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class CollectionsService {
    private baseUrl = `${environment.apiUrl}/collections`;

    constructor(private http: HttpClient) { }

    getAll(): Observable<Collection[]> { return this.http.get<Collection[]>(this.baseUrl); }
    getById(id: number): Observable<Collection> { return this.http.get<Collection>(`${this.baseUrl}/${id}`); }
    create(data: Pick<Collection, 'name'>): Observable<Collection> { return this.http.post<Collection>(this.baseUrl, data); }
    update(id: number, data: Partial<Collection>): Observable<Collection> { return this.http.put<Collection>(`${this.baseUrl}/${id}`, data); }
    delete(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/${id}`); }
    getRequests(id: number): Observable<SavedRequest[]> { return this.http.get<SavedRequest[]>(`${this.baseUrl}/${id}/requests`); }
}
