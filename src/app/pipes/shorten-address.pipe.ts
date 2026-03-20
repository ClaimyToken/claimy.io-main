import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'shortenAddress'
})
export class ShortenAddressPipe implements PipeTransform {

  transform(value: string): string {
    if (!value) {
      return '';
    }

    const prefixLength = 5;
    const suffixLength = 5;

    const prefix = value.substring(0, prefixLength);
    const suffix = value.substring(value.length - suffixLength);

    return `${prefix}...${suffix}`;
  }

}
