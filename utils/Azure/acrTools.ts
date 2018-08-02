import { Registry } from "azure-arm-containerregistry/lib/models";
import { SubscriptionModels } from 'azure-arm-resource';
import request = require('request-promise');
import * as vscode from "vscode";
import { AzureImageNode, AzureRepositoryNode } from '../../explorer/models/AzureRegistryNodes';
import * as azureUtils from '../../explorer/utils/azureUtils';
import { AzureImage, getSub, Repository } from "../../explorer/utils/azureUtils";
import { AzureAccount, AzureSession } from "../../typings/azure-account.api";
import { AzureCredentialsManager } from '../azureCredentialsManager';
const teleCmdId: string = 'vscode-docker.deleteAzureImage';

/**
 * Developers can use this to visualize and list repositories on a given Registry. This is not a command, just a developer tool.
 * @param registry : the registry whose repositories you want to see
 * @returns allRepos : an array of Repository objects that exist within the given registry
 */
export async function getAzureRepositories(registry: Registry): Promise<Repository[]> {
    const allRepos: Repository[] = [];
    let repo: Repository;
    let resourceGroup: string = registry.id.slice(registry.id.search('resourceGroups/') + 'resourceGroups/'.length, registry.id.search('/providers/'));
    const subscription = getSub(registry);
    let azureAccount: AzureAccount = AzureCredentialsManager.getInstance().getAccount();
    if (!azureAccount) {
        return [];
    }
    const { accessToken, refreshToken } = await getTokens(registry);
    if (accessToken && refreshToken) {

        await request.get('https://' + registry.loginServer + '/v2/_catalog', {
            auth: {
                bearer: accessToken
            }
        }, (err, httpResponse, body) => {
            if (body.length > 0) {
                const repositories = JSON.parse(body).repositories;
                for (let tempRepo of repositories) {
                    repo = new Repository(registry, tempRepo, accessToken, refreshToken);
                    allRepos.push(repo);
                }
            }
        });
    }
    //Note these are ordered by default in alphabetical order
    return allRepos;
}

/**
 * @param registry : the registry to get credentials for
 * @returns : the updated refresh and access tokens which can be used to generate a header for an API call
 */
export async function getTokens(registry: Registry): Promise<{ refreshToken: any, accessToken: any }> {
    const subscription = getSub(registry);
    const tenantId: string = subscription.tenantId;
    let azureAccount: AzureAccount = AzureCredentialsManager.getInstance().getAccount();

    const session: AzureSession = azureAccount.sessions.find((s, i, array) => s.tenantId.toLowerCase() === tenantId.toLowerCase());
    const { accessToken, refreshToken } = await acquireToken(session);

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
    vscode.window.showErrorMessage('Could not generate tokens');
}

export async function acquireToken(localSession: AzureSession): Promise<{ accessToken: string; refreshToken: string; }> {
    return new Promise<{ accessToken: string; refreshToken: string; }>((resolve, reject) => {
        const credentials: any = localSession.credentials;
        const environment: any = localSession.environment;
        // tslint:disable-next-line:no-function-expression // Grandfathered in
        credentials.context.acquireToken(environment.activeDirectoryResourceId, credentials.username, credentials.clientId, function (err: any, result: { accessToken: string; refreshToken: string; }): void {
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
 * function used to create header for http request to acr
 */
export function _get_authorization_header(username: string, password: string): string {
    let auth = ('Basic ' + (encode(username + ':' + password).trim()));
    return (auth);
}

/**
 * first encodes to base 64, and then to latin1. See online documentation to see typescript encoding capabilities
 * see https://nodejs.org/api/buffer.html#buffer_buf_tostring_encoding_start_end for details {Buffers and Character Encodings}
 * current character encodings include: ascii, utf8, utf16le, ucs2, base64, latin1, binary, hex. Version v6.4.0
 * @param str : the string to encode for api URL purposes
 */
export function encode(str: string): string {
    let bufferB64 = new Buffer(str);
    let bufferLat1 = new Buffer(bufferB64.toString('base64'));
    return bufferLat1.toString('latin1');
}

/**
 * Lots of https requests but they must be separate from getTokens because the forms are different
 * @param element the repository where the desired images are
 * @returns a list of AzureImage objects from the given repository (see azureUtils.ts)
 */
export async function getImages(element: Repository): Promise<AzureImage[]> {
    let allImages: AzureImage[] = [];
    let image: AzureImage;
    let tags;
    let azureAccount: AzureAccount = AzureCredentialsManager.getInstance().getAccount();
    let tenantId: string = element.subscription.tenantId;
    let refreshTokenARC;
    let accessTokenARC;
    const session: AzureSession = azureAccount.sessions.find((s, i, array) => s.tenantId.toLowerCase() === tenantId.toLowerCase());
    const { accessToken, refreshToken } = await acquireToken(session);
    if (accessToken && refreshToken) {
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

        for (let tag of tags) {
            image = new AzureImage(element, tag);
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
export async function loginCredentials(subscription: SubscriptionModels.Subscription, registry: Registry, context?: AzureImageNode | AzureRepositoryNode): Promise<{ password: string, username: string }> {
    let node: AzureImageNode | AzureRepositoryNode;
    if (context) {
        node = context;
    }
    let username: string;
    let password: string;
    const client = AzureCredentialsManager.getInstance().getContainerRegistryManagementClient(subscription);
    const resourceGroup: string = registry.id.slice(registry.id.search('resourceGroups/') + 'resourceGroups/'.length, registry.id.search('/providers/'));
    if (context) {
        username = node.userName;
        password = node.password;
    } else if (registry.adminUserEnabled) {
        let creds = await client.registries.listCredentials(resourceGroup, registry.name);
        password = creds.passwords[0].value;
        username = creds.username;
    } else {
        //grab the access token to be used as a password, and a generic username
        let creds = await getTokens(registry);
        password = creds.accessToken;
        username = '00000000-0000-0000-0000-000000000000';
    }
    return { password, username };
}
