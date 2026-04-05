import { Component, Output, EventEmitter, Input, HostListener } from '@angular/core';

@Component({
    selector: 'app-request-form',
    templateUrl: './request-form.component.html',
    styleUrls: ['./request-form.component.css'],
})
export class RequestFormComponent {
    @Output() send = new EventEmitter<any>();
    @Output() save = new EventEmitter<any>();
    @Output() removeBaseUrl = new EventEmitter<void>();

    @Input() useBaseUrl = false;

    @Input() set loadRequest(data: any) {
        if (data) {
            this.method = data.method || 'GET';
            this.url = data.url || '';
            this.title = data.title || '';
        }
    }

    method = 'GET';
    url = '';
    title = '';
    dropdownOpen = false;
    methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    toggleDropdown() {
        this.dropdownOpen = !this.dropdownOpen;
    }

    selectMethod(m: string) {
        this.method = m;
        this.dropdownOpen = false;
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.method-dropdown')) {
            this.dropdownOpen = false;
        }
    }

    onRemoveBaseUrl() {
        this.removeBaseUrl.emit();
    }

    onSend() {
        if (!this.url) return;
        this.send.emit({ method: this.method, url: this.url });
    }

    onSave() {
        if (!this.url) return;
        this.save.emit({
            method: this.method,
            url: this.url,
            title: this.title || 'New Request'
        });
    }
}
