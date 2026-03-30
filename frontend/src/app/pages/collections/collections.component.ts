import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CollectionsService } from '../../services/collections.service';
import { RequestsService } from '../../services/requests.service';
import { Router } from '@angular/router';
import { ToastService } from '../../services/toast.service';
import { Collection, SavedRequest } from '../../models/api.models';

@Component({
    selector: 'app-collections',
    templateUrl: './collections.component.html',
    styleUrls: ['./collections.component.css'],
})
export class CollectionsComponent implements OnInit, OnDestroy {
    collections: Collection[] = [];
    selectedCollection: Collection | null = null;
    requests: SavedRequest[] = [];
    selectedRequest: SavedRequest | null = null;

    showNewCollection = false;
    newCollectionName = '';

    editingRequestId: number | null = null;
    editedRequestName: string = '';

    private destroy$ = new Subject<void>();

    constructor(
        private collectionsService: CollectionsService,
        private requestsService: RequestsService,
        private router: Router,
        private toastService: ToastService
    ) { }

    ngOnInit(): void {
        this.loadCollections();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    loadCollections() {
        this.collectionsService.getAll()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (data) => this.collections = data,
                error: (err) => {
                    console.error('Failed to load collections', err);
                    this.toastService.error('Failed to load collections');
                    this.collections = [];
                }
            });
    }

    selectCollection(collection: Collection) {
        this.selectedCollection = collection;
        this.selectedRequest = null;
        this.loadRequests(collection.id);
    }

    loadRequests(collectionId: number) {
        this.collectionsService.getRequests(collectionId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (data) => this.requests = data,
                error: (err) => {
                    console.error('Failed to load requests', err);
                    this.toastService.error('Failed to load requests');
                    this.requests = [];
                }
            });
    }

    selectRequest(request: SavedRequest) {
        this.selectedRequest = request;
    }

    createCollection() {
        if (!this.newCollectionName.trim()) return;
        this.collectionsService.create({ name: this.newCollectionName.trim() })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (newCol) => {
                    this.collections.push(newCol);
                    this.newCollectionName = '';
                    this.showNewCollection = false;
                    this.selectCollection(newCol);
                    this.toastService.success(`Collection "${newCol.name}" created`);
                },
                error: () => {
                    this.toastService.error('Failed to create collection');
                }
            });
    }

    deleteCollection(collection: Collection) {
        this.collectionsService.delete(collection.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.collections = this.collections.filter(c => c.id !== collection.id);
                    if (this.selectedCollection?.id === collection.id) {
                        this.selectedCollection = null;
                        this.requests = [];
                        this.selectedRequest = null;
                    }
                    this.toastService.success(`Collection "${collection.name}" deleted`);
                },
                error: () => {
                    this.toastService.error('Failed to delete collection');
                }
            });
    }

    deleteRequest(request: SavedRequest) {
        this.requestsService.delete(request.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.requests = this.requests.filter(r => r.id !== request.id);
                    if (this.selectedRequest?.id === request.id) {
                        this.selectedRequest = null;
                    }
                    this.toastService.success(`Request "${request.title || request.name}" deleted`);
                },
                error: () => {
                    this.toastService.error('Failed to delete request');
                }
            });
    }

    openInBuilder(request: SavedRequest) {
        this.router.navigate(['/builder'], { state: { request } });
    }

    startEditingName(request: SavedRequest) {
        this.editingRequestId = request.id;
        this.editedRequestName = request.title || request.name || 'Untitled';
    }

    cancelEditingName() {
        this.editingRequestId = null;
        this.editedRequestName = '';
    }

    saveRequestName(request: SavedRequest) {
        if (!this.editedRequestName.trim() || this.editedRequestName === (request.title || request.name)) {
            this.cancelEditingName();
            return;
        }

        const updatedData = { ...request, name: this.editedRequestName, title: this.editedRequestName };

        this.requestsService.update(request.id, updatedData)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (updatedReq) => {
                    const index = this.requests.findIndex(r => r.id === request.id);
                    if (index !== -1) {
                        this.requests[index] = updatedReq;
                    }
                    if (this.selectedRequest?.id === request.id) {
                        this.selectedRequest = updatedReq;
                    }
                    this.cancelEditingName();
                    this.toastService.success('Request renamed successfully');
                },
                error: (err) => {
                    console.error('Error updating request name', err);
                    this.cancelEditingName();
                    this.toastService.error('Failed to rename request');
                }
            });
    }

    parseJson(str: string): any {
        try {
            return JSON.parse(str);
        } catch {
            return str;
        }
    }

    getObjectKeys(obj: any): string[] {
        if (!obj || typeof obj !== 'object') return [];
        return Object.keys(obj);
    }
}
