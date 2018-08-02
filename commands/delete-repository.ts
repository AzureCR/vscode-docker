import { Registry } from "azure-arm-containerregistry/lib/models";
import { SubscriptionModels } from 'azure-arm-resource';
import request = require('request-promise');
import * as vscode from "vscode";
import { AzureRepositoryNode } from '../explorer/models/AzureRegistryNodes';
import * as azureUtils from '../explorer/utils/azureUtils';
import { AzureCredentialsManager } from '../utils/AzureCredentialsManager';
const teleCmdId: string = 'vscode-docker.deleteRepository';

/**
 * function to delete an Azure repository and its associated images
 * @param context : if called through right click on AzureRepositoryNode, the node object will be passed in. See azureRegistryNodes.ts for more info
 */
export async function deleteRepository(context?: AzureRepositoryNode): Promise<void> {

    let azureAccount = await AzureCredentialsManager.getInstance().getAccount();
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
    if (!context) {
        //first get desired registry
        let registries = await AzureCredentialsManager.getInstance().getRegistries();
        let regStrings: string[] = [];
        for (let item of registries) {
            regStrings.push(item.name);
        }
        let desired = await vscode.window.showQuickPick(regStrings, { 'canPickMany': false, 'placeHolder': 'Choose the Registry from which your desired repository exists' });
        if (desired === undefined) { return; }
        registry = registries.find(reg => { return desired === reg.name });

        //get the subscription object by using the id found on the registry id
        subscription = azureUtils.getSub(registry);

        //get the desired repository to delete
        const myRepos: azureUtils.Repository[] = await AzureCredentialsManager.getInstance().getAzureRepositories(registry);
        let repoStrings: string[] = [];
        for (let repo of myRepos) {
            repoStrings.push(repo.name);
        }
        let desiredRepo = await vscode.window.showQuickPick(repoStrings, { 'canPickMany': false, 'placeHolder': 'Choose the repository you want to delete' });
        if (desiredRepo === undefined) { return; }
        let repository = myRepos.find((rep): boolean => { return desiredRepo === rep.name });
        if (repository === undefined) { return; }
        repoName = repository.name;
    }

    //ensure user truly wants to delete registry
    let opt: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        placeHolder: 'No',
        value: 'No',
        prompt: 'Are you sure you want to delete this repository and its associated images? Enter Yes or No: '
    };
    let answer = await vscode.window.showInputBox(opt);
    answer = answer.toLowerCase();
    if (answer !== 'Yes') { return; }

    // generate credentials before requesting a delete.
    if (context) {
        username = context.userName;
        password = context.password;
        repoName = context.label;
        subscription = context.subscription;
        registry = context.registry;
    } else { //this is separated from !context above so it only calls loginCredentials once user has assured they want to delete the repository
        let creds = await AzureCredentialsManager.getInstance().loginCredentials(subscription, registry);
        username = creds.username;
        password = creds.password;
    }
    let path = `/v2/_acr/${repoName}/repository`;
    await azureUtils.request_data_from_registry('delete', registry.loginServer, path, username, password);
}
