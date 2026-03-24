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
import { ShortenAddressPipe } from './pipes/shorten-address.pipe';
import { FooterComponent } from './modules/global/footer/footer.component';
import { HomeComponent } from './modules/pages/home/home.component';
import { GasNavComponent } from './modules/global/gas-nav/gas-nav.component';
import { TermsComponent } from './modules/pages/terms/terms.component';
import { PrivacyComponent } from './modules/pages/privacy/privacy.component';
import { LandingComponent } from './modules/pages/landing/landing.component';
import { RegisterComponent } from './modules/pages/register/register.component';
import { LoginComponent } from './modules/pages/login/login.component';
import { AccountSettingsComponent } from './modules/pages/account-settings/account-settings.component';
import { ReferralRankingComponent } from './modules/pages/referral-ranking/referral-ranking.component';
import { ClaimyTokenComponent } from './modules/pages/claimy-token/claimy-token.component';
import { DevelopersPageComponent } from './modules/pages/developers-page/developers-page.component';
import { PlayhouseComponent } from './modules/pages/playhouse/playhouse.component';
import { FlowerpokerComponent } from './modules/pages/flowerpoker/flowerpoker.component';
import { BlackjackComponent } from './modules/pages/blackjack/blackjack.component';
import { DiceComponent } from './modules/pages/dice/dice.component';
import { HiLowComponent } from './modules/pages/hi-low/hi-low.component';
import { WalletDepositModalComponent } from './modules/global/wallet-deposit-modal/wallet-deposit-modal.component';
import { BlankLayoutRouterComponent } from './modules/layouts/blank-layout-router/blank-layout-router.component';
import { MainLayoutRouterComponent } from './modules/layouts/main-layout-router/main-layout-router.component';


@NgModule({
  declarations: [
    AppComponent,
    NavigationComponent,
    ShortenAddressPipe,
    FooterComponent,
    HomeComponent,
    GasNavComponent,
    TermsComponent,
    PrivacyComponent,
    LandingComponent,
    RegisterComponent,
    LoginComponent,
    AccountSettingsComponent,
    ReferralRankingComponent,
    ClaimyTokenComponent,
    DevelopersPageComponent,
    PlayhouseComponent,
    FlowerpokerComponent,
    BlackjackComponent,
    DiceComponent,
    HiLowComponent,
    WalletDepositModalComponent,
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
    MatProgressBarModule,
    MatDialogModule,
    MatTooltipModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
