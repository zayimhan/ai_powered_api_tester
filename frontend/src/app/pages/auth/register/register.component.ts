import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
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
