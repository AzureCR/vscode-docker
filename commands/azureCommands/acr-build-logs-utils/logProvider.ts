import * as vscode from 'vscode';

export class LogContentProvider implements vscode.TextDocumentContentProvider {
    public static scheme: string = 'purejs';
    private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

    constructor() { }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        return this.stylehtml(this.reverseBase64(JSON.parse(uri.query).log));
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this.onDidChangeEvent.event;
    }

    public update(uri: vscode.Uri, message: string): void {
        this.onDidChangeEvent.fire(uri);
    }

    private reverseBase64(str: string): string {
        return Buffer.from(str, 'base64').toString('ascii');
    }

    private stylehtml(log: string): string {
        let processedLog: string = '';
        const lines: string[] = log.split(`\n`);
        if (lines.length === 0) { return 'This Log appears to be empty'; }
        lines[0] = lines[0].trim();

        for (let line of lines) {
            if (line.toLowerCase().search('error') !== -1 || line.toLowerCase().search('fail') !== -1) {
                processedLog += `<span class = 'r'>${line}\n </span>`
            } else if (line.toLowerCase().search('success') !== -1 || line.toLowerCase().search('succeeded') !== -1 || line.toLowerCase().search('complete') !== -1 ||
                line.toLowerCase().search('0 warning(s)') !== -1 || line.toLowerCase().search('0 error(s)') !== -1) {
                processedLog += `<span class = 'g'>${line}\n </span>`
            } else {
                processedLog += `${line}\n`
            }
        }
        return `
        <doctype = <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8" />
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <title>Page Title</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body{
                        font-size: var(--vscode-editor-font-size);
                        font-family: var(--vscode-editor-font-family);
                    }
                    pre{
                        font-size: var(--vscode-editor-font-size);
                        font-family: var(--vscode-editor-font-family);
                    }
                    .r{
                        color:lightcoral;
                    }
                    .g{
                        color:lightgreen;
                    }

                </style>
            </head>

            <body>
                <pre>${processedLog}</pre>
            </body>
        </html>`
    }
}
