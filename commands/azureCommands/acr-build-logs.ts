import { Build, Registry } from "azure-arm-containerregistry/lib/models";
import { Subscription } from "azure-arm-resource/lib/subscription/models";
import * as vscode from "vscode";
import { AzureImageNode, AzureRegistryNode, AzureRepositoryNode } from '../../explorer/models/azureRegistryNodes';
import { getResourceGroupName, getSubscriptionFromRegistry } from '../../utils/Azure/acrTools';
import { AzureUtilityManager } from '../../utils/azureUtilityManager';
import { quickPickACRRegistry } from '../utils/quick-pick-azure'
import { accessLog } from "./acr-build-logs-utils/logFileManager";
import { LogData } from "./acr-build-logs-utils/tableDataManager";
import { LogTableWebview } from "./acr-build-logs-utils/tableViewManager";

/**  This command is used through a right click on an azure registry, repository or image in the Docker Explorer. It is used to view build logs for a given item. */
export async function viewBuildLogs(context: AzureRegistryNode | AzureRepositoryNode | AzureImageNode): Promise<void> {
    let registry: Registry;
    let subscription: Subscription;
    if (!context) {
        registry = await quickPickACRRegistry();
        if (!registry) { return; }
        subscription = getSubscriptionFromRegistry(registry);
    } else {
        registry = context.registry;
        subscription = context.subscription;
    }
    let resourceGroup: string = getResourceGroupName(registry);
    const client = AzureUtilityManager.getInstance().getContainerRegistryManagementClient(subscription);
    let logData: LogData = new LogData(client, registry, resourceGroup);

    const filterFunction = context ? getFilterFunction(context) : undefined;
    await logData.loadMoreLogs(filterFunction);
    if (logData.logs.length === 0) {
        let itemType: string;
        if (context && context instanceof AzureRepositoryNode) {
            itemType = 'repository';
        } else if (context && context instanceof AzureImageNode) {
            itemType = 'image';
        } else {
            itemType = 'registry';
        }
        vscode.window.showInformationMessage(`This ${itemType} has no associated build logs`);

    } else if (context && context instanceof AzureImageNode) {
        logData.getLink(0).then((url) => {
            if (url !== 'requesting') {
                accessLog(url, logData.logs[0].buildId, false);
            }
        });

    } else {
        let webViewTitle: string = registry.name;
        if (context instanceof AzureRepositoryNode) {
            webViewTitle += (context ? '/' + context.label : '');
        }
        let webview = new LogTableWebview(webViewTitle, logData);
    }
}

/** Obtains a function to filter logs to a single repository/image */
function getFilterFunction(context: AzureRegistryNode | AzureRepositoryNode | AzureImageNode): (logEntry: Build) => boolean {
    if (context instanceof AzureRegistryNode) {
        return undefined;
    } else if (context instanceof AzureRepositoryNode) {
        return (logEntry: Build) => {
            if (!logEntry.outputImages) {
                return false;
            } else if (logEntry.outputImages.length === 0) {
                return false;
            } else if (logEntry.outputImages.find((imgDescriptor) => {
                if (!imgDescriptor) { return false; }
                return imgDescriptor.repository === context.label;
            })) {
                return true
            } else {
                return false;
            }
        }
    } else {
        const tag: string = context.label.slice(context.label.search(':') + 1);
        return (logEntry: Build) => {
            if (!logEntry.outputImages) {
                return false;
            } else if (logEntry.outputImages.length === 0) {
                return false;
            } else if (logEntry.outputImages.find((imgDescriptor) => {
                if (!imgDescriptor) { return false; }
                return imgDescriptor.tag === tag;
            })) {
                return true
            } else {
                return false;
            }
        }
    }
}
