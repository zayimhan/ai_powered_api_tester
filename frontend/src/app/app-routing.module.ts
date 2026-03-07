import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { HomeComponent } from './pages/home/home.component';
import { RequestBuilderComponent } from './pages/request-builder/request-builder.component';
import { CollectionsComponent } from './pages/collections/collections.component';
import { ScenarioRunnerComponent } from './pages/scenario-runner/scenario-runner.component';

import { LoginComponent } from './pages/auth/login/login.component';
import { RegisterComponent } from './pages/auth/register/register.component';
import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: 'register', component: RegisterComponent },
    { path: '', component: HomeComponent },
    { path: 'builder', component: RequestBuilderComponent, canActivate: [AuthGuard] },
    { path: 'collections', component: CollectionsComponent, canActivate: [AuthGuard] },
    { path: 'scenario-runner', component: ScenarioRunnerComponent, canActivate: [AuthGuard] },
    { path: '**', redirectTo: '' }
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule { }
