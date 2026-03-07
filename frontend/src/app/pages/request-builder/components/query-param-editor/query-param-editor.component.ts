import { Component } from '@angular/core';

@Component({
    selector: 'app-query-param-editor',
    templateUrl: './query-param-editor.component.html',
    styleUrls: ['./query-param-editor.component.css'],
})
export class QueryParamEditorComponent {
    params: { key: string; value: string }[] = [];
    addRow() { this.params.push({ key: '', value: '' }); }
    removeRow(i: number) { this.params.splice(i, 1); }
}
