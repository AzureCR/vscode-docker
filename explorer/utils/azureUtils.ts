import { Registry } from 'azure-arm-containerregistry/lib/models';
import { SubscriptionModels } from 'azure-arm-resource';
import * as opn from 'opn';
import request = require('request-promise');
import { AzureAccount, AzureSession } from '../../typings/azure-account.api';
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

    constructor(azureAccount: AzureAccount, registry: Registry, repository: string, subscription:
        SubscriptionModels.Subscription, resourceGroupName: string, accessToken?: string, refreshToken?: string, password?: string, username?: string) {

        this.azureAccount = azureAccount;
        this.registry = registry;
        this.name = repository;
        this.subscription = subscription;
        this.resourceGroupName = resourceGroupName;
        if (accessToken) { this.accessToken = accessToken; }
        if (refreshToken) { this.refreshToken = refreshToken; }
        if (password) { this.password = password; }
        if (username) { this.username = username; }
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

    constructor(azureAccount: AzureAccount, registry: Registry, repository: Repository, tag: string, subscription:
        SubscriptionModels.Subscription, resourceGroupName: string, accessToken?: string, refreshToken?: string, password?: string, username?: string) {

        this.azureAccount = azureAccount;
        this.registry = registry;
        this.repository = repository;
        this.tag = tag;
        this.subscription = subscription;
        this.resourceGroupName = resourceGroupName;
        if (accessToken) { this.accessToken = accessToken; }
        if (refreshToken) { this.refreshToken = refreshToken; }
        if (password) { this.password = password; }
        if (username) { this.username = username; }
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
