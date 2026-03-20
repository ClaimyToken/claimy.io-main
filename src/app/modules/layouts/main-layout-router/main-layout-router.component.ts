import { Component } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';

@Component({
  selector: 'app-main-layout-router',
  templateUrl: './main-layout-router.component.html',
  styleUrls: ['./main-layout-router.component.scss']
})
export class MainLayoutRouterComponent {
  constructor(public configService: ConfigService) { }
}
