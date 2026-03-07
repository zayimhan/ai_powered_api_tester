import { Component, ViewChild, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { HeaderEditorComponent } from './components/header-editor/header-editor.component';
import { BodyEditorComponent } from './components/body-editor/body-editor.component';
import { QueryParamEditorComponent } from './components/query-param-editor/query-param-editor.component';
import { AuthorizationEditorComponent } from './components/authorization-editor/authorization-editor.component';

import { RequestsService } from '../../services/requests.service';
import { CollectionsService } from '../../services/collections.service';
import { ToastService } from '../../services/toast.service';

@Component({
    selector: 'app-request-builder',
    templateUrl: './request-builder.component.html',
    styleUrls: ['./request-builder.component.css'],
})
export class RequestBuilderComponent implements OnInit {
    @ViewChild(HeaderEditorComponent) headerEditor!: HeaderEditorComponent;
    @ViewChild(BodyEditorComponent) bodyEditor!: BodyEditorComponent;
    @ViewChild(QueryParamEditorComponent) queryEditor!: QueryParamEditorComponent;
    @ViewChild(AuthorizationEditorComponent) authEditor!: AuthorizationEditorComponent;

    response: any = null;
    activeTab: 'headers' | 'params' | 'body' | 'auth' = 'headers';
    isLoading = false;
    history: any[] = [];
    historyOpen = true;

    // For loading history items into request form
    loadedRequest: any = null;

    // Save Modal
    showSaveModal = false;
    saveModalData: any = null;

    constructor(
        private apiService: ApiService,
        private requestsService: RequestsService,
        private collectionsService: CollectionsService,
        private toastService: ToastService
    ) { }

    ngOnInit() {
        this.fetchHistory();

        // Check if navigated from collections with a request
        const state = history.state;
        if (state && state.request) {
            // setTimeout ensures view children are ready
            setTimeout(() => {
                this.loadSavedRequest(state.request);
            });
        }
    }

    fetchHistory() {
        this.apiService.getHistory().subscribe({
            next: (history) => {
                this.history = history.sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime());
            },
            error: () => {
                this.history = [];
            }
        });
    }

    deleteHistoryItem(item: any, event: Event) {
        event.stopPropagation(); // prevent loading item
        
        this.apiService.deleteHistory(item.id).subscribe({
            next: () => {
                this.history = this.history.filter(h => h.id !== item.id);
                this.toastService.success('History item deleted');
            },
            error: (err) => {
                console.error('Error deleting history item', err);
                this.toastService.error('Failed to delete history item');
            }
        });
    }

    handleSend(event: { method: string, url: string }) {
        this.isLoading = true;
        this.response = null;

        // Convert array of {key, value} to object
        const headers: { [key: string]: string } = {};
        this.headerEditor.headers.forEach(h => { if (h.key) headers[h.key] = h.value; });

        // Merge Authorization header
        const authHeaders = this.authEditor.getAuthorizationHeader();
        if (authHeaders) {
            Object.assign(headers, authHeaders);
        }

        const params: any = {};
        this.queryEditor.params.forEach(p => { if (p.key) params[p.key] = p.value; });

        // Merge API Key query params if any
        const authParams = this.authEditor.getQueryParams();
        if (authParams) {
            Object.assign(params, authParams);
        }

        const payload = {
            method: event.method,
            url: event.url,
            headers: headers,
            query_params: params,
            body: this.bodyEditor.bodyType.toUpperCase() !== 'NONE' ? this.bodyEditor.rawBody : null,
            body_type: this.bodyEditor.bodyType
        };

        this.apiService.executeRequest(payload).subscribe({
            next: (res) => {
                this.response = res;
                this.isLoading = false;
                this.fetchHistory();
            },
            error: (err) => {
                this.response = {
                    success: false,
                    error_message: err.message,
                    status_code: err.status || 500
                };
                this.isLoading = false;
            }
        });
    }

    handleSave(event: { method: string, url: string, title: string }) {
        this.saveModalData = event;
        this.showSaveModal = true;
    }

    onModalSave(result: { title: string, collectionId: number }) {
        this.showSaveModal = false;
        this.saveToCollection(result.collectionId, { ...this.saveModalData, title: result.title });
    }

    onModalClose() {
        this.showSaveModal = false;
    }

    private saveToCollection(collectionId: number, event: any) {
        const headers: any = {};
        this.headerEditor.headers.forEach(h => { if (h.key) headers[h.key] = h.value; });
        const authHeaders = this.authEditor.getAuthorizationHeader();
        if (authHeaders) Object.assign(headers, authHeaders);

        const params: any = {};
        this.queryEditor.params.forEach(p => { if (p.key) params[p.key] = p.value; });
        const authParams = this.authEditor.getQueryParams();
        if (authParams) Object.assign(params, authParams);

        const requestData = {
            collection_id: collectionId,
            name: event.title,
            method: event.method,
            url: event.url,
            headers: JSON.stringify(headers),
            query_params: JSON.stringify(params),
            body: this.bodyEditor.bodyType.toUpperCase() !== 'NONE' ? this.bodyEditor.rawBody : null,
            body_type: this.bodyEditor.bodyType
        };

        this.requestsService.create(requestData).subscribe({
            next: () => {
                this.toastService.success('Request saved successfully');
            },
            error: () => {
                this.toastService.error('Failed to save request');
            }
        });
    }

    loadHistoryItem(item: any) {
        // Populate request form with history item data
        this.loadedRequest = {
            method: item.method || 'GET',
            url: item.url || ''
        };

        // Load body if available
        if (item.request_body && item.body_type) {
            this.bodyEditor.bodyType = item.body_type;
            this.bodyEditor.rawBody = item.request_body;
            this.activeTab = 'body';
        }
    }

    loadSavedRequest(req: any) {
        // Populate request form
        this.loadedRequest = {
            method: req.method || 'GET',
            url: req.url || '',
            title: req.name || req.title || ''
        };

        // Load body if available
        if (req.body && req.body_type) {
            this.bodyEditor.bodyType = req.body_type;
            this.bodyEditor.rawBody = req.body;
            this.activeTab = 'body';
        }

        // Load headers
        if (req.headers && typeof req.headers === 'string') {
            try {
                const h = JSON.parse(req.headers);
                const keys = Object.keys(h);
                if (keys.length > 0) {
                    this.headerEditor.headers = keys.map(k => ({ key: k, value: h[k] }));
                    this.activeTab = 'headers';
                }
            } catch {}
        }

        // Load query params
        if (req.query_params && typeof req.query_params === 'string') {
            try {
                const p = JSON.parse(req.query_params);
                const keys = Object.keys(p);
                if (keys.length > 0) {
                    this.queryEditor.params = keys.map(k => ({ key: k, value: p[k] }));
                    this.activeTab = 'params';
                }
            } catch {}
        }
    }

    toggleHistory() {
        this.historyOpen = !this.historyOpen;
    }

    getRelativeTime(dateStr: string): string {
        const now = new Date();
        const date = new Date(dateStr);
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    }

    truncateUrl(url: string): string {
        if (!url) return '';
        try {
            const u = new URL(url);
            return u.pathname + u.search;
        } catch {
            return url.length > 50 ? url.substring(0, 50) + '...' : url;
        }
    }
}
