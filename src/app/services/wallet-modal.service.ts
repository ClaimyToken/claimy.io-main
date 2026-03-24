import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Opens the global “Your Wallet” (deposit) modal from anywhere (e.g. account settings). */
@Injectable({
  providedIn: 'root'
})
export class WalletModalService {
  private readonly openRequest = new Subject<void>();
  readonly openRequested$ = this.openRequest.asObservable();

  requestOpen(): void {
    this.openRequest.next();
  }
}
