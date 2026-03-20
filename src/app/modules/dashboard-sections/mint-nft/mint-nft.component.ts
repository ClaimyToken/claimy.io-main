import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { MintNftPopupComponent } from '../mint-nft-popup/mint-nft-popup.component';

@Component({
  selector: 'app-mint-nft',
  templateUrl: './mint-nft.component.html',
  styleUrls: ['./mint-nft.component.scss']
})
export class MintNftComponent {
  constructor(public dialog: MatDialog) { }

  openDialog() {
    this.dialog.open(MintNftPopupComponent, {
      minWidth: '420px',
      maxHeight: '480px',
      enterAnimationDuration: '300ms',
      exitAnimationDuration: '0ms',
      panelClass: 'c-popup',
    });
  }
}
