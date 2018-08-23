import { BuildTaskNode } from "../../explorer/models/taskNode";
const teleCmdId: string = 'runBuildTask';
import vscode = require('vscode');
import { quickPickACRRegistry, quickPickBuildTask, quickPickSubscription } from '../utils/quick-pick-azure';

export async function runBuildTask(context?: BuildTaskNode): Promise<any> {
    const terminal = vscode.window.createTerminal("Docker");

    if (context) {
        console.log("right click");
        terminal.show();
        //terminal.sendText(`az acr build-task show -n ${context.label} -r ${}`);
    } else {
        console.log("input bar");
        let subscription = await quickPickSubscription();
        let registry = await quickPickACRRegistry();
        let buildTask = await quickPickBuildTask(registry, subscription);
        terminal.show();
        terminal.sendText(`az acr build-task run -n ${buildTask.name} -r ${registry.name}`);

    }

}
