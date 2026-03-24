import { Component } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';

@Component({
  selector: 'app-developers-page',
  templateUrl: './developers-page.component.html',
  styleUrls: ['./developers-page.component.scss']
})
export class DevelopersPageComponent {
  constructor(public readonly config: ConfigService) {}
}
