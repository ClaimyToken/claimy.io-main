import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencyFormat'
})
export class CurrencyFormatPipe implements PipeTransform {

  transform(value: number): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Format the number as currency
    return `$${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }

}
