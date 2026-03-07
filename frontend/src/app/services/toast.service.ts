import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ToastMessage {
  type: 'success' | 'error' | 'info';
  text: string;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastSubject = new BehaviorSubject<ToastMessage | null>(null);

  get toast$(): Observable<ToastMessage | null> {
    return this.toastSubject.asObservable();
  }

  success(text: string) {
    this.show({ type: 'success', text });
  }

  error(text: string) {
    this.show({ type: 'error', text });
  }

  info(text: string) {
    this.show({ type: 'info', text });
  }

  private show(message: ToastMessage) {
    this.toastSubject.next(message);
    setTimeout(() => this.hide(), 3000);
  }

  hide() {
    this.toastSubject.next(null);
  }
}
