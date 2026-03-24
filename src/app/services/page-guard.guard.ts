import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { ConfigService } from './config.service';


@Injectable({
  providedIn: 'root'
})
export class SiteStatusGuard implements CanActivate {
  constructor(private configService: ConfigService, private router: Router) { }

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    const siteStatus = this.configService.getSiteStatus();

    // Check if the site is offline and block access to certain pages
    if (siteStatus === 'offline' && this.isBlockedRoute(state.url)) {
      this.router.navigate(['']);
      return false;
    }

    return true;
  }

  private isBlockedRoute(url: string): boolean {
    const blockedRoutes = ['/home', '/referrals', '/claimy-token', '/playhouse', '/flowerpoker', '/blackjack', '/dice', '/hi-low'];

    return blockedRoutes.includes(url);
  }
}
