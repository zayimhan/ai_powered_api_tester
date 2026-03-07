import { Component } from '@angular/core';

@Component({
    selector: 'app-body-editor',
    templateUrl: './body-editor.component.html',
    styleUrls: ['./body-editor.component.css'],
})
export class BodyEditorComponent {
    bodyType: string = 'NONE';
    rawBody = '';

    onBodyTypeChange(event: any) {
        this.bodyType = event.target.value;
    }
}
