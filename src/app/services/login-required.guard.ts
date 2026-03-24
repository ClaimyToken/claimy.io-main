import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { WalletAuthService } from './wallet-auth.service';

@Injectable({
  providedIn: 'root'
})
export class LoginRequiredGuard implements CanActivate {
  constructor(
    private readonly walletAuth: WalletAuthService,
    private readonly router: Router
  ) {}

  canActivate(): boolean | UrlTree {
    if (this.walletAuth.isLoggedIn) {
      return true;
    }
    return this.router.createUrlTree(['/login']);
  }
}
