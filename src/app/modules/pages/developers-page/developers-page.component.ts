import { AfterViewInit, Component } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';

@Component({
  selector: 'app-developers-page',
  templateUrl: './developers-page.component.html',
  styleUrls: ['./developers-page.component.scss']
})
export class DevelopersPageComponent implements AfterViewInit {
  constructor(public readonly config: ConfigService) {}

  ngAfterViewInit(): void {
    const hash = window.location.hash?.replace(/^#/, '');
    if (hash) {
      queueMicrotask(() => this.scrollToSection(hash));
    }
  }

  /** TOC and deep links: smooth scroll; initial hash uses instant scroll so layout is stable. */
  scrollToSection(id: string, event?: Event): void {
    event?.preventDefault();
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.scrollIntoView({ behavior: event ? 'smooth' : 'auto', block: 'start' });
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      /* ignore */
    }
  }
}
