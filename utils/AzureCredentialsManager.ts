import { SubscriptionClient, ResourceManagementClient, SubscriptionModels } from 'azure-arm-resource';
import { AzureAccount } from '../typings/azure-account.api';
import { ServiceClientCredentials } from 'ms-rest';
import { AsyncPool } from '../utils/asyncpool';
import { ContainerRegistryManagementClient } from 'azure-arm-containerregistry';
import { AzureAccountWrapper } from '.././explorer/deploy/azureAccountWrapper';
import { RegistryRootNode } from "../explorer/models/registryRootNode";
import { RegistryNameStatus } from "azure-arm-containerregistry/lib/models";
import { ResourceGroup, ResourceGroupListResult } from "azure-arm-resource/lib/resource/models";

const MAX_CONCURRENT_REQUESTS = 8;
const MAX_CONCURRENT_SUBSCRIPTON_REQUESTS = 5;

export class AzureCredentialsManager {

    private static _instance: AzureCredentialsManager = new AzureCredentialsManager();
    private azureAccount: AzureAccount;
    constructor() {
        if (AzureCredentialsManager._instance) {
            throw new Error("Error: Instantiation failed: Use SingletonClass.getInstance() instead of new.");
        }
        AzureCredentialsManager._instance = this;
    }

    public static getInstance(): AzureCredentialsManager {
        return AzureCredentialsManager._instance;
    }

    public setAccount(azureAccount) {
        this.azureAccount = azureAccount;
    }

    public getFilteredSubscriptionList(): SubscriptionModels.Subscription[] {
        return this.azureAccount.filters.map<SubscriptionModels.Subscription>(filter => {
            return {
                id: filter.subscription.id,
                session: filter.session,
                subscriptionId: filter.subscription.subscriptionId,
                tenantId: filter.session.tenantId,
                displayName: filter.subscription.displayName,
                state: filter.subscription.state,
                subscriptionPolicies: filter.subscription.subscriptionPolicies,
                authorizationSource: filter.subscription.authorizationSource
            };
        });
    }

    public getRegistries() {

    }

    public async getResourceGroups(subscription?: SubscriptionModels.Subscription): Promise<ResourceGroup[]> {
        if (subscription) {
            const resourceClient = new ResourceManagementClient(this.getCredentialByTenantId(subscription.tenantId, this.azureAccount), subscription.subscriptionId);
            return await resourceClient.resourceGroups.list();
        }
        const subs = this.getFilteredSubscriptionList();
        const subPool = new AsyncPool(MAX_CONCURRENT_SUBSCRIPTON_REQUESTS);
        let resourceGroups: ResourceGroup[] = [];
        //Acquire each subscription's data simultaneously
        for (let i = 0; i < subs.length; i++) {
            subPool.addTask(async () => {
                const resourceClient = new ResourceManagementClient(this.getCredentialByTenantId(subscription.tenantId, this.azureAccount), subscription.subscriptionId);
                const internalGroups = await resourceClient.resourceGroups.list();
                resourceGroups.concat(resourceGroups);
            });
        }
        await subPool.runAll();
        return resourceGroups;
    }

    private getCredentialByTenantId(tenantId: string, azureAccount: AzureAccount): ServiceClientCredentials {

        const session = azureAccount.sessions.find((s, i, array) => s.tenantId.toLowerCase() === tenantId.toLowerCase());

        if (session) {
            return session.credentials;
        }

        throw new Error(`Failed to get credentials, tenant ${tenantId} not found.`);
    }
}
