import { Registry } from "azure-arm-containerregistry/lib/models";
import { SubscriptionModels } from 'azure-arm-resource';
import request = require('request-promise');
import * as vscode from "vscode";
import { AzureRepositoryNode } from '../../explorer/models/AzureRegistryNodes';
const teleCmdId: string = 'vscode-docker.deleteRepository';
import * as quickPicks from '../../commands/utils/quick-pick-azure';
import * as acrTools from '../../utils/Azure/acrTools';
import { Repository } from "../../utils/Azure/models/repository";

/**
 * function to delete an Azure repository and its associated images
 * @param context : if called through right click on AzureRepositoryNode, the node object will be passed in. See azureRegistryNodes.ts for more info
 */
export async function deleteRepository(context?: AzureRepositoryNode): Promise<void> {

    let registry: Registry;
    let subscription: SubscriptionModels.Subscription;
    let repoName: string;
    let username: string;
    let password: string;
    if (!context) {
        registry = await quickPicks.quickPickACRRegistry();
        subscription = acrTools.getRegistrySubscription(registry);
        let repository: Repository = await quickPicks.quickPickACRRepository(registry);
        repoName = repository.name;
    }

    //ensure user truly wants to delete registry
    let opt: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        placeHolder: 'No',
        value: 'No',
        prompt: 'Are you sure you want to delete this repository and its associated images? Enter Yes to continue: '
    };
    let answer = await vscode.window.showInputBox(opt);
    answer = answer.toLowerCase();
    if (answer !== 'yes') { return; }

    // generate credentials before requesting a delete.
    if (context) {
        username = context.userName;
        password = context.password;
        repoName = context.label;
        subscription = context.subscription;
        registry = context.registry;
    } else { //this is separated from !context above so it only calls loginCredentials once user has assured they want to delete the repository
        let creds = await acrTools.loginCredentials(subscription, registry);
        username = creds.username;
        password = creds.password;
    }
    let path = `/v2/_acr/${repoName}/repository`;
    await acrTools.sendRequestToRegistry('delete', registry.loginServer, path, username, password);
}
