import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { ConfigService } from './config.service';

/** When the dev blog is disabled in config, `/updates` redirects to home. */
@Injectable({
  providedIn: 'root'
})
export class DevBlogPageGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly router: Router
  ) {}

  canActivate(): boolean {
    if (this.config.devBlogPageEnabled) {
      return true;
    }
    void this.router.navigate(['/home']);
    return false;
  }
}
