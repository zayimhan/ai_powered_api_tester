import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { User, AuthResponse } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private apiUrl = `${environment.apiUrl}/auth`;
    private userSubject = new BehaviorSubject<User | null>(null);
    public user$ = this.userSubject.asObservable();

    constructor(private http: HttpClient) {
        const savedUser = localStorage.getItem('apiflow_user');
        if (savedUser) {
            try {
                this.userSubject.next(JSON.parse(savedUser));
            } catch {
                localStorage.removeItem('apiflow_user');
            }
        }
    }

    get currentUser(): User | null { return this.userSubject.value; }
    get token(): string | null { return localStorage.getItem('apiflow_token'); }
    get isLoggedIn(): boolean { return !!this.token; }

    register(data: { username: string; email: string; password: string }): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/register`, data);
    }

    login(data: { email: string; password: string }): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.apiUrl}/login`, data).pipe(
            tap(res => {
                localStorage.setItem('apiflow_token', res.token);
                localStorage.setItem('apiflow_user', JSON.stringify(res.user));
                this.userSubject.next(res.user);
            })
        );
    }

    logout() {
        localStorage.removeItem('apiflow_token');
        localStorage.removeItem('apiflow_user');
        this.userSubject.next(null);
    }
}
