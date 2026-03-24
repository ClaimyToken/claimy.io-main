import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { LoginModalService } from './login-modal.service';
import { WalletAuthService } from './wallet-auth.service';

@Injectable({
  providedIn: 'root'
})
export class LoginRequiredGuard implements CanActivate {
  constructor(
    private readonly walletAuth: WalletAuthService,
    private readonly router: Router,
    private readonly loginModal: LoginModalService
  ) {}

  canActivate(_route: unknown, state: RouterStateSnapshot): boolean | UrlTree {
    if (this.walletAuth.isLoggedIn) {
      return true;
    }
    this.loginModal.open({ returnUrl: state.url });
    const nav = this.router.getCurrentNavigation();
    if (nav?.id === 1) {
      return this.router.parseUrl('/home');
    }
    return false;
  }
}
