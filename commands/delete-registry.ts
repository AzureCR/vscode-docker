import * as vscode from "vscode";
import { ContainerRegistryManagementClient } from 'azure-arm-containerregistry';
import { SubscriptionClient, ResourceManagementClient, SubscriptionModels } from 'azure-arm-resource';
import { AzureAccount, AzureSession } from '../typings/azure-account.api';
import { RegistryRootNode } from "../explorer/models/registryRootNode";
import { ServiceClientCredentials } from 'ms-rest';
const teleCmdId: string = 'vscode-docker.deleteRegistry';
import { AzureCredentialsManager } from '../utils/AzureCredentialsManager';
import { AzureRegistryNode, AzureLoadingNode, AzureNotSignedInNode } from '../explorer/models/azureRegistryNodes';

/**
 * delete a registry and all it's associated nested items
 * @param context : the AzureRegistryNode the user right clicked on to delete
 */
export async function deleteRegistry(context?: AzureRegistryNode) {
    if (!context) {
        deleteRegistryNoContext();
        return;
    }
    else {
        deleteRegistryContextAvailable(context);
        return;
    }
}

async function deleteRegistryContextAvailable(context: AzureRegistryNode) {
    let opt: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        placeHolder: 'No',
        value: 'No',
        prompt: 'Are you sure you want to delete this registry and its associated images? Enter Yes or No: '
    };
    let answer = await vscode.window.showInputBox(opt);
    if (answer !== 'Yes') { return };

    let azureAccount = context.azureAccount;
    if (!azureAccount) {
        return;
    }

    if (azureAccount.status === 'LoggedOut') {
        return;
    }

    const registries = await AzureCredentialsManager.getInstance().getRegistries();
    let resourceGroup: string;
    for (let i = 0; i < registries.length; i++) {
        if (registries[i].name === context.registry.name) {
            resourceGroup = registries[i].id.slice(registries[i].id.search('resourceGroups/') + 'resourceGroups/'.length, registries[i].id.search('/providers/'));
            break;
        }
    }
    if (!resourceGroup) {
        throw 'Something went wrong, this registry may no longer exist'
    }

    const client = AzureCredentialsManager.getInstance().getContainerRegistryManagementClient(context.subscription);
    client.registries.beginDeleteMethod(resourceGroup, context.registry.name).then(function (response) {
        vscode.window.showInformationMessage('Successfully deleted registry ' + context.registry.name);
    }, function (error) {
        console.error("Failed!", error);
        vscode.window.showErrorMessage(error);
    })
}

/**
 * this is called if the command is called through the input bar as opposed to on an AzureRegistryNode
 */
async function deleteRegistryNoContext() {

    let azureAccount = await AzureCredentialsManager.getInstance().getAccount();
    let registries = await AzureCredentialsManager.getInstance().getRegistries();
    let reg: string[] = [];
    for (let i = 0; i < registries.length; i++) {
        reg.push(registries[i].name);
    }
    let desired = await vscode.window.showQuickPick(reg, { 'canPickMany': false, 'placeHolder': 'Choose a Registry to delete' });
    if (desired === undefined) return;
    let registry = registries.find(reg => { return desired === reg.name });

    let opt: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        placeHolder: 'No',
        value: 'No',
        prompt: 'Are you sure you want to delete this registry and its associated images? Enter Yes or No: '
    };
    //ensure user truly wants to delete registry
    let answer = await vscode.window.showInputBox(opt);
    if (answer !== 'Yes') return;

    if (!azureAccount) {
        return;
    }

    if (azureAccount.status === 'LoggedOut') {
        return;
    }
    let resourceGroup: string;
    let subscriptionId: string;
    // grab the resource group and subscription ID to be passed in as parameters to beginDeleteMethod
    for (let i = 0; i < registries.length; i++) {
        if (registries[i].name === registry.name) {
            resourceGroup = registries[i].id.slice(registries[i].id.search('resourceGroups/') + 'resourceGroups/'.length, registries[i].id.search('/providers/'));
            subscriptionId = registries[i].id.slice('/subscriptions/'.length, registries[i].id.search('/resourceGroups/'));
            break;
        }
    }

    if (!resourceGroup || !subscriptionId) {
        throw 'Something went wrong, this registry may no longer exist'
    }

    //get all the subscriptions to look through
    const subs = AzureCredentialsManager.getInstance().getFilteredSubscriptionList();
    //get the actual subscription object by using the id found on the registry id above
    const subscription = subs.find(function (sub): boolean {
        return sub.subscriptionId === subscriptionId;
    });
    const client = AzureCredentialsManager.getInstance().getContainerRegistryManagementClient(subscription);
    client.registries.beginDeleteMethod(resourceGroup, registry.name).then(function (response) {
        vscode.window.showInformationMessage('Successfully deleted registry ' + registry.name);
    }, function (error) {
        console.error("Failed!", error);
        vscode.window.showErrorMessage(error);
    })
}
