import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

/**
 * Global Phantom login UI: open a modal from any page; optional post-login redirect (e.g. guarded route).
 */
@Injectable({
  providedIn: 'root'
})
export class LoginModalService {
  private readonly openSubject = new BehaviorSubject(false);
  readonly isOpen$ = this.openSubject.asObservable();

  private returnUrl: string | null = null;

  constructor(private readonly router: Router) {}

  get isOpen(): boolean {
    return this.openSubject.value;
  }

  open(options?: { returnUrl?: string | null }) {
    const raw = options?.returnUrl?.trim();
    this.returnUrl = raw && raw.length > 0 ? raw : null;
    this.openSubject.next(true);
  }

  close() {
    this.openSubject.next(false);
    this.returnUrl = null;
  }

  /** Call after successful wallet-login when the user signed in from the modal. */
  onLoginSuccess() {
    const target = this.returnUrl;
    this.close();
    if (target) {
      void this.router.navigateByUrl(target);
    }
  }
}
