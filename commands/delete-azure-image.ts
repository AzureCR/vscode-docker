import { Registry } from "azure-arm-containerregistry/lib/models";
import { SubscriptionModels } from 'azure-arm-resource';
import request = require('request-promise');
import * as vscode from "vscode";
import { AzureImageNode } from '../explorer/models/AzureRegistryNodes';
import * as azureUtils from '../explorer/utils/azureUtils';
import { AzureImage, getSub, Repository } from "../explorer/utils/azureUtils";
import { AzureAccount } from "../typings/azure-account.api";
import { AzureCredentialsManager } from '../utils/azureCredentialsManager';
const teleCmdId: string = 'vscode-docker.deleteAzureImage';
import * as quickPicks from '../commands/utils/quick-pick-azure';
import * as acrTools from '../utils/Azure/acrTools';

/**
 * function to delete an Azure repository and its associated images
 * @param context : if called through right click on AzureRepositoryNode, the node object will be passed in. See azureRegistryNodes.ts for more info
 */
export async function deleteAzureImage(context?: AzureImageNode): Promise<void> {
    if (!AzureCredentialsManager.getInstance().isLoggedIn()) {
        vscode.window.showErrorMessage('You are not logged into Azure');
    }
    let registry: Registry;
    let subscription: SubscriptionModels.Subscription;
    let repoName: string;
    let username: string;
    let password: string;
    let tag: string;
    if (!context) {
        registry = await quickPicks.quickPickACRRegistry();
        subscription = getSub(registry);
        let repository: Repository = await quickPicks.quickPickACRRepository(registry);
        repoName = repository.name;
        const image = await quickPicks.quickPickACRImage(repository);
        tag = image.tag;
    }

    //ensure user truly wants to delete image
    let opt: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        placeHolder: 'No',
        value: 'No',
        prompt: 'Are you sure you want to delete this image? Enter Yes to continue: '
    };
    let answer = await vscode.window.showInputBox(opt);
    if (answer !== 'Yes') { return; }

    if (context) {
        repoName = context.label;
        subscription = context.subscription;
        registry = context.registry;
        let wholeName = repoName.split(':');
        repoName = wholeName[0];
        tag = wholeName[1];
    }

    let creds = await acrTools.loginCredentials(subscription, registry);
    username = creds.username;
    password = creds.password;
    let path = `/v2/_acr/${repoName}/tags/${tag}`;
    await azureUtils.request_data_from_registry('delete', registry.loginServer, path, username, password); //official call to delete the image
}
