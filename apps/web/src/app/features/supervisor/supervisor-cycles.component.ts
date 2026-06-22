import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  SupervisorCycle,
  SupervisorService,
} from '../../core/supervisor.service';

@Component({
  selector: 'app-supervisor-cycles',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  template: `
    <div class="min-h-screen bg-ink-50">
      <header class="bg-white border-b border-ink-200 px-6 py-3 flex items-center justify-between">
        <a routerLink="/supervisor/clients" class="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900">
          ← Back to clients
        </a>
        <button class="text-xs text-ink-500 hover:text-ink-900" (click)="logout()">
          Sign out
        </button>
      </header>

      <main class="max-w-3xl mx-auto px-4 py-6">
        <h2 class="text-lg font-bold text-ink-900 mb-1">Cycles with activity</h2>
        <p class="text-xs text-ink-500 mb-4">
          Cycles that have tasks or a saved report. Empty periods are hidden.
        </p>

        @if (loading()) {
          <div class="card py-10 text-center text-ink-400 italic text-sm">Loading…</div>
        } @else if (!cycles().length) {
          <div class="card py-10 text-center text-ink-400 italic text-sm">
            No cycles with activity yet for this client.
          </div>
        } @else {
          <div class="space-y-2">
            @for (c of cycles(); track c._id) {
              <a [routerLink]="['/supervisor', 'clients', clientId(), 'cycles', c._id]"
                 class="card p-4 flex items-center justify-between hover:shadow-elevated transition">
                <div>
                  <div class="font-semibold text-ink-900">{{ c.label }}</div>
                  <div class="text-[11px] text-ink-500">
                    {{ c.startDate | date: 'mediumDate' }} → {{ c.endDate | date: 'mediumDate' }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="badge-neutral capitalize">{{ c.status }}</span>
                  <span class="text-brand-500 text-sm">→</span>
                </div>
              </a>
            }
          </div>
        }
      </main>
    </div>
  `,
})
export class SupervisorCyclesComponent implements OnInit {
  private svc = inject(SupervisorService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  clientId = signal<string>('');
  cycles = signal<SupervisorCycle[]>([]);
  loading = signal(true);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('clientId');
    if (!id) {
      this.router.navigate(['/supervisor/clients']);
      return;
    }
    this.clientId.set(id);
    this.svc.listCycles(id).subscribe({
      next: (cs) => {
        this.cycles.set(cs);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.svc.logout();
        this.router.navigate(['/supervisor']);
      },
    });
  }

  logout() {
    this.svc.logout();
    this.router.navigate(['/supervisor']);
  }
}
