import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class WalletAuthService {
  isLoggedIn = false;

  login() {
    // Your login logic, set isLoggedIn to true
    this.isLoggedIn = true;
  }

  logout() {
    // Your logout logic, set isLoggedIn to false
    this.isLoggedIn = false;
  }
}
