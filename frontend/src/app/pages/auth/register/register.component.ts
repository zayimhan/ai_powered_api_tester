import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-register',
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <h2>Create Account</h2>
        <p class="subtitle">Join APIFlow to sync your requests</p>
        
        <form (submit)="onRegister($event)">
          <div class="form-group">
            <label>Username</label>
            <input type="text" name="username" [(ngModel)]="username" placeholder="johndoe" required>
          </div>

          <div class="form-group">
            <label>Email Address</label>
            <input type="email" name="email" [(ngModel)]="email" placeholder="email@example.com" required>
          </div>
          
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="password" [(ngModel)]="password" placeholder="••••••••" required>
          </div>
          
          <div class="error-msg" *ngIf="error">{{ error }}</div>
          <div class="success-msg" *ngIf="success">Account created! Redirecting to login...</div>
          
          <button type="submit" class="btn-primary" [disabled]="loading || success">
            {{ loading ? 'Registering...' : 'Register' }}
          </button>
        </form>
        
        <div class="auth-footer">
          Already have an account? <a routerLink="/login">Login</a>
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
    .success-msg { color: #238636; font-size: 0.85rem; margin-bottom: 1rem; }
    .auth-footer { margin-top: 2rem; text-align: center; color: #8b949e; font-size: 0.85rem; }
    .auth-footer a { color: #58a6ff; text-decoration: none; font-weight: 500; }
  `]
})
export class RegisterComponent {
  username = '';
  email = '';
  password = '';
  loading = false;
  error = '';
  success = false;

  constructor(private authService: AuthService, private router: Router) { }

  onRegister(event: Event) {
    event.preventDefault();
    this.loading = true;
    this.error = '';

    this.authService.register({
      username: this.username,
      email: this.email,
      password: this.password
    }).subscribe({
      next: () => {
        this.success = true;
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: (err) => {
        this.error = err.error?.error || 'Registration failed';
        this.loading = false;
      }
    });
  }
}
