import { Registry } from "azure-arm-containerregistry/lib/models";
import { SubscriptionModels } from 'azure-arm-resource';
import request = require('request-promise');
import { NULL_GUID } from "../../constants";
import { Subscription } from "../../node_modules/azure-arm-resource/lib/subscription/models";
import { AzureSession } from "../../typings/azure-account.api";
import { AzureImage } from "../Azure/models/image";
import { Repository } from "../Azure/models/Repository";
import { AzureUtilityManager } from '../azureUtilityManager';

//General helpers
/**
 * @param registry gets the subscription for a given registry
 * @returns a subscription object
 */
export function getSubscriptionFromRegistry(registry: Registry): SubscriptionModels.Subscription {
    let subscriptionId = registry.id.slice('/subscriptions/'.length, registry.id.search('/resourceGroups/'));
    const subs = AzureUtilityManager.getInstance().getFilteredSubscriptionList();
    let subscription = subs.find((sub): boolean => {
        return sub.subscriptionId === subscriptionId;
    });
    return subscription;
}
export function getResourceGroupName(registry: Registry): any {
    return registry.id.slice(registry.id.search('resourceGroups/') + 'resourceGroups/'.length, registry.id.search('/providers/'));
}

//Registry item management
/** List images under a specific Repository */
export async function getImagesByRepository(element: Repository): Promise<AzureImage[]> {
    let allImages: AzureImage[] = [];
    let image: AzureImage;
    let tags: string[];
    const { acrAccessToken } = await acquireACRAccessTokenFromRegistry(element.registry, 'repository:' + element.name + ':pull');
    await request.get('https://' + element.registry.loginServer + '/v2/' + element.name + '/tags/list', {
        auth: {
            bearer: acrAccessToken
        }
    }, (err, httpResponse, body) => {
        if (err) { throw (err) }
        if (body.length > 0) {
            tags = JSON.parse(body).tags;
        }
    });

    for (let tag of tags) {
        image = new AzureImage(element, tag);
        allImages.push(image);
    }
    return allImages;
}
/** List repositories on a given Registry. */
export async function getRepositoriesByRegistry(registry: Registry): Promise<Repository[]> {
    const allRepos: Repository[] = [];
    let repo: Repository;
    const { acrRefreshToken, acrAccessToken } = await acquireACRAccessTokenFromRegistry(registry, "registry:catalog:*");
    await request.get('https://' + registry.loginServer + '/v2/_catalog', {
        auth: {
            bearer: acrAccessToken
        }
    }, (err, httpResponse, body) => {
        if (body.length > 0) {
            const repositories = JSON.parse(body).repositories;
            for (let tempRepo of repositories) {
                repo = new Repository(registry, tempRepo, acrAccessToken, acrRefreshToken);
                allRepos.push(repo);
            }
        }
    });

    //Note these are ordered by default in alphabetical order
    return allRepos;
}
/** Sends a custon html request to a registry
 * @param http_method : the http method, this function currently only uses delete
 * @param login_server: the login server of the registry
 * @param path : the URL path
 * @param username : registry username, can be in generic form of 0's, used to generate authorization header
 * @param password : registry password, can be in form of accessToken, used to generate authorization header
 */
export async function sendRequestToRegistry(http_method: string, login_server: string, path: string, bearerAccessToken: string): Promise<any> {
    let url: string = `https://${login_server}${path}`;
    let header = 'Bearer ' + bearerAccessToken;
    let opt = {
        headers: { 'Authorization': header },
        http_method: http_method,
        url: url
    }
    if (http_method === 'delete') {
        await request.delete(opt);
    }
}

//Credential management
/** Obtains registry username and password compatible with docker login */
export async function loginCredentials(registry: Registry): Promise<{ password: string, username: string }> {
    const subscription: Subscription = getSubscriptionFromRegistry(registry);
    const session: AzureSession = AzureUtilityManager.getInstance().getSession(subscription)
    const { aadAccessToken, aadRefreshToken } = await acquireAADTokens(session);
    const acrRefreshToken = await acquireACRRefreshToken(registry.loginServer, session.tenantId, aadRefreshToken, aadAccessToken);
    return { 'password': acrRefreshToken, 'username': NULL_GUID };
}
/** Obtains tokens for using the Docker Registry v2 Api
 * @param registry The targeted Azure Container Registry
 * @param scope String determining the scope of the access token
 * @returns acrRefreshToken: For use as a Password for docker registry access , acrAccessToken: For use with docker API
 */
export async function acquireACRAccessTokenFromRegistry(registry: Registry, scope: string): Promise<{ acrRefreshToken: string, acrAccessToken: string }> {
    const subscription: Subscription = getSubscriptionFromRegistry(registry);
    const session: AzureSession = AzureUtilityManager.getInstance().getSession(subscription);
    const { aadAccessToken, aadRefreshToken } = await acquireAADTokens(session);
    const acrRefreshToken = await acquireACRRefreshToken(registry.loginServer, session.tenantId, aadRefreshToken, aadAccessToken);
    const acrAccessToken = await acquireACRAccessToken(registry.loginServer, scope, acrRefreshToken)
    return { acrRefreshToken, acrAccessToken };
}
/** Obtains refresh and access tokens for Azure Active Directory. */
export async function acquireAADTokens(session: AzureSession): Promise<{ aadAccessToken: string, aadRefreshToken: string }> {
    return new Promise<{ aadAccessToken: string, aadRefreshToken: string }>((resolve, reject) => {
        const credentials: any = session.credentials;
        const environment: any = session.environment;
        credentials.context.acquireToken(environment.activeDirectoryResourceId, credentials.username, credentials.clientId, (err: any, result: any) => {
            if (err) {
                reject(err);
            } else {
                resolve({
                    aadAccessToken: result.accessToken,
                    aadRefreshToken: result.refreshToken,
                });
            }
        });
    });
}
/** Obtains refresh tokens for Azure Container Registry. */
export async function acquireACRRefreshToken(registryUrl: string, tenantId: string, aadRefreshToken: string, aadAccessToken: string): Promise<string> {
    const acrRefreshTokenResponse = await request.post(`https://${registryUrl}/oauth2/exchange`, {
        form: {
            grant_type: "refresh_token",
            service: registryUrl,
            tenant: tenantId,
            refresh_token: aadRefreshToken,
            access_token: aadAccessToken,
        },
    });

    return JSON.parse(acrRefreshTokenResponse).refresh_token;

}
/** Gets an ACR accessToken by using an acrRefreshToken */
export async function acquireACRAccessToken(registryUrl: string, scope: string, acrRefreshToken: string): Promise<string> {
    const acrAccessTokenResponse = await request.post(`https://${registryUrl}/oauth2/token`, {
        form: {
            grant_type: "refresh_token",
            service: registryUrl,
            scope,
            refresh_token: acrRefreshToken,
        },
    });
    return JSON.parse(acrAccessTokenResponse).access_token;
}
