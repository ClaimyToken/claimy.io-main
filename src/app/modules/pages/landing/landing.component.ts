import { Component } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent {

  constructor(public configService: ConfigService) { }

  currentYear: number = new Date().getFullYear();

  /** Compact label for the GitHub card (full URL on hover via title on the link). */
  get githubRepoPath(): string {
    return this.configService.githubLink.replace(/^https?:\/\/github\.com\//i, '');
  }
}
