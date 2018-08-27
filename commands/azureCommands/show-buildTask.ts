import { BuildTaskNode } from "../../explorer/models/taskNode";
const teleCmdId: string = 'vscode-docker.showBuildTaskProperties';
import vscode = require('vscode');
import { quickPickACRRegistry, quickPickBuildTask, quickPickResourceGroup, quickPickSubscription } from '../utils/quick-pick-azure';

export async function showBuildTaskProperties(context?: BuildTaskNode): Promise<any> {
    const terminal = vscode.window.createTerminal("Docker");
    let command: string;

    if (context) {
        console.log(context);
        console.log("right click");

        //terminal.show();
        // terminal.sendText("cd");
        console.log(context.label);
        console.log(context.registry.name);
        command = `az acr build-task show -n ${context.label} -r ${context.registry.name}`;
    } else {
        console.log("input bar");
        let subscription = await quickPickSubscription();
        let resourceGroup = await quickPickResourceGroup();
        let registry = await quickPickACRRegistry();
        let buildTask = await quickPickBuildTask(registry, subscription, resourceGroup); //dont ask for res group
        //terminal.show();
        command = `az acr build-task show -n ${buildTask.name} -r ${registry.name}`;

    }
    terminal.show();
    terminal.sendText(command);

}
