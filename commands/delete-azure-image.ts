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

/**
 * function to delete an Azure repository and its associated images
 * @param context : if called through right click on AzureRepositoryNode, the node object will be passed in. See azureRegistryNodes.ts for more info
 */
export async function deleteAzureImage(context?: AzureImageNode): Promise<void> {
    let azureAccount: AzureAccount;
    if (context) {
        azureAccount = context.azureAccount;
    } else {
        azureAccount = await AzureCredentialsManager.getInstance().getAccount();
    }
    if (!azureAccount) {
        return;
    }

    if (azureAccount.status === 'LoggedOut') {
        return;
    }

    let registry: Registry;
    let subscription: SubscriptionModels.Subscription;
    let repoName: string;
    let username: string;
    let password: string;
    let tag: string;
    if (!context) {
        registry = await AzureCredentialsManager.getInstance().getRegistry();
        subscription = getSub(registry);
        let repository: Repository = await AzureCredentialsManager.getInstance().getRepository(registry);
        repoName = repository.name;
        const image = await AzureCredentialsManager.getInstance().getImage(repository);
        tag = image.tag;
    }

    //ensure user truly wants to delete image
    let opt: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        placeHolder: 'No',
        value: 'No',
        prompt: 'Are you sure you want to delete this image? Enter Yes or No: '
    };
    let answer = await vscode.window.showInputBox(opt);
    if (answer !== 'Yes') { return; }

    if (context) {
        username = context.userName;
        password = context.password;
        repoName = context.label;
        subscription = context.subscription;
        registry = context.registry;
        let wholeName = repoName.split(':');
        repoName = wholeName[0];
        tag = wholeName[1];
    } else { //this is separated from !context above so it only calls loginCredentials once user has assured they want to delete the image
        let creds = await AzureCredentialsManager.getInstance().loginCredentials(subscription, registry);
        username = creds.username;
        password = creds.password;
    }

    let path = `/v2/_acr/${repoName}/tags/${tag}`;
    await azureUtils.request_data_from_registry('delete', registry.loginServer, path, username, password); //official call to delete the image
}
