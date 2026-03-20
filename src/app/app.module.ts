import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { NgxTypedJsModule } from 'ngx-typed-js';

import { NavigationComponent } from './modules/global/navigation/navigation.component';
import { DashboardComponent } from './modules/pages/dashboard/dashboard.component';
import { ShortenAddressPipe } from './pipes/shorten-address.pipe';
import { FormatNumberPipe } from './pipes/format-number.pipe';
import { CurrencyFormatPipe } from './pipes/currency-format.pipe';
import { NgChartsModule } from 'ng2-charts';
import { FooterComponent } from './modules/global/footer/footer.component';
import { HomeComponent } from './modules/pages/home/home.component';
import { SocialsComponent } from './modules/global/socials/socials.component';
import { TotalValueChartComponent } from './modules/dashboard-sections/total-value-chart/total-value-chart.component';
import { GasNavComponent } from './modules/global/gas-nav/gas-nav.component';
import { TokenStatsComponent } from './modules/dashboard-sections/token-stats/token-stats.component';
import { CalculatorComponent } from './modules/dashboard-sections/calculator/calculator.component';
import { HoldingsComponent } from './modules/dashboard-sections/holdings/holdings.component';
import { MintNftComponent } from './modules/dashboard-sections/mint-nft/mint-nft.component';
import { MintNftPopupComponent } from './modules/dashboard-sections/mint-nft-popup/mint-nft-popup.component';
import { ConnectWalletPopupComponent } from './modules/dashboard-sections/connect-wallet-popup/connect-wallet-popup.component';
import { TermsComponent } from './modules/pages/terms/terms.component';
import { PrivacyComponent } from './modules/pages/privacy/privacy.component';
import { LandingComponent } from './modules/pages/landing/landing.component';
import { BlankLayoutRouterComponent } from './modules/layouts/blank-layout-router/blank-layout-router.component';
import { MainLayoutRouterComponent } from './modules/layouts/main-layout-router/main-layout-router.component';


@NgModule({
  declarations: [
    AppComponent,
    NavigationComponent,
    DashboardComponent,
    ShortenAddressPipe,
    FormatNumberPipe,
    CurrencyFormatPipe,
    TotalValueChartComponent,
    FooterComponent,
    HomeComponent,
    SocialsComponent,
    GasNavComponent,
    TokenStatsComponent,
    CalculatorComponent,
    HoldingsComponent,
    MintNftComponent,
    MintNftPopupComponent,
    ConnectWalletPopupComponent,
    TermsComponent,
    PrivacyComponent,
    LandingComponent,
    BlankLayoutRouterComponent,
    MainLayoutRouterComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MatTabsModule,
    MatTableModule,
    MatMenuModule,
    MatIconModule,
    MatButtonModule,
    MatPaginatorModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    NgxTypedJsModule,
    ClipboardModule,
    NgChartsModule,
    MatProgressBarModule,
    MatDialogModule,
    MatTooltipModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
