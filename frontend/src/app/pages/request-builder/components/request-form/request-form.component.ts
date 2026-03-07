import { Component, Output, EventEmitter, Input } from '@angular/core';

@Component({
    selector: 'app-request-form',
    templateUrl: './request-form.component.html',
    styleUrls: ['./request-form.component.css'],
})
export class RequestFormComponent {
    @Output() send = new EventEmitter<any>();
    @Output() save = new EventEmitter<any>();

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
