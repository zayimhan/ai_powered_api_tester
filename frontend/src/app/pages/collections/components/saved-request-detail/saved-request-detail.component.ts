import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-saved-request-detail',
    templateUrl: './saved-request-detail.component.html',
    styleUrls: ['./saved-request-detail.component.css'],
})
export class SavedRequestDetailComponent {
    @Input() request: any = null;
}
