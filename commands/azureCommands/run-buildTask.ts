import { BuildTaskNode } from "../../explorer/models/taskNode";
const teleCmdId: string = 'runBuildTask';
import vscode = require('vscode');
import { quickPickACRRegistry, quickPickBuildTask, quickPickResourceGroup, quickPickSubscription } from '../utils/quick-pick-azure';

export async function runBuildTask(context?: BuildTaskNode): Promise<any> {
    const terminal = vscode.window.createTerminal("Docker");
    let command: string;

    if (context) { // Right Click
        command = `az acr build-task run -n ${context.label} -r ${context.registry.name}`;
    } else { // Command Palette
        let subscription = await quickPickSubscription();
        let resourceGroup = await quickPickResourceGroup();
        let registry = await quickPickACRRegistry();
        let buildTask = await quickPickBuildTask(registry, subscription, resourceGroup);
        command = `az acr build-task run -n ${buildTask.name} -r ${registry.name}`;
    }
    terminal.show();
    terminal.sendText(command);

}
