import { Component } from '@angular/core';
export interface tokenStat {
  title: string;
  value: number;
  dollarValue: string;
}


@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})




export class DashboardComponent {

  tokenStatList: tokenStat[] = [
    {
      title: 'Market Cap',
      value: 1200645,
      dollarValue: 'yes',
    },
    {
      title: 'Total Supply',
      value: 200000000,
      dollarValue: 'yes',
    },
    {
      title: 'Circulating Supply',
      value: 1000000,
      dollarValue: 'yes',
    },
    {
      title: 'Average Staked Amount',
      value: 1000,
      dollarValue: 'yes',
    },
    {
      title: 'Total Stakers',
      value: 422,
      dollarValue: 'no',
    },
    {
      title: '% of Cir. Supply Staked',
      value: 10.22,
      dollarValue: 'no',
    }
  ]

}

