import { BuildTaskNode } from "../../explorer/models/taskNode";
const teleCmdId: string = 'vscode-docker.showBuildTaskProperties';
import { Registry } from "azure-arm-containerregistry/lib/models";
import { ResourceGroup } from "azure-arm-resource/lib/resource/models";
import { Subscription } from "azure-arm-resource/lib/subscription/models";
import vscode = require('vscode');
import { getResourceGroupName } from "../../utils/Azure/acrTools";
import { AzureUtilityManager } from "../../utils/azureUtilityManager";
import { quickPickACRRegistry, quickPickBuildTask, quickPickResourceGroup, quickPickSubscription } from '../utils/quick-pick-azure';

export async function showBuildTaskProperties(context?: BuildTaskNode): Promise<any> {
    const terminal = vscode.window.createTerminal("Docker");
    let command: string;
    let subscription: Subscription;

    //to do: make it show up in json file

    if (context) { // Right click
        command = `az acr build-task show -n ${context.label} -r ${context.registry.name}`;

    } else { // Command palette
        subscription = await quickPickSubscription();
        let registry: Registry = await quickPickACRRegistry();

        let resourceGroups: ResourceGroup[] = await AzureUtilityManager.getInstance().getResourceGroups(subscription);
        const resourceGroupName = getResourceGroupName(registry);
        const resourceGroup = resourceGroups.find((res) => { return res.name === resourceGroupName });
        let buildTask = await quickPickBuildTask(registry, subscription, resourceGroup);

        //converting from build_task.py Converting to not use CLI
        const client = AzureUtilityManager.getInstance().getContainerRegistryManagementClient(subscription);
        let item: any = await client.buildTasks.get(resourceGroup.name, registry.name, buildTask.name);
        let steps = await client.buildSteps.get(resourceGroup.name, registry.name, buildTask.name, `${buildTask.name}StepName`);
        item.properties = steps;
        console.log(JSON.stringify(item));

    }

    terminal.show();
    terminal.sendText(command);
}
