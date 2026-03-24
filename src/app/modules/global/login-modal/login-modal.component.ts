import { Component, HostListener } from '@angular/core';
import { LoginModalService } from 'src/app/services/login-modal.service';

@Component({
  selector: 'app-login-modal',
  templateUrl: './login-modal.component.html',
  styleUrls: ['./login-modal.component.scss']
})
export class LoginModalComponent {
  readonly isOpen$ = this.loginModal.isOpen$;

  constructor(private readonly loginModal: LoginModalService) {}

  close(): void {
    this.loginModal.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.loginModal.isOpen) {
      this.loginModal.close();
    }
  }
}
