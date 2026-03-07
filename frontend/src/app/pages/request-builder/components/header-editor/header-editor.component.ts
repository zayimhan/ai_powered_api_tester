import { Component } from '@angular/core';

@Component({
    selector: 'app-header-editor',
    templateUrl: './header-editor.component.html',
    styleUrls: ['./header-editor.component.css'],
})
export class HeaderEditorComponent {
    headers: { key: string; value: string }[] = [];
    addRow() { this.headers.push({ key: '', value: '' }); }
    removeRow(i: number) { this.headers.splice(i, 1); }
}
