import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { ReportsService } from '../../../core/reports.service';

Chart.register(...registerables);

type Snapshot = { cycleLabel?: string; generatedAt: string; kpis: any };

@Component({
  selector: 'app-client-kpi-history-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-navy-700">KPI trend</h2>
          <select class="input w-56" [(ngModel)]="selectedMetric" (change)="render()">
            @for (m of metrics; track m.key) {
              <option [value]="m.key">{{ m.label }}</option>
            }
          </select>
        </div>
        @if (snapshots().length >= 2) {
          <canvas #chartCanvas></canvas>
        } @else {
          <p class="text-sm text-slate-400 italic text-center py-8">
            You need at least 2 saved reports with KPIs to see the trend.
            <br />You have {{ snapshots().length }} report(s).
          </p>
        }
      </div>

      <div class="card overflow-hidden p-0">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th class="px-4 py-2 text-left">Cycle</th>
              @for (m of metrics; track m.key) {
                <th class="px-3 py-2 text-right">{{ m.short }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (s of snapshots(); track s.generatedAt) {
              <tr class="border-b border-slate-100">
                <td class="px-4 py-2 font-medium text-navy-700">{{ s.cycleLabel || '—' }}</td>
                @for (m of metrics; track m.key) {
                  <td class="px-3 py-2 text-right">{{ s.kpis?.[m.key] ?? '—' }}</td>
                }
              </tr>
            }
            @if (!snapshots().length) {
              <tr>
                <td [attr.colspan]="metrics.length + 1" class="px-4 py-8 text-center text-slate-400 italic">
                  No saved reports yet.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ClientKpiHistoryTab implements OnChanges, AfterViewInit {
  @Input({ required: true }) clientId!: string;
  @ViewChild('chartCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;
  private svc = inject(ReportsService);
  private chart?: Chart;

  snapshots = signal<Snapshot[]>([]);
  selectedMetric = 'clicks';

  metrics: Array<{ key: string; label: string; short: string }> = [
    { key: 'organicSessions', label: 'Organic sessions', short: 'Sessions' },
    { key: 'impressions', label: 'Impressions (GSC)', short: 'Impr.' },
    { key: 'clicks', label: 'Clicks (GSC)', short: 'Clicks' },
    { key: 'ctr', label: 'CTR (%)', short: 'CTR' },
    { key: 'avgPosition', label: 'Avg position', short: 'Pos.' },
    { key: 'conversions', label: 'Conversions', short: 'Conv.' },
  ];

  ngOnChanges() {
    this.load();
  }

  ngAfterViewInit() {
    if (this.snapshots().length >= 2) this.render();
  }

  load() {
    this.svc.kpiHistory(this.clientId, 12).subscribe((data) => {
      this.snapshots.set(data);
      setTimeout(() => this.render(), 0);
    });
  }

  render() {
    if (!this.canvasRef) return;
    const data = this.snapshots();
    if (data.length < 2) {
      this.chart?.destroy();
      this.chart = undefined;
      return;
    }
    const labels = data.map((s) => s.cycleLabel || '—');
    const values = data.map((s) => s.kpis?.[this.selectedMetric] ?? null);
    this.chart?.destroy();
    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: this.metrics.find((m) => m.key === this.selectedMetric)?.label || '',
            data: values,
            borderColor: '#0B2545',
            backgroundColor: 'rgba(11, 37, 69, 0.1)',
            tension: 0.3,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: '#1B998B',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 3,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: false } },
      },
    });
  }
}
