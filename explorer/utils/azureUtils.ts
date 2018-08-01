import * as opn from 'opn';
import { AzureRepositoryNode, AzureImageNode, AzureRegistryNode } from '../models/azureRegistryNodes';
import { AzureAccount, AzureSession } from '../../typings/azure-account.api';
import { Registry } from 'azure-arm-containerregistry/lib/models';
import request = require('request-promise');
import { AzureCredentialsManager } from '../../utils/AzureCredentialsManager';
import { SubscriptionModels } from 'azure-arm-resource';


/**
 * class Repository: used locally as of August 2018, primarily for functions within azureUtils.ts and new commands such as delete Repository
 * accessToken can be used like a password, and the username can be '00000000-0000-0000-0000-000000000000'
 */
export class Repository {
    azureAccount: AzureAccount;
    registry: Registry;
    name: string;
    subscription: SubscriptionModels.Subscription;
    resourceGroupName: string;
    accessToken?: string;
    refreshToken?: string;
    password?: string;
    username?: string;

    constructor(AzureAccount: AzureAccount, registry: Registry, repository: string, subscription:
        SubscriptionModels.Subscription, resourceGroupName: string, accessToken?: string, refreshToken?: string, password?: string, username?: string) {

        this.azureAccount = AzureAccount;
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
    azureAccount: AzureAccount;
    registry: Registry;
    repository: Repository;
    tag: string;
    subscription: SubscriptionModels.Subscription;
    resourceGroupName: string;
    accessToken?: string;
    refreshToken?: string;
    password?: string;
    username?: string;

    constructor(AzureAccount: AzureAccount, registry: Registry, repository: Repository, tag: string, subscription:
        SubscriptionModels.Subscription, resourceGroupName: string, accessToken?: string, refreshToken?: string, password?: string, username?: string) {

        this.azureAccount = AzureAccount;
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


