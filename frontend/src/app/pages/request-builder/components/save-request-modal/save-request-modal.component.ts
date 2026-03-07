import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CollectionsService } from '../../../../services/collections.service';

@Component({
    selector: 'app-save-request-modal',
    templateUrl: './save-request-modal.component.html',
    styleUrls: ['./save-request-modal.component.css']
})
export class SaveRequestModalComponent implements OnInit {
    @Input() initialTitle: string = '';
    @Output() save = new EventEmitter<{ title: string, collectionId: number }>();
    @Output() close = new EventEmitter<void>();

    title: string = '';
    collections: any[] = [];
    selectedCollectionId: number = -1;
    newCollectionName: string = '';

    constructor(private collectionsService: CollectionsService) { }

    ngOnInit() {
        this.title = this.initialTitle;
        this.loadCollections();
    }

    loadCollections() {
        this.collectionsService.getAll().subscribe({
            next: (cols) => {
                this.collections = cols;
                if (cols.length > 0) {
                    this.selectedCollectionId = cols[0].id;
                } else {
                    this.selectedCollectionId = -1;
                }
            },
            error: (err) => {
                console.error('Failed to load collections:', err);
                this.selectedCollectionId = -1;
            }
        });
    }

    onSave() {
        if (!this.title) return;

        if (this.selectedCollectionId === -1 && this.newCollectionName) {
            this.collectionsService.create({ name: this.newCollectionName }).subscribe({
                next: (newCol) => {
                    this.save.emit({ title: this.title, collectionId: newCol.id });
                },
                error: (err) => {
                    console.error('Failed to create collection:', err);
                }
            });
        } else if (this.selectedCollectionId !== -1) {
            this.save.emit({ title: this.title, collectionId: this.selectedCollectionId });
        }
    }

    onCancel() {
        this.close.emit();
    }
}
