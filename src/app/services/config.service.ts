import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {

  getSiteStatus(): string {
    return 'offline'; // Online or Offline to disable pages + landing page button
  }

  siteName: string = 'CLAIMY';
  siteLink: string = 'claimy-project.io';

  TokenContractAddress: string = '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF';
  RewardsContractAddress: string = '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF';

  twitterName: string = 'claimyproject';
  twitterLink: string = `https://x.com/${this.twitterName}`;
  telegramName: string = 'claimyproject';
  telegramLink: string = `https://t.me/${this.telegramName}`;
  githubName: string = 'ClaimyToken';
  githubLink: string = `https://github.com/${this.githubName}/Claimy-Project`;
  coinmarketcapLink: string = 'https://coinmarketcap.com/currencies/solana/';
  coingeckoLink: string = 'https://www.coingecko.com/en/coins/solana';

  constructor() { }
}
