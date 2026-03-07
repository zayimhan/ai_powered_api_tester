import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <h2>Welcome Back</h2>
        <p class="subtitle">Login to your APIFlow account</p>
        
        <form (submit)="onLogin($event)">
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" name="email" [(ngModel)]="email" placeholder="email@example.com" required>
          </div>
          
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="password" [(ngModel)]="password" placeholder="••••••••" required>
          </div>
          
          <div class="error-msg" *ngIf="error">{{ error }}</div>
          
          <button type="submit" class="btn-primary" [disabled]="loading">
            {{ loading ? 'Logging in...' : 'Login' }}
          </button>
        </form>
        
        <div class="auth-footer">
          Don't have an account? <a routerLink="/register">Register</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-container { display: flex; align-items: center; justify-content: center; min-height: 80vh; }
    .auth-card { background: #1a1e24; padding: 2.5rem; border-radius: 12px; width: 100%; max-width: 400px; border: 1px solid #30363d; }
    h2 { margin: 0; color: #fff; font-size: 1.5rem; }
    .subtitle { color: #8b949e; margin-bottom: 2rem; font-size: 0.9rem; }
    .form-group { margin-bottom: 1.5rem; }
    label { display: block; color: #c9d1d9; margin-bottom: 0.5rem; font-size: 0.85rem; }
    input { width: 100%; background: #0d1117; border: 1px solid #30363d; padding: 0.8rem; border-radius: 6px; color: #fff; box-sizing: border-box; }
    .btn-primary { width: 100%; padding: 0.8rem; background: #238636; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 1rem; }
    .btn-primary:hover { background: #2ea043; }
    .error-msg { color: #f85149; font-size: 0.85rem; margin-bottom: 1rem; }
    .auth-footer { margin-top: 2rem; text-align: center; color: #8b949e; font-size: 0.85rem; }
    .auth-footer a { color: #58a6ff; text-decoration: none; font-weight: 500; }
  `]
})
export class LoginComponent {
  email = '';
  password = '';
  loading = false;
  error = '';

  constructor(private authService: AuthService, private router: Router) { }

  onLogin(event: Event) {
    event.preventDefault();
    this.loading = true;
    this.error = '';

    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: () => this.router.navigate(['/builder']),
      error: (err) => {
        this.error = err.error?.error || 'Login failed';
        this.loading = false;
      }
    });
  }
}
