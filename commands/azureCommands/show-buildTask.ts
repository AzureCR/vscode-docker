import { Registry } from "azure-arm-containerregistry/lib/models";
import { ResourceGroup } from "azure-arm-resource/lib/resource/models";
import { Subscription } from "azure-arm-resource/lib/subscription/models";
import { BuildTaskNode } from "../../explorer/models/taskNode";
import { getResourceGroupName } from "../../utils/Azure/acrTools";
import { AzureUtilityManager } from "../../utils/azureUtilityManager";
import { quickPickACRRegistry, quickPickBuildTask, quickPickSubscription } from '../utils/quick-pick-azure';
import { openTask } from "./task-utils/showTaskManager";

export async function showBuildTaskProperties(context?: BuildTaskNode): Promise<any> {
    let subscription: Subscription;
    let registry: Registry;
    let resourceGroup: ResourceGroup;
    let buildTask: string;

    if (context) { // Right click
        subscription = context.susbscription;
        registry = context.registry;
        resourceGroup = await getResourceGroup(registry, subscription);
        buildTask = context.label;
    } else { // Command palette
        subscription = await quickPickSubscription();
        registry = await quickPickACRRegistry();
        resourceGroup = await getResourceGroup(registry, subscription);
        buildTask = (await quickPickBuildTask(registry, subscription, resourceGroup)).name;
    }

    const client = AzureUtilityManager.getInstance().getContainerRegistryManagementClient(subscription);
    let item: any = await client.buildTasks.get(resourceGroup.name, registry.name, buildTask);
    let steps = await client.buildSteps.get(resourceGroup.name, registry.name, buildTask, `${buildTask}StepName`);
    item.properties = steps;
    openTask(JSON.stringify(item, undefined, 1), buildTask);
}

async function getResourceGroup(registry: Registry, subscription: Subscription): Promise<ResourceGroup> { ///to do: move to acr tools
    let resourceGroups: ResourceGroup[] = await AzureUtilityManager.getInstance().getResourceGroups(subscription);
    const resourceGroupName = getResourceGroupName(registry);
    return resourceGroups.find((res) => { return res.name === resourceGroupName });
}
