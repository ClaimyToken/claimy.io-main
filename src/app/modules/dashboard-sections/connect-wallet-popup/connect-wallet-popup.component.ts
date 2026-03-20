import { Component } from '@angular/core';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';

@Component({
  selector: 'app-connect-wallet-popup',
  templateUrl: './connect-wallet-popup.component.html',
  styleUrls: ['./connect-wallet-popup.component.scss']
})
export class ConnectWalletPopupComponent {
  constructor(public authWalletService: WalletAuthService) { }

  login() {
    this.authWalletService.login();
  }
}
