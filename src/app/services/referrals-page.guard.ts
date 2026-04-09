import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { ConfigService } from './config.service';

/** When referrals are disabled in config, `/referrals` is not reachable (redirect to home). */
@Injectable({
  providedIn: 'root'
})
export class ReferralsPageGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly router: Router
  ) {}

  canActivate(): boolean {
    if (this.config.referralsPageEnabled) {
      return true;
    }
    void this.router.navigate(['/home']);
    return false;
  }
}
