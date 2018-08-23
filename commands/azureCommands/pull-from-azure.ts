import vscode = require('vscode');
import { reporter } from '../../telemetry/telemetry';
const teleCmdId: string = 'vscode-docker.image.pullFromAzure';
//tslint ignore-next-line
import { exec } from 'child_process';
import { AzureImageNode } from '../../explorer/models/azureRegistryNodes';
import * as acrTools from '../../utils/Azure/acrTools';

/* Pulls an image from Azure. The context is the image node the user has right clicked on */
export async function pullFromAzure(context?: AzureImageNode): Promise<any> {

    // Step 1: Using loginCredentials function to get the username and password. This takes care of all users, even if they don't have the Azure CLI
    const credentials = await acrTools.loginCredentials(context.registry);
    const username = credentials.username;
    const password = credentials.password;
    const registry = context.registry.loginServer;

    const terminal = vscode.window.createTerminal("Docker");
    terminal.show();

    // Step 2: docker login command
    let cont = (err, stdout, stderr) => {
        console.log(err);
        // Step 3: docker pull command
        //await terminal.sendText(`docker login ${registry} -u ${username} -p ${password}`);

        terminal.sendText(`docker pull ${registry}/${context.label}`);

        //Acquiring telemetry data here
        if (reporter) {
            reporter.sendTelemetryEvent('command', {
                command: teleCmdId
            });
        }
        // let jsonStdout = JSON.parse(stdout);
        // let soughtsrvr: string = "";
        // for (let i = 0; i < jsonStdout.length; i++) {
        //     let srvrName: string = jsonStdout[i].acrLoginServer;
        //     let searchIndex: number = srvrName.search(`${regName}`);
        //     if (searchIndex === 0 && srvrName[regName.length] === '.') { // can names include . ?
        //         soughtsrvr = srvrName;
        //         break;
        //     }
        // }
    }

    exec(`docker login ${registry} -u ${username} -p ${password}`, cont);

    //await terminal.sendText(`docker login ${registry} -u ${username} -p ${password}`);

}
