import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-collection-list',
    templateUrl: './collection-list.component.html',
    styleUrls: ['./collection-list.component.css'],
})
export class CollectionListComponent {
    @Input() collections: any[] = [];
    selected: any = null;
    select(c: any) { this.selected = c; }
}
