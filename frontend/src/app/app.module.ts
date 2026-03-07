import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';

import { NavbarComponent } from './components/navbar/navbar.component';
import { HomeComponent } from './pages/home/home.component';
import { RequestBuilderComponent } from './pages/request-builder/request-builder.component';
import { RequestFormComponent } from './pages/request-builder/components/request-form/request-form.component';
import { HeaderEditorComponent } from './pages/request-builder/components/header-editor/header-editor.component';
import { QueryParamEditorComponent } from './pages/request-builder/components/query-param-editor/query-param-editor.component';
import { BodyEditorComponent } from './pages/request-builder/components/body-editor/body-editor.component';
import { ResponseViewerComponent } from './pages/request-builder/components/response-viewer/response-viewer.component';
import { CollectionsComponent } from './pages/collections/collections.component';
import { CollectionListComponent } from './pages/collections/components/collection-list/collection-list.component';
import { RequestListComponent } from './pages/collections/components/request-list/request-list.component';
import { SavedRequestDetailComponent } from './pages/collections/components/saved-request-detail/saved-request-detail.component';
import { ScenarioRunnerComponent } from './pages/scenario-runner/scenario-runner.component';
import { LoginComponent } from './pages/auth/login/login.component';
import { RegisterComponent } from './pages/auth/register/register.component';
import { AuthorizationEditorComponent } from './pages/request-builder/components/authorization-editor/authorization-editor.component';
import { SaveRequestModalComponent } from './pages/request-builder/components/save-request-modal/save-request-modal.component';
import { ToastComponent } from './components/toast/toast.component';

@NgModule({
    declarations: [
        AppComponent,
        NavbarComponent,
        HomeComponent,
        RequestBuilderComponent,
        RequestFormComponent,
        HeaderEditorComponent,
        QueryParamEditorComponent,
        BodyEditorComponent,
        ResponseViewerComponent,
        CollectionsComponent,
        CollectionListComponent,
        RequestListComponent,
        SavedRequestDetailComponent,
        ScenarioRunnerComponent,
        LoginComponent,
        RegisterComponent,
        AuthorizationEditorComponent,
        SaveRequestModalComponent,
        ToastComponent
    ],
    imports: [
        BrowserModule,
        HttpClientModule,
        FormsModule,
        ReactiveFormsModule,
        AppRoutingModule,
    ],
    providers: [
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
    ],
    bootstrap: [AppComponent],
})
export class AppModule { }
