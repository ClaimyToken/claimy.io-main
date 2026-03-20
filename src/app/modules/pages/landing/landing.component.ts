import { Component } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent {

  constructor(public configService: ConfigService) { }

  getSiteStatus(): string {
    return this.configService.getSiteStatus();
  }

  currentYear: number = new Date().getFullYear();
}
