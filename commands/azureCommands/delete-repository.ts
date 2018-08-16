import { Registry } from "azure-arm-containerregistry/lib/models";
import * as vscode from "vscode";
import { UserCancelledError } from "../../explorer/deploy/wizard";
import { AzureRepositoryNode } from '../../explorer/models/AzureRegistryNodes';
import { reporter } from '../../telemetry/telemetry';
import * as acrTools from '../../utils/Azure/acrTools';
import { Repository } from "../../utils/Azure/models/repository";
import { confirmUserIntent, quickPickACRRegistry, quickPickACRRepository } from '../utils/quick-pick-azure';

const teleCmdId: string = 'vscode-docker.delete-ACR-Repository';
/**
 * function to delete an Azure repository and its associated images
 * @param context : if called through right click on AzureRepositoryNode, the node object will be passed in. See azureRegistryNodes.ts for more info
 */
export async function deleteRepository(context?: AzureRepositoryNode): Promise<void> {

    let registry: Registry;
    let repoName: string;

    if (context) {
        repoName = context.label;
        registry = context.registry;
    } else {
        registry = await quickPickACRRegistry();
        const repository: Repository = await quickPickACRRepository(registry, 'Choose the Repository you want to delete');
        repoName = repository.name;
    }
    const shouldDelete = await confirmUserIntent('Are you sure you want to delete this repository and its associated images? Enter yes to continue: ');
    if (shouldDelete) {
        const { acrAccessToken } = await acrTools.acquireACRAccessTokenFromRegistry(registry, `repository:${repoName}:*`);
        const path = `/v2/_acr/${repoName}/repository`;
        await acrTools.sendRequestToRegistry('delete', registry.loginServer, path, acrAccessToken);
        vscode.window.showInformationMessage(`Successfully deleted repository ${Repository}`);
    } else {
        throw new UserCancelledError();
    }
    if (reporter) {
        reporter.sendTelemetryEvent('command', {
            command: teleCmdId
        });
    }
}
