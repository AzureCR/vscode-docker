import { ContainerRegistryManagementClient } from 'azure-arm-containerregistry';
import { DockerBuildStep } from 'azure-arm-containerregistry/lib/models/dockerBuildStep';
import { SubscriptionModels } from 'azure-arm-resource';
import * as vscode from "vscode";
import { ImageNode } from "../explorer/models/imageNode";
import { AzureCredentialsManager } from "../out/utils/AzureCredentialsManager";
//import { DockerBuildStep } from "azure-arm-containerregistry/lib/models";

// This function creates a build task from an existing image, pulling the context from that image in order to limit the number of parameters.

export async function buildTask(context?: ImageNode): Promise<void> {
    let registry = context.registry;
    const resourceGroup: string = context.registry.id.slice(context.registry.id.search('resourceGroups/') + 'resourceGroups/'.length, context.registry.id.search('/providers/'));
    const registryName: string = context.registry.name;
    let opt: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        prompt: 'GitHub source code URL? '
    };

    const gitURL: string = await vscode.window.showInputBox(opt);
    opt = {
        ignoreFocusOut: true,
        prompt: 'repository path? '
    };
    const repository: string = context.label.split(':')[0]
    opt = {
        ignoreFocusOut: true,
        prompt: 'BuildTask name? '
    };
    const buildTaskName: string = await vscode.window.showInputBox(opt);

    opt = {
        ignoreFocusOut: true,
        prompt: 'BuildTask alias? '
    };
    const buildTaskAlias: string = await vscode.window.showInputBox(opt);
    opt = {
        ignoreFocusOut: true,
        prompt: 'dockerfile path relative to source control root? '
    };
    const path: string = await vscode.window.showInputBox(opt);
    const sourceControlType: string = 'GitHub';

    const client = new ContainerRegistryManagementClient(AzureCredentialsManager.getInstance().getCredentialByTenantId(context.subscription.tenantId, context.azureAccount), context.subscription);
    // This creates a build task from the params Resource Group, Registry, Name, Build Task Parameters.

    client.buildTasks.create(resourceGroup, registryName, buildTaskName, { 'alias': buildTaskAlias, 'sourceRepository': { 'sourceControlType': sourceControlType, 'repositoryUrl': gitURL }, 'platform': { 'osType': 'linux' }, 'location': registryName })

    console.log(client.buildTasks.list(resourceGroup, registryName));
    let images: ImageNode[];
    images[0] = context;
    //const type: string = "";
    let Docker_BuildStep = DockerBuildStep(repository, images, true, false, path)
    // The API seperates the build task and the build steps for now, so once the build task is created the steps must follow to execute the build task.
    client.buildSteps.create(resourceGroup, registryName, buildTaskName, buildTaskName, Docker_BuildStep);
}
// This creates and launches a build task from a workspace solution which hasn't yet been built into an image, so no context is provided.

export async function launchAsBuildTask(): Promise<void> {
    let opt: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        prompt: 'Resource Group? '
    };
    const resourceGroup: string = await vscode.window.showInputBox(opt);
    opt = {
        ignoreFocusOut: true,
        prompt: 'Container registry? '
    };
    const registryName: string = await vscode.window.showInputBox(opt);

    opt = {
        ignoreFocusOut: true,
        prompt: 'GitHub username? '
    };
    const username: string = await vscode.window.showInputBox(opt);
    opt = {
        ignoreFocusOut: true,
        prompt: 'GitHub source code URL? '
    };
    const gitURL: string = await vscode.window.showInputBox(opt);

    opt = {
        ignoreFocusOut: true,
        prompt: 'repository path? '
    };
    const repository: string = await vscode.window.showInputBox(opt);

    opt = {
        ignoreFocusOut: true,
        prompt: 'Build Task name? '
    };
    const buildTaskName: string = await vscode.window.showInputBox(opt);

    opt = {
        ignoreFocusOut: true,
        prompt: 'BuildTask alias? '
    };
    const buildTaskAlias: string = await vscode.window.showInputBox(opt);
    const sourceControlType: string = 'GitHub';
    //const subs: SubscriptionModels.Subscription[] = AzureCredentialsManager.getInstance().getFilteredSubscriptions(context['azureAccount']);

    const client = new ContainerRegistryManagementClient(AzureCredentialsManager.getInstance().getCredentialByTenantId(context.subscription.tenantId, context.azureAccount), context.subscription);
    client.buildTasks.create(resourceGroup, registryName, buildTaskName, { 'alias': buildTaskAlias, 'sourceRepository': { 'sourceControlType': sourceControlType, 'repositoryUrl': gitURL }, 'platform': { 'osType': 'linux' }, 'location': registryName });
    const type: string = 'image'
    client.buildSteps.create(resourceGroup, registryName, buildTaskName, buildTaskName, { type });
}
