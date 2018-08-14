import { ContainerRegistryManagementClient } from 'azure-arm-containerregistry';
import { Registry } from 'azure-arm-containerregistry/lib/models';
import { QuickBuildRequest } from "azure-arm-containerregistry/lib/models";
import { ResourceManagementClient } from 'azure-arm-resource';
import { BlobService, createBlobServiceWithSas } from "azure-storage";
import * as fs from 'fs';
import * as os from 'os';
import * as tar from 'tar';
import * as url from 'url';
import * as vscode from "vscode";
import { AzureUtilityManager } from "../utils/azureUtilityManager";
import { acquireResourceGroup, acquireSubscription, quickPickACRRegistry } from './utils/quick-pick-azure';
const idPrecision = 6;

export async function queueBuild(dockerFileUri?: vscode.Uri): Promise<void> {
    console.log("Obtaining Subscription and Client");
    let subscription = await acquireSubscription();
    let client = AzureUtilityManager.getInstance().getContainerRegistryManagementClient(subscription);
    const resourceGroupClient = new ResourceManagementClient(AzureUtilityManager.getInstance().getCredentialByTenantId(subscription.tenantId), subscription.subscriptionId);

    let resourceGroup = await acquireResourceGroup(subscription, resourceGroupClient);
    let resourceGroupName = resourceGroup.name;

    let registry: Registry = await quickPickACRRegistry(subscription, resourceGroupName);
    let registryName = registry.name;

    let folder: vscode.WorkspaceFolder;
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 1) {
        folder = vscode.workspace.workspaceFolders[0];
    } else {
        folder = await (<any>vscode).window.showWorkspaceFolderPick();
    }
    let sourceLocation: string = folder.uri.path;

    let relativeDockerPath = 'Dockerfile';
    if (dockerFileUri.path.indexOf(sourceLocation) !== 0) {
        //Currently, there is no support for selecting source location folders that don't contain a path to the triggered dockerfile.
        throw new TypeError("Source code path must be a parent of the Dockerfile path")
    } else {
        relativeDockerPath = dockerFileUri.path.toString().substring(sourceLocation.length);
    }

    const opt: vscode.InputBoxOptions = {
        prompt: 'Image name and tag in format  <name>:<tag>',
    };
    const name: string = await vscode.window.showInputBox(opt);

    /* tslint:disable-next-line:insecure-random */
    let id = Math.floor(Math.random() * Math.pow(10, idPrecision));
    console.log("Setting up temp file with 'sourceArchive" + id + ".tar.gz' ");
    let tarFilePath = url.resolve(os.tmpdir(), `sourceArchive${id}.tar.gz`);

    console.log("Uploading Source Code to " + tarFilePath);
    sourceLocation = await uploadSourceCode(client, registryName, resourceGroupName, sourceLocation, tarFilePath);

    console.log("Setting up Build Request");
    let buildRequest: QuickBuildRequest = {
        'type': 'QuickBuild',
        'imageNames': [name],
        'isPushEnabled': true,
        'sourceLocation': sourceLocation,
        'platform': { 'osType': 'Linux' },
        'dockerFilePath': relativeDockerPath
    };

    console.log("Queueing Build");
    try {
        await client.registries.queueBuild(resourceGroupName, registryName, buildRequest);
    } catch (error) {
        console.log('Build Failed');
        vscode.window.showErrorMessage(error);
    }
    console.log(client.builds.list(resourceGroupName, registryName));
}

async function uploadSourceCode(client: ContainerRegistryManagementClient, registryName: string, resourceGroupName: string, sourceLocation: string, tarFilePath: string): Promise<string> {
    console.log("   Sending source code to temp file");
    try {
        tar.c(
            {
                gzip: true
            },
            [sourceLocation]
        ).pipe(fs.createWriteStream(tarFilePath));
    } catch (error) {
        console.log(error);
    }

    console.log("   Getting Build Source Upload Url ");
    let sourceUploadLocation = await client.registries.getBuildSourceUploadUrl(resourceGroupName, registryName);
    let upload_url = sourceUploadLocation.uploadUrl;
    let relative_path = sourceUploadLocation.relativePath;

    console.log("   Getting blob info from upload URl ");
    // Right now, accountName and endpointSuffix are unused, but will be used for streaming logs later.
    let { accountName, endpointSuffix, containerName, blobName, sasToken, host } = getBlobInfo(upload_url);

    console.log("   Creating Blob service ");
    let blob: BlobService = createBlobServiceWithSas(host, sasToken);

    console.log("   Creating Block Blob ");
    try {
        blob.createBlockBlobFromLocalFile(containerName, blobName, tarFilePath, (): void => { });
    } catch (error) {
        console.log(error);
    }
    console.log("   Success ");
    return relative_path;
}

function getBlobInfo(blobUrl: string): { accountName: string, endpointSuffix: string, containerName: string, blobName: string, sasToken: string, host: string } {
    let items: string[] = blobUrl.slice(blobUrl.search('https://') + 'https://'.length).split('/');
    let accountName: string = blobUrl.slice(blobUrl.search('https://') + 'https://'.length, blobUrl.search('.blob'));
    let endpointSuffix: string = items[0].slice(items[0].search('.blob.') + '.blob.'.length);
    let containerName: string = items[1];
    let blobName: string = items[2] + '/' + items[3] + '/' + items[4].slice(0, items[4].search('[?]'));
    let sasToken: string = items[4].slice(items[4].search('[?]') + 1);
    let host: string = accountName + '.blob.' + endpointSuffix;
    return { accountName, endpointSuffix, containerName, blobName, sasToken, host };
}
