import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatNumber'
})
export class FormatNumberPipe implements PipeTransform {

  transform(value: number): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Convert the number to a formatted string
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

}
