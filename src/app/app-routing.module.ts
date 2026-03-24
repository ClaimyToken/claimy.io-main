import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { MainLayoutRouterComponent } from './modules/layouts/main-layout-router/main-layout-router.component';
import { BlankLayoutRouterComponent } from './modules/layouts/blank-layout-router/blank-layout-router.component';
import { HomeComponent } from './modules/pages/home/home.component';
import { PrivacyComponent } from './modules/pages/privacy/privacy.component';
import { TermsComponent } from './modules/pages/terms/terms.component';
import { LandingComponent } from './modules/pages/landing/landing.component';
import { SiteStatusGuard } from './services/page-guard.guard';
import { LoginRequiredGuard } from './services/login-required.guard';
import { RegisterComponent } from './modules/pages/register/register.component';
import { LoginComponent } from './modules/pages/login/login.component';
import { AccountSettingsComponent } from './modules/pages/account-settings/account-settings.component';
import { ReferralRankingComponent } from './modules/pages/referral-ranking/referral-ranking.component';
import { ClaimyTokenComponent } from './modules/pages/claimy-token/claimy-token.component';
import { DevelopersPageComponent } from './modules/pages/developers-page/developers-page.component';
import { DevUpdatesComponent } from './modules/pages/dev-updates/dev-updates.component';
import { PlayhouseComponent } from './modules/pages/playhouse/playhouse.component';
import { FlowerpokerComponent } from './modules/pages/flowerpoker/flowerpoker.component';
import { BlackjackComponent } from './modules/pages/blackjack/blackjack.component';
import { DiceComponent } from './modules/pages/dice/dice.component';
import { HiLowComponent } from './modules/pages/hi-low/hi-low.component';

const rootLayoutRoutes: Routes = [
  {
    path: '',
    component: LandingComponent,
    title: "CLAIMY | A New Frontier"
  }
];

const otherLayoutRoutes: Routes = [
  {
    path: 'home',
    canActivate: [SiteStatusGuard],
    component: HomeComponent,
    title: "CLAIMY | A New Frontier"
  },
  {
    path: 'referrals',
    canActivate: [SiteStatusGuard],
    component: ReferralRankingComponent,
    title: "CLAIMY | Referrals"
  },
  {
    path: 'claimy-token',
    canActivate: [SiteStatusGuard],
    component: ClaimyTokenComponent,
    title: "CLAIMY | The Claimy Token"
  },
  {
    path: 'developers',
    component: DevelopersPageComponent,
    title: "CLAIMY | For developers"
  },
  {
    path: 'updates',
    canActivate: [SiteStatusGuard],
    component: DevUpdatesComponent,
    title: "CLAIMY | Product updates"
  },
  {
    path: 'playhouse',
    canActivate: [SiteStatusGuard],
    component: PlayhouseComponent,
    title: "CLAIMY | The Playhouse"
  },
  {
    path: 'flowerpoker',
    canActivate: [SiteStatusGuard, LoginRequiredGuard],
    component: FlowerpokerComponent,
    title: "CLAIMY | Flowerpoker"
  },
  {
    path: 'blackjack',
    canActivate: [SiteStatusGuard, LoginRequiredGuard],
    component: BlackjackComponent,
    title: "CLAIMY | Blackjack"
  },
  {
    path: 'dice',
    canActivate: [SiteStatusGuard, LoginRequiredGuard],
    component: DiceComponent,
    title: "CLAIMY | Dice"
  },
  {
    path: 'hi-low',
    canActivate: [SiteStatusGuard, LoginRequiredGuard],
    component: HiLowComponent,
    title: "CLAIMY | Hi-low"
  },
  {
    path: 'referral-ranking',
    redirectTo: 'referrals',
    pathMatch: 'full'
  },
  {
    path: 'deposit',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'terms',
    component: TermsComponent,
    title: "CLAIMY | Terms"
  },
  {
    path: 'privacy',
    component: PrivacyComponent,
    title: "CLAIMY | Privacy Policy"
  }
  ,
  {
    path: 'register',
    component: RegisterComponent,
    title: "CLAIMY | Register"
  },
  {
    path: 'login',
    component: LoginComponent,
    title: "CLAIMY | Login"
  },
  {
    path: 'account-settings',
    component: AccountSettingsComponent,
    title: "CLAIMY | Account settings"
  }
];


const routes: Routes = [
  {
    path: '',
    component: BlankLayoutRouterComponent,
    children: rootLayoutRoutes
  },
  {
    path: '',
    component: MainLayoutRouterComponent,
    children: otherLayoutRoutes
  }

];

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    RouterModule.forRoot(routes)
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
