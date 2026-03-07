import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-response-viewer',
    templateUrl: './response-viewer.component.html',
    styleUrls: ['./response-viewer.component.css'],
})
export class ResponseViewerComponent {
    @Input() response: any = null;
}
