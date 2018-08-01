import * as vscode from "vscode";
import request = require('request-promise');
import * as azureUtils from '../explorer/utils/azureUtils';
import { SubscriptionModels } from 'azure-arm-resource';
import { Registry } from "azure-arm-containerregistry/lib/models";
import { AzureCredentialsManager } from '../utils/azureCredentialsManager';
import { AzureRepositoryNode, AzureImageNode } from '../explorer/models/AzureRegistryNodes';
import { AzureAccount } from "../typings/azure-account.api";
import { Repository, AzureImage } from "../explorer/utils/azureUtils";
const teleCmdId: string = 'vscode-docker.deleteAzureImage';


/**
 * function to delete an Azure repository and its associated images
 * @param context : if called through right click on AzureRepositoryNode, the node object will be passed in. See azureRegistryNodes.ts for more info
 */
export async function deleteAzureImage(context?: AzureImageNode) {
    let azureAccount: AzureAccount;
    if (context) {
        azureAccount = context.azureAccount;
    }
    else {
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
        registry = await getRegistry();
        subscription = getSub(registry);


        //get the desired repository to delete
        let repository = await getRepository(registry);
        repoName = repository.name;

        //get the desired image
        const image = await getImage(repository);
        tag = image.tag;
    }

    //ensure user truly wants to delete registry
    let opt: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        placeHolder: 'No',
        value: 'No',
        prompt: 'Are you sure you want to delete this image? Enter Yes or No: '
    };
    let answer = await vscode.window.showInputBox(opt);
    if (answer !== 'Yes') return;

    // generate credentials before requesting a delete.
    if (context) {
        username = context.userName;
        password = context.password;
        repoName = context.label;
        subscription = context.subscription;
        registry = context.registry;
        let wholeName = repoName.split(':');
        repoName = wholeName[0];
        tag = wholeName[1];
    }
    else { //this is separated from !context above so it only calls loginCredentials once user has assured they want to delete the repository
        let creds = await AzureCredentialsManager.getInstance().loginCredentials(subscription, registry);
        username = creds.username;
        password = creds.password;
    }

    let path = `/v2/_acr/${repoName}/tags/${tag}`;
    console.log('path = ' + path);
    await request_data_from_registry('delete', registry.loginServer, path, username, password);
}


/**
 *
 * @param http_method : the http method, this function currently only uses delete
 * @param login_server: the login server of the registry
 * @param path : the URL path
 * @param username : registry username, can be in generic form of 0's, used to generate authorization header
 * @param password : registry password, can be in form of accessToken, used to generate authorization header
 */
async function request_data_from_registry(http_method: string, login_server: string, path: string, username: string, password: string) {
    let url: string = `https://${login_server}${path}`;
    let header = AzureCredentialsManager.getInstance()._get_authorization_header(username, password);
    let opt = {
        headers: { 'Authorization': header },
        http_method: http_method,
        url: url
    }
    let err = false;
    try {
        let response = await request.delete(opt);
    } catch (error) {
        err = true;
        console.log(error);
    }
    if (!err) {
        vscode.window.showInformationMessage('Successfully deleted image');
    }
}

async function getImage(repository: Repository): Promise<AzureImage> {
    const repoImages: azureUtils.AzureImage[] = await AzureCredentialsManager.getInstance().getImages(repository);
    console.log(repoImages);
    let imageList: string[] = [];
    for (let j = 0; j < repoImages.length; j++) {
        imageList.push(repoImages[j].tag);
    }
    let desiredImage = await vscode.window.showQuickPick(imageList, { 'canPickMany': false, 'placeHolder': 'Choose the image you want to delete' });
    if (desiredImage === undefined) return;
    let image = repoImages.find(imageList => { return desiredImage === imageList.tag });
    if (image === undefined) return;
    return image;
}

async function getRepository(registry: Registry): Promise<Repository> {
    const myRepos: azureUtils.Repository[] = await AzureCredentialsManager.getInstance().getAzureRepositories(registry);
    let rep: string[] = [];
    for (let j = 0; j < myRepos.length; j++) {
        rep.push(myRepos[j].name);
    }
    let desiredRepo = await vscode.window.showQuickPick(rep, { 'canPickMany': false, 'placeHolder': 'Choose the repository from which your desired image exists' });
    if (desiredRepo === undefined) return;
    let repository = myRepos.find(rep => { return desiredRepo === rep.name });
    if (repository === undefined) {
        vscode.window.showErrorMessage('Could not find repository. Check that it still exists!');
        return;
    }
    return repository;
}

function getSub(registry: Registry): SubscriptionModels.Subscription {
    //get the subscription object by using the id found on the registry id
    let subscriptionId = registry.id.slice('/subscriptions/'.length, registry.id.search('/resourceGroups/'));
    const subs = AzureCredentialsManager.getInstance().getFilteredSubscriptionList();
    let subscription = subs.find(function (sub): boolean {
        return sub.subscriptionId === subscriptionId;
    });
    return subscription;
}

async function getRegistry(): Promise<Registry> {
    //first get desired registry
    let registries = await AzureCredentialsManager.getInstance().getRegistries();
    let reg: string[] = [];
    for (let i = 0; i < registries.length; i++) {
        reg.push(registries[i].name);
    }
    let desired = await vscode.window.showQuickPick(reg, { 'canPickMany': false, 'placeHolder': 'Choose the Registry from which your desired image exists' });
    if (desired === undefined) return;
    let registry = registries.find(reg => { return desired === reg.name });
    return registry;
}
