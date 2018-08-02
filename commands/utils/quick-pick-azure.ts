import { ContainerRegistryManagementClient } from 'azure-arm-containerregistry';
import { Registry } from 'azure-arm-containerregistry/lib/models';
import * as vscode from "vscode";
import * as azureUtils from '../../explorer/utils/azureUtils';
import { AzureAccount, AzureSession } from '../../typings/azure-account.api';
import * as acrTools from '../../utils/Azure/acrTools';
import { AzureImage } from "../../utils/Azure/models/image";
import { Repository } from "../../utils/Azure/models/Repository";
import { AzureCredentialsManager } from '../../utils/azureCredentialsManager';

/**
 * function to allow user to pick a desired image for use
 * @param repository the repository to look in
 * @returns an AzureImage object (see azureUtils.ts)
 */
export async function quickPickACRImage(repository: Repository): Promise<AzureImage> {
    const repoImages: AzureImage[] = await acrTools.getImages(repository);
    console.log(repoImages);
    let imageList: string[] = [];
    for (let tempImage of repoImages) {
        imageList.push(tempImage.tag);
    }
    let desiredImage = await vscode.window.showQuickPick(imageList, { 'canPickMany': false, 'placeHolder': 'Choose the image you want to delete' });
    if (desiredImage === undefined) { return; }
    let image = repoImages.find((myImage): boolean => { return desiredImage === myImage.tag });
    if (image === undefined) { return; }
    return image;
}

/**
 * function to allow user to pick a desired repository for use
 * @param registry the registry to choose a repository from
 * @returns a Repository object (see azureUtils.ts)
 */
export async function quickPickACRRepository(registry: Registry): Promise<Repository> {
    const myRepos: Repository[] = await acrTools.getAzureRepositories(registry);
    let rep: string[] = [];
    for (let repo of myRepos) {
        rep.push(repo.name);
    }
    let desiredRepo = await vscode.window.showQuickPick(rep, { 'canPickMany': false, 'placeHolder': 'Choose the repository from which your desired image exists' });
    if (desiredRepo === undefined) { return; }
    let repository = myRepos.find((currentRepo): boolean => { return desiredRepo === currentRepo.name });
    if (repository === undefined) {
        vscode.window.showErrorMessage('Could not find repository. Check that it still exists!');
        return;
    }
    return repository;
}

/**
 * function to let user choose a registry for use
 * @returns a Registry object
 */
export async function quickPickACRRegistry(): Promise<Registry> {
    //first get desired registry
    let registries = await AzureCredentialsManager.getInstance().getRegistries();
    let reg: string[] = [];
    for (let registryName of registries) {
        reg.push(registryName.name);
    }
    let desired = await vscode.window.showQuickPick(reg, { 'canPickMany': false, 'placeHolder': 'Choose the Registry from which your desired image exists' });
    if (desired === undefined) { return; }
    let registry = registries.find((currentReg): boolean => { return desired === currentReg.name });
    return registry;
}
