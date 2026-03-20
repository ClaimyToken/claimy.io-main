import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-gas-nav',
  templateUrl: './gas-nav.component.html',
  styleUrls: ['./gas-nav.component.scss']
})
export class GasNavComponent {
  @Input() showEthPrice: boolean = true; // Input property to control visibility

}
