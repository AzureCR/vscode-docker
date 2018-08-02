import { Registry } from 'azure-arm-containerregistry/lib/models';
import { SubscriptionModels } from 'azure-arm-resource';
import * as opn from 'opn';
import request = require('request-promise');
import * as vscode from 'vscode';
import { AzureAccount, AzureSession } from '../../typings/azure-account.api';
import * as acrTools from '../../utils/Azure/acrTools';
import { AzureCredentialsManager } from '../../utils/AzureCredentialsManager';
import { AzureImageNode, AzureRegistryNode, AzureRepositoryNode } from '../models/azureRegistryNodes';

/**
 * class Repository: used locally as of August 2018, primarily for functions within azureUtils.ts and new commands such as delete Repository
 * accessToken can be used like a password, and the username can be '00000000-0000-0000-0000-000000000000'
 */
export class Repository {
    public azureAccount: AzureAccount;
    public registry: Registry;
    public name: string;
    public subscription: SubscriptionModels.Subscription;
    public resourceGroupName: string;
    public accessToken?: string;
    public refreshToken?: string;
    public password?: string;
    public username?: string;

    constructor(registry: Registry, repository: string, accessToken?: string, refreshToken?: string, password?: string, username?: string) {
        this.registry = registry;
        this.resourceGroupName = registry.id.slice(registry.id.search('resourceGroups/') + 'resourceGroups/'.length, registry.id.search('/providers/'));
        this.subscription = getSub(registry);
        this.azureAccount = AzureCredentialsManager.getInstance().getAccount();
        this.name = repository;
        if (accessToken) { this.accessToken = accessToken; }
        if (refreshToken) { this.refreshToken = refreshToken; }
        if (password) { this.password = password; }
        if (username) { this.username = username; }
    }

    public async  setTokens(registry: Registry): Promise<void> {
        let tokens = await acrTools.getTokens(registry);
        this.accessToken = tokens.accessToken;
        this.refreshToken = tokens.refreshToken;
    }
}

/**
 * class Repository: used locally as of August 2018, primarily for functions within azureUtils.ts and new commands such as delete Repository
 * accessToken can be used like a password, and the username can be '00000000-0000-0000-0000-000000000000'
 */
export class AzureImage {
    public azureAccount: AzureAccount;
    public registry: Registry;
    public repository: Repository;
    public tag: string;
    public subscription: SubscriptionModels.Subscription;
    public resourceGroupName: string;
    public accessToken?: string;
    public refreshToken?: string;
    public password?: string;
    public username?: string;

    constructor(repository: Repository, tag: string) {
        this.azureAccount = repository.azureAccount;
        this.registry = repository.registry;
        this.repository = repository;
        this.tag = tag;
        this.subscription = repository.subscription;
        this.resourceGroupName = repository.resourceGroupName;
        if (repository.accessToken) { this.accessToken = repository.accessToken; }
        if (repository.refreshToken) { this.refreshToken = repository.refreshToken; }
        if (repository.password) { this.password = repository.password; }
        if (repository.username) { this.username = repository.username; }
    }
}

export function browseAzurePortal(context?: AzureRegistryNode | AzureRepositoryNode | AzureImageNode): void {

    if (context) {
        const tenantId: string = context.subscription.tenantId;
        const session: AzureSession = context.azureAccount.sessions.find((s, i, array) => s.tenantId.toLowerCase() === tenantId.toLowerCase());
        let url: string = `${session.environment.portalUrl}/${tenantId}/#resource${context.registry.id}`;
        if (context.contextValue === 'azureImageNode' || context.contextValue === 'azureRepositoryNode') {
            url = `${url}/repository`;
        }
        opn(url);
    }

}

/**
 *
 * @param registry gets the subscription for a given registry
 * @returns a subscription object
 */
export function getSub(registry: Registry): SubscriptionModels.Subscription {
    let subscriptionId = registry.id.slice('/subscriptions/'.length, registry.id.search('/resourceGroups/'));
    const subs = AzureCredentialsManager.getInstance().getFilteredSubscriptionList();
    let subscription = subs.find((sub): boolean => {
        return sub.subscriptionId === subscriptionId;
    });
    return subscription;
}

/**
 *
 * @param http_method : the http method, this function currently only uses delete
 * @param login_server: the login server of the registry
 * @param path : the URL path
 * @param username : registry username, can be in generic form of 0's, used to generate authorization header
 * @param password : registry password, can be in form of accessToken, used to generate authorization header
 */
export async function request_data_from_registry(http_method: string, login_server: string, path: string, username: string, password: string): Promise<void> {
    let url: string = `https://${login_server}${path}`;
    let header = acrTools._get_authorization_header(username, password);
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
