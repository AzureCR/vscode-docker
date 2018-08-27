import { BuildTaskNode } from "../../explorer/models/taskNode";
const teleCmdId: string = 'vscode-docker.showBuildTaskProperties';
import vscode = require('vscode');
import { quickPickACRRegistry, quickPickBuildTask, quickPickResourceGroup, quickPickSubscription } from '../utils/quick-pick-azure';

export async function showBuildTaskProperties(context?: BuildTaskNode): Promise<any> {
    const terminal = vscode.window.createTerminal("Docker");
    let command: string;

    //to do: make it show up in json file

    if (context) { // Right click
        command = `az acr build-task show -n ${context.label} -r ${context.registry.name}`;
    } else { // Command palette
        let subscription = await quickPickSubscription();
        let resourceGroup = await quickPickResourceGroup();
        let registry = await quickPickACRRegistry();
        let buildTask = await quickPickBuildTask(registry, subscription, resourceGroup); ///to do: dont ask for res group
        command = `az acr build-task show -n ${buildTask.name} -r ${registry.name}`;

    }
    terminal.show();
    terminal.sendText(command);

}
