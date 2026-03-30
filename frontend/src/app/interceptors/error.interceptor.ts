import { Injectable } from '@angular/core';
import {
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpInterceptor,
    HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
    constructor(
        private router: Router,
        private authService: AuthService,
        private toastService: ToastService
    ) { }

    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
        return next.handle(request).pipe(
            catchError((error: HttpErrorResponse) => {
                if (error.status === 401 && this.authService.isLoggedIn) {
                    this.authService.logout();
                    this.router.navigate(['/login']);
                    this.toastService.error('Session expired. Please log in again.');
                } else if (error.status === 403) {
                    this.toastService.error('You do not have permission to perform this action.');
                } else if (error.status === 0) {
                    this.toastService.error('Network error. Please check your connection.');
                }
                return throwError(() => error);
            })
        );
    }
}
