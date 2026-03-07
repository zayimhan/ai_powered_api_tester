import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private apiUrl = `${environment.apiUrl}/auth`;
    private userSubject = new BehaviorSubject<any>(null);
    public user$ = this.userSubject.asObservable();

    constructor(private http: HttpClient) {
        const savedUser = localStorage.getItem('apiflow_user');
        if (savedUser) {
            this.userSubject.next(JSON.parse(savedUser));
        }
    }

    get currentUser() { return this.userSubject.value; }
    get token() { return localStorage.getItem('apiflow_token'); }
    get isLoggedIn() { return !!this.token; }

    register(data: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/register`, data);
    }

    login(data: any): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/login`, data).pipe(
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
