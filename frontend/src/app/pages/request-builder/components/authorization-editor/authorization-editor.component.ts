import { Component } from '@angular/core';

@Component({
    selector: 'app-authorization-editor',
    templateUrl: './authorization-editor.component.html',
    styleUrls: ['./authorization-editor.component.css']
})
export class AuthorizationEditorComponent {
    authType: 'none' | 'bearer' | 'basic' | 'apikey' = 'none';

    // Bearer
    bearerToken: string = '';

    // Basic
    basicUsername = '';
    basicPassword = '';

    // API Key
    apiKey = '';
    apiKeyValue = '';
    apiKeyAddTo: 'header' | 'query' = 'header';

    getAuthorizationHeader(): { [key: string]: string } | null {
        if (this.authType === 'bearer' && this.bearerToken) {
            return { 'Authorization': `Bearer ${this.bearerToken}` };
        }
        if (this.authType === 'basic' && (this.basicUsername || this.basicPassword)) {
            const credentials = btoa(`${this.basicUsername}:${this.basicPassword}`);
            return { 'Authorization': `Basic ${credentials}` };
        }
        if (this.authType === 'apikey' && this.apiKey && this.apiKeyValue && this.apiKeyAddTo === 'header') {
            return { [this.apiKey]: this.apiKeyValue };
        }
        return null;
    }

    getQueryParams(): { [key: string]: string } | null {
        if (this.authType === 'apikey' && this.apiKey && this.apiKeyValue && this.apiKeyAddTo === 'query') {
            return { [this.apiKey]: this.apiKeyValue };
        }
        return null;
    }
}
