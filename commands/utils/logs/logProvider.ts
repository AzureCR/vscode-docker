
import * as vscode from 'vscode';
const path = require('path');
const fs = require('fs');

export class LogContentProvider implements vscode.TextDocumentContentProvider {
    static scheme = 'logsProvider';

    // Event emitter which invokes document updates
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    // Get the global path to the resources folder
    // by combining the actual directory with the relative path.
    private resources = path.join(__dirname, '../resources');
    private html: string = "";  // HTML document buffer

    constructor() {
        // Load HTML text to string
        this.html = 'welp, that was easy';
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    // You can invoke this method to update the provider
    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    // Main method which returns string to display in the window.
    // In this example, return the file contents loaded into a variable in the constructor.
    provideTextDocumentContent(_: vscode.Uri): vscode.ProviderResult<string> {
        return this.html;
    }
}
