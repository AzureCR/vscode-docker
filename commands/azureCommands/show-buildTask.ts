import { BuildTaskNode } from "../../explorer/models/taskNode";
const teleCmdId: string = 'showBuildTaskPropoerties';
import vscode = require('vscode');
import { quickPickACRRegistry, quickPickBuildTask, quickPickResourceGroup, quickPickSubscription } from '../utils/quick-pick-azure';

export async function showBuildTaskProperties(context?: BuildTaskNode): Promise<any> {
    const terminal = vscode.window.createTerminal("Docker");

    if (context) {
        console.log("right click");
        terminal.show();
        //terminal.sendText(`az acr build-task show -n ${context.label} -r ${}`);
    } else {
        console.log("input bar");
        let subscription = await quickPickSubscription();
        let resourceGroup = await quickPickResourceGroup();
        let registry = await quickPickACRRegistry();
        let buildTask = await quickPickBuildTask(registry, subscription, resourceGroup);
        terminal.show();
        terminal.sendText(`az acr build-task show -n ${buildTask.name} -r ${registry.name}`);

    }

}
