import { Component } from '@angular/core';
import { ChartConfiguration, ChartType } from 'chart.js';


@Component({
  selector: 'app-total-value-chart',
  templateUrl: './total-value-chart.component.html',
  styleUrls: ['./total-value-chart.component.scss']
})

export class TotalValueChartComponent {

  public lineChartData: ChartConfiguration['data'] = {
    datasets: [
      {
        data: [0.00005, 0.000062, 0.000068, 0.000072, 0.000062, 0.000068, 0.00008, 0.000085, 0.000102, 0.000155, 0.000250, 0.000320],
        label: '$CLAIMY Price',
        yAxisID: 'y1',
        backgroundColor: 'rgba(255, 153, 0, 0.65)',
        borderColor: 'rgba(255, 153, 0, 0.65)',
        pointBackgroundColor: 'rgba(255, 153, 0, 1)',
        pointBorderColor: 'rgba(255, 153, 0, 1)',
        pointHoverBackgroundColor: '#0a0707',
        pointHoverBorderColor: 'rgba(255, 153, 0, 0.65)',

      },
      {
        data: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200],
        label: 'Total Value (USD)',
        backgroundColor: 'rgba(249, 65, 65, 0.65)',
        borderColor: 'rgba(249, 65, 65, 0.65)',
        pointBackgroundColor: 'rgba(249, 65, 65, 1)',
        pointBorderColor: 'rgba(249, 65, 65, 1)',
        pointHoverBackgroundColor: '#0a0707',
        pointHoverBorderColor: 'rgba(249, 65, 65, 0.65)',

      },
    ],
    labels: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],

  };
  public lineChartOptions: ChartConfiguration['options'] = {
    elements: {
      line: {
        tension: 0.25,
      },
    },
    scales: {
      // We use this empty structure as a placeholder for dynamic theming.
      y: {
        position: 'left',
        ticks: {
          color: 'rgba(249, 65, 65, 0.5)',
        }
      },
      y1: {
        position: 'right',
        grid: {
          color: '#352D2D',
        },
        ticks: {
          color: 'rgba(255, 153, 0, 0.5)',
        },
      },
    },

    plugins: {
      legend: { display: true },
    },
  };

  public lineChartType: ChartType = 'line';
}