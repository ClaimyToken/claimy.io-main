import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { MainLayoutRouterComponent } from './modules/layouts/main-layout-router/main-layout-router.component';
import { BlankLayoutRouterComponent } from './modules/layouts/blank-layout-router/blank-layout-router.component';
import { DashboardComponent } from './modules/pages/dashboard/dashboard.component';
import { HomeComponent } from './modules/pages/home/home.component';
import { PrivacyComponent } from './modules/pages/privacy/privacy.component';
import { TermsComponent } from './modules/pages/terms/terms.component';
import { LandingComponent } from './modules/pages/landing/landing.component';
import { SiteStatusGuard } from './services/page-guard.guard';

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
    path: 'dashboard',
    canActivate: [SiteStatusGuard],
    component: DashboardComponent,
    title: "CLAIMY | Dashboard & Statistics"
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
