import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ConnectWalletPopupComponent } from '../connect-wallet-popup/connect-wallet-popup.component';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';


export interface ClaimyHoldings {
  tokens: string;
  purchasedDate: string;
  purchasedURL: string;
  claimDate: string;
  claimAmount: number;
  claimStatus: string;
}

const ELEMENT_DATA: ClaimyHoldings[] = [
  { purchasedDate: "2024-02-01 13:44:21", purchasedURL: "https://etherscan.io/tx/0xf2d630c40e78520fa27ba9801c137c4aadcfbe815ecad655e4d82a9fb9bfe662", tokens: '235520', claimDate: "2024-02-01 13:44:21", claimAmount: 560000, claimStatus: 'false' },
  { purchasedDate: "2024-02-01 13:44:21", purchasedURL: "https://etherscan.io/tx/0xf2d630c40e78520fa27ba9801c137c4aadcfbe815ecad655e4d82a9fb9bfe662", tokens: '1200', claimDate: "2024-02-01 15:44:21", claimAmount: 560000, claimStatus: 'true' },
  { purchasedDate: "2024-02-01 13:44:21", purchasedURL: "https://etherscan.io/tx/0xf2d630c40e78520fa27ba9801c137c4aadcfbe815ecad655e4d82a9fb9bfe662", tokens: '35111', claimDate: "2024-02-03 13:44:21", claimAmount: 560000, claimStatus: 'false' },

];

@Component({
  selector: 'app-holdings',
  templateUrl: './holdings.component.html',
  styleUrls: ['./holdings.component.scss']
})
export class HoldingsComponent {

  displayedColumns: string[] = ['purchasedDate', 'tokens', 'claimDate', 'claimAmount', 'claimStatus'];
  dataSource = ELEMENT_DATA;

  constructor(public dialog: MatDialog, public authWalletService: WalletAuthService) { }

  login() {
    this.authWalletService.login();
  }

  logout() {
    this.authWalletService.logout();
  }

  openDialog() {
    this.dialog.open(ConnectWalletPopupComponent, {
      minWidth: '340px',
      maxWidth: '440px',
      enterAnimationDuration: '300ms',
      exitAnimationDuration: '0ms',
      panelClass: 'c-popup',
    });
  }

  getTimeUntilClaim(element: ClaimyHoldings): string {
    const claimDate = new Date(element.claimDate);
    const currentTime = new Date();

    if (claimDate > currentTime) {
      const timeDifference = claimDate.getTime() - currentTime.getTime();

      const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
      const hoursDifference = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutesDifference = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));

      if (daysDifference > 1) {
        return `Claim in ${daysDifference} D, ${hoursDifference} H`;
      } else if (hoursDifference > 2) {
        return `Claim in ${hoursDifference} H, ${minutesDifference} M`;
      } else {
        return `Claim in ${minutesDifference} mins`;
      }
    } else {
      return 'Claim date has passed';
    }
  }
}
