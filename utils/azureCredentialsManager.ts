import { SubscriptionClient, ResourceManagementClient, SubscriptionModels } from 'azure-arm-resource';
import { AzureAccount } from '../typings/azure-account.api';
import { ServiceClientCredentials } from 'ms-rest';
import { AsyncPool } from '../utils/asyncpool';
import { ContainerRegistryManagementClient } from 'azure-arm-containerregistry';
import * as ContainerModels from '../node_modules/azure-arm-containerregistry/lib/models';
import { ResourceGroup, ResourceGroupListResult } from "azure-arm-resource/lib/resource/models";
import { MAX_CONCURRENT_SUBSCRIPTON_REQUESTS } from './constants';

/* Singleton for facilitating communication with Azure account services by providing extended shared
  functionality and extension wide access to azureAccount. Tool for internal use.
  Authors: Esteban Rey L, Jackson Stokes
*/

export class AzureCredentialsManager {

    //SETUP
    private static _instance: AzureCredentialsManager = new AzureCredentialsManager();
    private azureAccount: AzureAccount;

    private constructor() {
        AzureCredentialsManager._instance = this;
    }

    public static getInstance(): AzureCredentialsManager {
        if (!AzureCredentialsManager._instance) { // lazy initialization
            AzureCredentialsManager._instance = new AzureCredentialsManager();
        }
        return AzureCredentialsManager._instance;
    }

    //This function has to be called explicitly before using the singleton.
    public setAccount(azureAccount) {
        this.azureAccount = azureAccount;
    }

    //GETTERS
    public getAccount() {
        if (this.azureAccount) return this.azureAccount;
        throw ('Azure account is not present, you may have forgotten to call setAccount');
    }

    public getFilteredSubscriptionList(): SubscriptionModels.Subscription[] {
        return this.getAccount().filters.map<SubscriptionModels.Subscription>(filter => {
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

    public getContainerRegistryManagementClient(subscription: SubscriptionModels.Subscription): ContainerRegistryManagementClient {
        return new ContainerRegistryManagementClient(this.getCredentialByTenantId(subscription.tenantId), subscription.subscriptionId);
    }

    public getResourceManagementClient(subscription: SubscriptionModels.Subscription): ResourceManagementClient {
        return new ResourceManagementClient(this.getCredentialByTenantId(subscription.tenantId), subscription.subscriptionId);
    }

    public async getRegistries(subscription?: SubscriptionModels.Subscription, resourceGroup?: string, sortFunction?): Promise<ContainerModels.Registry[]> {
        let registries: ContainerModels.Registry[] = [];

        if (subscription && resourceGroup) {
            //Get all registries under one resourcegroup
            const client = this.getContainerRegistryManagementClient(subscription);
            registries = await client.registries.listByResourceGroup(resourceGroup);

        } else if (subscription) {
            //Get all registries under one subscription
            const client = this.getContainerRegistryManagementClient(subscription);
            registries = await client.registries.list();

        } else {
            //Get all registries for all subscriptions
            const subs: SubscriptionModels.Subscription[] = this.getFilteredSubscriptionList();
            const subPool = new AsyncPool(MAX_CONCURRENT_SUBSCRIPTON_REQUESTS);

            for (let i = 0; i < subs.length; i++) {
                subPool.addTask(async () => {
                    const client = this.getContainerRegistryManagementClient(subs[i]);
                    let subscriptionRegistries: ContainerModels.Registry[] = await client.registries.list();
                    registries = registries.concat(subscriptionRegistries);
                });
            }
            await subPool.runAll();
        }

        if (sortFunction && registries.length > 1) {
            registries.sort(sortFunction);
        }

        return registries;
    }

    public async getResourceGroups(subscription?: SubscriptionModels.Subscription): Promise<ResourceGroup[]> {
        if (subscription) {
            const resourceClient = this.getResourceManagementClient(subscription);
            return await resourceClient.resourceGroups.list();
        }
        const subs = this.getFilteredSubscriptionList();
        const subPool = new AsyncPool(MAX_CONCURRENT_SUBSCRIPTON_REQUESTS);
        let resourceGroups: ResourceGroup[] = [];
        //Acquire each subscription's data simultaneously
        for (let i = 0; i < subs.length; i++) {
            subPool.addTask(async () => {
                const resourceClient = this.getResourceManagementClient(subs[i]);
                const internalGroups = await resourceClient.resourceGroups.list();
                resourceGroups = resourceGroups.concat(internalGroups);
            });
        }
        await subPool.runAll();
        return resourceGroups;
    }

    public getCredentialByTenantId(tenantId: string): ServiceClientCredentials {

        const session = this.getAccount().sessions.find((azureSession) => azureSession.tenantId.toLowerCase() === tenantId.toLowerCase());

        if (session) {
            return session.credentials;
        }

        throw new Error(`Failed to get credentials, tenant ${tenantId} not found.`);
    }

    //CHECKS
    //Provides a unified check for login that should be called once before using the rest of the singletons capabilities
    public async isLoggedIn(): Promise<boolean> {
        if (!this.azureAccount) {
            return false;
        }
        return await this.azureAccount.waitForLogin();
    }
}
