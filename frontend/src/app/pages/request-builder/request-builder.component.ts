import { Component, ViewChild, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { HeaderEditorComponent } from './components/header-editor/header-editor.component';
import { BodyEditorComponent } from './components/body-editor/body-editor.component';
import { QueryParamEditorComponent } from './components/query-param-editor/query-param-editor.component';
import { AuthorizationEditorComponent } from './components/authorization-editor/authorization-editor.component';

import { RequestsService } from '../../services/requests.service';
import { CollectionsService } from '../../services/collections.service';
import { ToastService } from '../../services/toast.service';
import { ExecutionResult, HistoryItem } from '../../models/api.models';

@Component({
    selector: 'app-request-builder',
    templateUrl: './request-builder.component.html',
    styleUrls: ['./request-builder.component.css'],
})
export class RequestBuilderComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild(HeaderEditorComponent) headerEditor?: HeaderEditorComponent;
    @ViewChild(BodyEditorComponent) bodyEditor?: BodyEditorComponent;
    @ViewChild(QueryParamEditorComponent) queryEditor?: QueryParamEditorComponent;
    @ViewChild(AuthorizationEditorComponent) authEditor?: AuthorizationEditorComponent;

    response: ExecutionResult | null = null;
    activeTab: 'headers' | 'params' | 'body' | 'auth' = 'headers';
    isLoading = false;
    history: HistoryItem[] = [];
    historyOpen = true;

    loadedRequest: { method: string; url: string; title?: string } | null = null;

    showSaveModal = false;
    saveModalData: { method: string; url: string; title: string } | null = null;

    private destroy$ = new Subject<void>();
    private pendingRequest: any = null;

    constructor(
        private apiService: ApiService,
        private requestsService: RequestsService,
        private collectionsService: CollectionsService,
        private toastService: ToastService
    ) { }

    ngOnInit() {
        this.fetchHistory();

        const state = history.state;
        if (state && state.request) {
            this.pendingRequest = state.request;
        }
    }

    ngAfterViewInit() {
        if (this.pendingRequest) {
            setTimeout(() => {
                this.loadSavedRequest(this.pendingRequest);
                this.pendingRequest = null;
            });
        }
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    fetchHistory() {
        this.apiService.getHistory()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (items) => {
                    this.history = items.sort((a, b) =>
                        new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()
                    );
                },
                error: (err) => {
                    console.error('Failed to load history', err);
                    this.history = [];
                }
            });
    }

    deleteHistoryItem(item: HistoryItem, event: Event) {
        event.stopPropagation();

        this.apiService.deleteHistory(item.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
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

    private buildRequestParts(): { headers: Record<string, string>; params: Record<string, string> } | null {
        if (!this.headerEditor || !this.queryEditor || !this.authEditor) return null;

        const headers: Record<string, string> = {};
        this.headerEditor.headers.forEach(h => { if (h.key) headers[h.key] = h.value; });
        const authHeaders = this.authEditor.getAuthorizationHeader();
        if (authHeaders) Object.assign(headers, authHeaders);

        const params: Record<string, string> = {};
        this.queryEditor.params.forEach(p => { if (p.key) params[p.key] = p.value; });
        const authParams = this.authEditor.getQueryParams();
        if (authParams) Object.assign(params, authParams);

        return { headers, params };
    }

    handleSend(event: { method: string, url: string }) {
        if (!this.bodyEditor) {
            this.toastService.error('Editor components not ready. Please try again.');
            return;
        }
        const parts = this.buildRequestParts();
        if (!parts) {
            this.toastService.error('Editor components not ready. Please try again.');
            return;
        }

        this.isLoading = true;
        this.response = null;

        const { headers, params } = parts;

        const payload = {
            method: event.method,
            url: event.url,
            headers,
            query_params: params,
            body: this.bodyEditor.bodyType.toUpperCase() !== 'NONE' ? this.bodyEditor.rawBody : null,
            body_type: this.bodyEditor.bodyType
        };

        this.apiService.executeRequest(payload)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
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
        if (!this.bodyEditor) {
            this.toastService.error('Editor components not ready. Please try again.');
            return;
        }
        const parts = this.buildRequestParts();
        if (!parts) {
            this.toastService.error('Editor components not ready. Please try again.');
            return;
        }

        const { headers, params } = parts;

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

        this.requestsService.create(requestData)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.toastService.success('Request saved successfully');
                },
                error: () => {
                    this.toastService.error('Failed to save request');
                }
            });
    }

    loadHistoryItem(item: HistoryItem) {
        this.loadedRequest = {
            method: item.method || 'GET',
            url: item.url || ''
        };

        if (item.request_body && item.body_type && this.bodyEditor) {
            this.bodyEditor.bodyType = item.body_type;
            this.bodyEditor.rawBody = item.request_body;
            this.activeTab = 'body';
        }
    }

    loadSavedRequest(req: any) {
        this.loadedRequest = {
            method: req.method || 'GET',
            url: req.url || '',
            title: req.name || req.title || ''
        };

        if (req.body && req.body_type && this.bodyEditor) {
            this.bodyEditor.bodyType = req.body_type;
            this.bodyEditor.rawBody = req.body;
            this.activeTab = 'body';
        }

        if (req.headers && typeof req.headers === 'string' && this.headerEditor) {
            try {
                const h = JSON.parse(req.headers);
                const keys = Object.keys(h);
                if (keys.length > 0) {
                    this.headerEditor.headers = keys.map(k => ({ key: k, value: h[k] }));
                    this.activeTab = 'headers';
                }
            } catch {}
        }

        if (req.query_params && typeof req.query_params === 'string' && this.queryEditor) {
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

    getStatusClass(code: number): string {
        return `status-${Math.floor(code / 100)}xx`;
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
