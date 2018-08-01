import { SubscriptionClient, ResourceManagementClient, SubscriptionModels } from 'azure-arm-resource';
import { AzureAccount, AzureSession } from '../typings/azure-account.api';
import { ServiceClientCredentials } from 'ms-rest';
import { AsyncPool } from '../utils/asyncpool';
import { ContainerRegistryManagementClient } from 'azure-arm-containerregistry';
import * as ContainerModels from '../node_modules/azure-arm-containerregistry/lib/models';
import { ResourceGroup, ResourceGroupListResult } from "azure-arm-resource/lib/resource/models";
import { MAX_CONCURRENT_SUBSCRIPTON_REQUESTS } from './constants';
import { AzureRepositoryNode, AzureImageNode, AzureRegistryNode } from '../explorer/models/azureRegistryNodes';
import { Registry } from 'azure-arm-containerregistry/lib/models';
import request = require('request-promise');
import { Repository, AzureImage, getSub } from '../explorer/utils/azureUtils';
/* Singleton for facilitating communication with Azure account services by providing extended shared
  functionality and extension wide access to azureAccount. Tool for internal use.
  Authors: Esteban Rey L, Jackson Stokes, Julia Lieberman
*/

export class AzureCredentialsManager {

    //SETUP
    private static _instance: AzureCredentialsManager;
    private azureAccount: AzureAccount;

    private constructor() { }

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


    /**
     * Developers can use this to visualize and list repositories on a given Registry. This is not a command, just a developer tool.
     * @param registry : the registry whose repositories you want to see
     * @returns allRepos : an array of Repository objects that exist within the given registry
     */
    public async getAzureRepositories(registry: Registry): Promise<Repository[]> {
        const allRepos: Repository[] = [];
        let repo: Repository;
        let resourceGroup: string = registry.id.slice(registry.id.search('resourceGroups/') + 'resourceGroups/'.length, registry.id.search('/providers/'));
        const subscription = getSub(registry);
        let azureAccount: AzureAccount = AzureCredentialsManager.getInstance().getAccount();
        if (!azureAccount) {
            return [];
        }
        const { accessToken, refreshToken } = await this.getTokens(registry);
        if (accessToken && refreshToken) {

            await request.get('https://' + registry.loginServer + '/v2/_catalog', {
                auth: {
                    bearer: accessToken
                }
            }, (err, httpResponse, body) => {
                if (body.length > 0) {
                    const repositories = JSON.parse(body).repositories;
                    for (let i = 0; i < repositories.length; i++) {
                        repo = new Repository(azureAccount, registry, repositories[i], subscription, resourceGroup, accessToken, refreshToken);
                        allRepos.push(repo);
                    }
                }
            });
        }
        //Note these are ordered by default in alphabetical order
        return allRepos;
    }


    /**
* this function gets the refresh and access tokens for a given registry
* @param registry : the registry to get credentials for
* @returns : the updated refresh and access tokens which can be used to generate a header for an API call
*/
    public async getTokens(registry: Registry): Promise<{ refreshToken: any, accessToken: any }> {
        const subscription = getSub(registry);
        const tenantId: string = subscription.tenantId;
        let azureAccount: AzureAccount = this.getAccount();
        if (!azureAccount) {
            return;
        }

        const session: AzureSession = azureAccount.sessions.find((s, i, array) => s.tenantId.toLowerCase() === tenantId.toLowerCase());
        const { accessToken, refreshToken } = await this.acquireToken(session);

        //regenerates in case they have expired
        if (accessToken && refreshToken) {
            let refreshTokenARC;
            let accessTokenARC;

            await request.post('https://' + registry.loginServer + '/oauth2/exchange', {
                form: {
                    grant_type: 'access_token_refresh_token',
                    service: registry.loginServer,
                    tenant: tenantId,
                    refresh_token: refreshToken,
                    access_token: accessToken
                }
            }, (err, httpResponse, body) => {
                if (body.length > 0) {
                    refreshTokenARC = JSON.parse(body).refresh_token;
                } else {
                    return;
                }
            });

            await request.post('https://' + registry.loginServer + '/oauth2/token', {
                form: {
                    grant_type: 'refresh_token',
                    service: registry.loginServer,
                    scope: 'registry:catalog:*',
                    refresh_token: refreshTokenARC
                }
            }, (err, httpResponse, body) => {
                if (body.length > 0) {
                    accessTokenARC = JSON.parse(body).access_token;
                } else {
                    return;
                }
            });
            if (refreshTokenARC && accessTokenARC) {
                return { 'refreshToken': refreshTokenARC, 'accessToken': accessTokenARC };
            }
        }
        return { refreshToken, accessToken }
    }

    public async acquireToken(session: AzureSession) {
        return new Promise<{ accessToken: string; refreshToken: string; }>((resolve, reject) => {
            const credentials: any = session.credentials;
            const environment: any = session.environment;
            credentials.context.acquireToken(environment.activeDirectoryResourceId, credentials.username, credentials.clientId, function (err: any, result: any) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        accessToken: result.accessToken,
                        refreshToken: result.refreshToken
                    });
                }
            });
        });
    }

    /**
         *
         * @param username : username for creating header
         * @param password : password for creating header
         */
    public _get_authorization_header(username: string, password: string): string {
        let auth = ('Basic ' + (this.encode(username + ':' + password).trim()));
        return (auth);
    }

    /**
 * first encodes to base 64, and then to latin1. See online documentation to see typescript encoding capabilities
 * see https://nodejs.org/api/buffer.html#buffer_buf_tostring_encoding_start_end for details {Buffers and Character Encodings}
 * current character encodings include: ascii, utf8, utf16le, ucs2, base64, latin1, binary, hex. Version v6.4.0
 * @param str : the string to encode for api URL purposes
 */
    public encode(str: string): string {
        let bufferB64 = new Buffer(str);
        let bufferLat1 = new Buffer(bufferB64.toString('base64'));
        return bufferLat1.toString('latin1');
    }

    /**
     * Lots of https requests but they must be separate from getTokens because the forms are different
     * @param element the repository where the desired images are
     * @returns a list of AzureImage objects from the given repository (see azureUtils.ts)
     */
    public async getImages(element: Repository): Promise<AzureImage[]> {
        let allImages: AzureImage[] = [];
        let image: AzureImage;
        let tags;
        let azureAccount: AzureAccount = this.getAccount();
        let tenantId: string = element.subscription.tenantId;
        let refreshTokenARC;
        let accessTokenARC;
        const session: AzureSession = azureAccount.sessions.find((s, i, array) => s.tenantId.toLowerCase() === tenantId.toLowerCase());
        const { accessToken, refreshToken } = await this.acquireToken(session);
        console.log(element);
        if (accessToken && refreshToken) {
            const tenantId = element.subscription.tenantId;

            await request.post('https://' + element.registry.loginServer + '/oauth2/exchange', {
                form: {
                    grant_type: 'access_token_refresh_token',
                    service: element.registry.loginServer,
                    tenant: tenantId,
                    refresh_token: refreshToken,
                    access_token: accessToken
                }
            }, (err, httpResponse, body) => {
                if (body.length > 0) {
                    refreshTokenARC = JSON.parse(body).refresh_token;
                } else {
                    return [];
                }
            });

            await request.post('https://' + element.registry.loginServer + '/oauth2/token', {
                form: {
                    grant_type: 'refresh_token',
                    service: element.registry.loginServer,
                    scope: 'repository:' + element.name + ':pull',
                    refresh_token: refreshTokenARC
                }
            }, (err, httpResponse, body) => {
                if (body.length > 0) {
                    accessTokenARC = JSON.parse(body).access_token;
                } else {
                    return [];
                }
            });

            await request.get('https://' + element.registry.loginServer + '/v2/' + element.name + '/tags/list', {
                auth: {
                    bearer: accessTokenARC
                }
            }, (err, httpResponse, body) => {
                if (err) { return []; }

                if (body.length > 0) {
                    tags = JSON.parse(body).tags;
                }
            });

            for (let i = 0; i < tags.length; i++) {
                image = new AzureImage(azureAccount, element.registry, element, tags[i], element.subscription, element.resourceGroupName, accessTokenARC, refreshTokenARC, element.password, element.username);
                allImages.push(image);
            }
        }
        return allImages;
    }

    //Implements new Service principal model for ACR container registries while maintaining old admin enabled use
    /**
     * this function implements a new Service principal model for ACR and gets the valid login credentials to make an API call
     * @param subscription : the subscription the registry is on
     * @param registry : the registry to get login credentials for
     * @param context : if command is invoked through a right click on an AzureRepositoryNode. This context has a password and username
     */
    public async loginCredentials(subscription, registry, context?: AzureImageNode | AzureRepositoryNode): Promise<{ password: string, username: string }> {
        let node: AzureImageNode | AzureRepositoryNode;
        if (context) {
            node = context;
        }
        let username: string;
        let password: string;
        const client = this.getContainerRegistryManagementClient(subscription);
        const resourceGroup: string = registry.id.slice(registry.id.search('resourceGroups/') + 'resourceGroups/'.length, registry.id.search('/providers/'));
        if (context) {
            username = node.userName;
            password = node.password;
        }
        else if (registry.adminUserEnabled) {
            let creds = await client.registries.listCredentials(resourceGroup, registry.name);
            password = creds.passwords[0].value;
            username = creds.username;
        }
        else {
            //grab the access token to be used as a password, and a generic username
            let creds = await this.getTokens(registry);
            password = creds.accessToken;
            username = '00000000-0000-0000-0000-000000000000';
        }
        return { password, username };
    }
}
