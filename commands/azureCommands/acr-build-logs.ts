import ContainerRegistryManagementClient from "azure-arm-containerregistry";
import { Build, BuildGetLogResult, BuildListResult, BuildTaskListResult, Registry, RegistryListResult, RegistryNameStatus } from "azure-arm-containerregistry/lib/models";
import { Subscription } from "azure-arm-resource/lib/subscription/models";
import { BlobService, createBlobServiceWithSas } from "azure-storage";
import { truncate } from "fs-extra";
import * as path from 'path';
import * as vscode from "vscode";
import { AzureImageNode, AzureLoadingNode, AzureNotSignedInNode, AzureRegistryNode, AzureRepositoryNode } from '../../explorer/models/azureRegistryNodes';
import { getSubscriptionFromRegistry } from '../../utils/Azure/acrTools';
import { AzureUtilityManager } from '../../utils/azureUtilityManager';
import { quickPickACRRegistry } from '../utils/quick-pick-azure'

const teleCmdId: string = 'vscode-docker.buildTaskLog';

/**  This command is used through a right click on an azure registry, repository or image in the Docker Explorer. It is used to view build logs for a given item. */
export async function viewBuildLogs(context: AzureRegistryNode | AzureRepositoryNode | AzureImageNode): Promise<void> {
    let registry: Registry;
    let subscription: Subscription;
    if (!context) {
        registry = await quickPickACRRegistry();
        if (!registry) { return; }
        subscription = getSubscriptionFromRegistry(registry);
    } else {
        registry = context.registry;
        subscription = context.subscription;
    }
    let resourceGroup: string = registry.id.slice(registry.id.search('resourceGroups/') + 'resourceGroups/'.length, registry.id.search('/providers/'));

    const client = AzureUtilityManager.getInstance().getContainerRegistryManagementClient(subscription);

    let logData: LogData = new LogData(client, registry, resourceGroup);
    const filterFunction = context ? getFilterFunction(context) : undefined;
    try {
        await logData.loadMoreLogs(filterFunction);
    } catch (error) {
        if (error.code !== "NoRegisteredProviderFound") {
            throw error;
        }
    }

    if (logData.logs.length === 0) {
        let itemType: string;
        if (context && context instanceof AzureRepositoryNode) {
            itemType = 'repository';
        } else if (context && context instanceof AzureImageNode) {
            itemType = 'image';

        } else {
            itemType = 'registry';
        }
        vscode.window.showInformationMessage(`This ${itemType} has no associated build logs`);
        return;
    }
    if (context && context instanceof AzureImageNode) {
        logData.getLink(0).then((url) => {
            if (url !== 'requesting') {
                openLog(url, logData.logs[0].buildId); //-----------------------------------------------------Need to use filter
            }
        });
    } else {
        let webViewTitle: string = registry.name;
        if (context instanceof AzureRepositoryNode || context instanceof AzureImageNode) {
            webViewTitle += (context ? '/' + context.label : '');
        }
        createWebview(webViewTitle, logData);
    }
}

//# WEBVIEW COMPONENTS
/** Generate the webview to display the logs */
function createWebview(webviewName: string, logData: LogData): void {
    //Creating the panel in which to show the logs
    const panel = vscode.window.createWebviewPanel('log Viewer', webviewName, vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });

    //Get path to resource on disk
    let extensionPath = vscode.extensions.getExtension("PeterJausovec.vscode-docker").extensionPath;
    const scriptPath = vscode.Uri.file(path.join(extensionPath, 'commands', 'azureCommands', 'acr-build-logs-utils', 'logScripts.js'));
    const scriptFile = scriptPath.with({ scheme: 'vscode-resource' });
    const stylePath = vscode.Uri.file(path.join(extensionPath, 'commands', 'azureCommands', 'acr-build-logs-utils', 'stylesheet.css'));
    const styleFile = stylePath.with({ scheme: 'vscode-resource' });

    //Populate Webview
    panel.webview.html = getWebviewContent(scriptFile, styleFile);
    addLogsToWebView(panel, logData);
}
/** Communicates with the webview javascript file through post requests to populate the log table */
function addLogsToWebView(panel: vscode.WebviewPanel, logData: LogData, startItem?: number): void {
    const begin = startItem ? startItem : 0;
    if (!startItem) { setupCommunication(panel, logData); }
    for (let i = begin; i < logData.logs.length; i++) {
        const log = logData.logs[i];
        const buildTask: string = log.buildTask ? log.buildTask : '';
        const createTime: string = log.createTime ? log.createTime.toLocaleString() : '';
        const timeElapsed: string = log.startTime && log.finishTime ? (Math.abs(log.startTime.valueOf() - log.finishTime.valueOf()) / 1000).toString() + 's' : '';
        const osType: string = log.platform.osType ? log.platform.osType : '';
        const name: string = log.name ? log.name : '';
        let imageOutput: string = getImageOutputTable(log);

        panel.webview.postMessage({
            'type': 'populate',
            'id': i,
            'logComponent': `
                        <tr id= "btn${i}" class="accordion">
                                <td class = 'arrowHolder'><div class = "arrow">&#x25f9</div></td>
                                <td class = 'widthControl'>${name}</td>
                                <td class = 'widthControl'>${buildTask}</td>
                                <td class ='status widthControl ${log.status}'>${log.status}</td>
                                <td class = 'widthControl'>${createTime}</td>
                                <td class = 'widthControl'>${timeElapsed}</td>
                                <td class = 'widthControl'>${osType}</td>
                        </tr>
                        <tr class="panel">
                            <td colspan = "7">
                                <div class= "paddingDiv overflowX">
                                    <table class="innerTable">
                                        <tr>
                                            <td class = "arrowHolder">&#160</td>
                                            <td colspan = "5" class = "borderLimit widthControl5">Output Images</td>
                                            <td class = "widthControl lastTd" rowspan = "300">
                                                <div class = "button-holder">
                                                    <button id= "log${i}" class="viewLog">Open Logs</button>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class = "arrowHolder">&#160</td>
                                            <td colspan = "2" class = "borderLimit widthControl2">Tag</th>
                                            <td colspan = "2" class = "widthControl3">Repository</td>
                                            <td class = "widthControl">Digest</td>
                                        </tr>
                                        ${imageOutput}
                                    </table>
                                </div>
                            </td>
                        </tr>`
        });
    }
    if (startItem) {
        panel.webview.postMessage({ 'type': 'endContinued' });
    } else {
        panel.webview.postMessage({ 'type': 'end' });
    }
}

function getImageOutputTable(log: Build): string {
    let imageOutput: string = '';
    let needsNA: boolean = false;
    if (log.outputImages) {
        for (let j = 0; j < log.outputImages.length; j++) {
            let img = log.outputImages[j]
            if (img) {
                const tag: string = img.tag ? img.tag : '';
                const repository: string = img.repository ? img.repository : '';
                const digest: string = img.digest ? img.digest : '';
                const truncatedDigest: string = digest ? digest.substr(0, 5) + '...' + digest.substr(digest.length - 5) : '';
                const lastTd: string = j === log.outputImages.length - 1 ? 'lastTd' : '';
                imageOutput += `<tr>
                                    <td class = "arrowHolder">&#160</td>
                                    <td colspan = "2" class = "borderLimit widthControl2 ${lastTd}">${tag}</td>
                                    <td colspan = "2" class = "widthControl2 ${lastTd}">${repository}</td>
                                    <td colspan = "1" class = "widthControl ${lastTd}" data-digest = "${digest}">${truncatedDigest} <inline class = 'copy'>&#128459</inline></td>
                                </tr>`;
            }
        }
        if (!log.outputImages[0]) {
            needsNA = true;
        }
    } else {
        needsNA = true;
    }
    if (needsNA) {
        imageOutput += `<tr>
                            <td class = "arrowHolder lastTd">&#160</td>
                            <td colspan = "2" class = "borderLimit widthControl2 lastTd">NA</td>
                            <td colspan = "2" class = "widthControl2 lastTd">NA</td>
                            <td colspan = "1" class = "widthControl lastTd">NA</td>
                        </tr>`;
    }
    return imageOutput;
}

/** Create the table in which to push the build logs */
function getWebviewContent(scriptFile: vscode.Uri, stylesheet: vscode.Uri): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <link rel="stylesheet" type="text/css" href="${stylesheet}">
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="frame-src vscode-resource:; img-src vscode-resource: https:; script-src vscode-resource:; style-src vscode-resource:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Logs</title>
    </head>

    <body>
        <div id = "header">
            <table id="headerTable">
                <th class = 'arrowHolder'></td>
                <th class = 'widthControl'>Build Name </th>
                <th class = 'widthControl'>BuildTask </th>
                <th class = 'widthControl'>Status </th>
                <th class = 'widthControl'>Created </th>
                <th class = 'widthControl'>Elapsed Time </th>
                <th class = 'widthControl'>Platform </th>
                <td></td>
            </table>
        </div>
            <table id = 'coreParent'>
                <tbody id = 'core'>

                </tbody>
            </table>
        <div class = 'loadMoreBtn'>
            <button id= "loadBtn" class="viewLog">Load More Logs</button>
        </div>
        <div class="overlay">
            <div class="modal">
                <input id = "digestVisualizer", readonly>
                <button class = "copyBtn">Copy</button>
            </div>
        </div>

        <script src= "${scriptFile}"></script>
    </body>
`;
}
/** Setup communication with the webview sorting out received mesages from its javascript file */
function setupCommunication(panel: vscode.WebviewPanel, logData: LogData): void {
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.logRequest) {
            const itemNumber: number = +message.logRequest.id;
            logData.getLink(itemNumber).then((url) => {
                if (url !== 'requesting') {
                    openLog(url, logData.logs[itemNumber].buildId);
                }
            })
        } else if (message.loadMore) {
            try {
                await logData.loadMoreLogs();
            } catch (error) {
                vscode.window.showErrorMessage(error.message);
            }

            addLogsToWebView(panel, logData, logData.logs.length);
        }
    });
}

//# LOGS
/** Passes the log text into a document provider */
function createLogView(text: string, title: string): void {
    const scheme = 'purejs';
    let uri: vscode.Uri;
    try {
        let query = JSON.stringify({ 'log': makeBase64(text) });
        uri = vscode.Uri.parse(`${scheme}://authority/${title}?${query}#idk`);
    } catch (error) {
        console.log(error);
    }

    // vscode.workspace.openTextDocument(uri).then((doc) => {
    //     return vscode.window.showTextDocument(doc, vscode.ViewColumn.Active + 1, true);
    // });

    vscode.commands.executeCommand('vscode.previewHtml', uri, undefined, title).then(_ => { }, _ => {
        vscode.window.showErrorMessage('Cant open!');
    });
}
/** Loads log text from remote url using azure blobservices */
function openLog(url: string, title: string): void {
    let blobInfo = getBlobInfo(url);
    let blob: BlobService;
    try {
        blob = createBlobServiceWithSas(blobInfo.host, blobInfo.sasToken);
    } catch (error) {
        console.log(error);
    }
    try {
        blob.getBlobToText(blobInfo.containerName, blobInfo.blobName, async (error, text, result, response) => {
            if (response) {
                createLogView(text, title);
            } else {
                console.log(error);
            }
        });
    } catch (error) {
        console.log(error);
    }
}
/** Parses blob url into a readable form */
function getBlobInfo(blobUrl: string): { accountName: string, endpointSuffix: string, containerName: string, blobName: string, sasToken: string, host: string } {
    const items: string[] = blobUrl.slice(blobUrl.search('https://') + 'https://'.length).split('/');
    const accountName: string = blobUrl.slice(blobUrl.search('https://') + 'https://'.length, blobUrl.search('.blob'));
    const endpointSuffix: string = items[0].slice(items[0].search('.blob.') + '.blob.'.length);
    const containerName: string = items[1];
    const blobName: string = items[2] + '/' + items[3] + '/' + items[4].slice(0, items[4].search('[?]'));
    const sasToken: string = items[4].slice(items[4].search('[?]') + 1);
    const host: string = accountName + '.blob.' + endpointSuffix;
    return { accountName, endpointSuffix, containerName, blobName, sasToken, host };
}

//# UTILS
function makeBase64(str: string): string {
    let buffer = new Buffer(str);
    return buffer.toString('base64');
}

/** Obtains a function to filter logs to a single repository/image */
function getFilterFunction(context: AzureRegistryNode | AzureRepositoryNode | AzureImageNode): (logEntry: Build) => boolean {
    if (context instanceof AzureRegistryNode) {
        return undefined;
    } else if (context instanceof AzureRepositoryNode) {
        return (logEntry: Build) => {
            if (!logEntry.outputImages) {
                return false;
            } else if (logEntry.outputImages.length === 0) {
                return false;
            } else if (logEntry.outputImages.find((imgDescriptor) => {
                if (!imgDescriptor) { return false; }
                return imgDescriptor.repository === context.label;
            })) {
                return true
            } else {
                return false;
            }
        }
    } else {
        const tag: string = context.label.slice(context.label.search(':') + 1);
        return (logEntry: Build) => {
            if (!logEntry.outputImages) {
                return false;
            } else if (logEntry.outputImages.length === 0) {
                return false;
            } else if (logEntry.outputImages.find((imgDescriptor) => {
                if (!imgDescriptor) { return false; }
                return imgDescriptor.tag === tag;
            })) {
                return true
            } else {
                return false;
            }
        }
    }
}

/** Class to manage data and data acquisition for logs */
class LogData {
    public registry: Registry;
    public resourceGroup: string;
    public links: { requesting: boolean, url?: string }[];
    public logs: Build[];
    public client: ContainerRegistryManagementClient;
    private nextLink: string;

    constructor(client: ContainerRegistryManagementClient, registry: Registry, resourceGroup: string) {
        this.registry = registry;
        this.resourceGroup = resourceGroup;
        this.client = client;
        this.logs = [];
        this.links = [];
    }
    /** Acquires Links from an item number corresponding to the index of the corresponding log, caches
     * logs in order to avoid unecessary requests if opened multiple times.
     */
    public async getLink(itemNumber: number): Promise<string> {
        if (itemNumber >= this.links.length) {
            throw new Error('Log for which the link was requested has not been added');
        }

        if (this.links[itemNumber].url) {
            return this.links[itemNumber].url;
        }

        //If user is simply clicking many times impatiently it makes sense to only have one request at once
        if (this.links[itemNumber].requesting) { return 'requesting' }

        this.links[itemNumber].requesting = true;
        const temp: BuildGetLogResult = await this.client.builds.getLogLink(this.resourceGroup, this.registry.name, this.logs[itemNumber].buildId);
        this.links[itemNumber].url = temp.logLink;
        this.links[itemNumber].requesting = false;
        return this.links[itemNumber].url
    }

    public async loadMoreLogs(filterFunc?: (logEntry: Build) => boolean): Promise<void> {
        let buildListResult: BuildListResult;
        if (this.logs.length === 0) {
            buildListResult = await this.client.builds.list(this.resourceGroup, this.registry.name);
            this.nextLink = buildListResult.nextLink;
        } else if (!this.nextLink) {
            throw new Error('No more logs to show');
        } else {
            let options = { 'skipToken': this.nextLink };
            buildListResult = await this.client.builds.list(this.resourceGroup, this.registry.name, options);
            this.nextLink = buildListResult.nextLink;
        }
        if (filterFunc) {
            buildListResult = buildListResult.filter(filterFunc);
        }

        this.addLogs(buildListResult);
    }

    public addLogs(logs: Build[]): void {
        this.logs = this.logs.concat(logs);

        const itemCount = logs.length;
        for (let i = 0; i < itemCount; i++) {
            this.links.push({ 'requesting': false });
        }
    }
}
