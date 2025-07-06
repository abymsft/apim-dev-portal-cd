/**
 * This script automates generating the content of API Management developer portals from the snapshot.
 * In order to run it, you need to:
 * 
 * 1) Clone the api-management-developer-portal repository:
 *    git clone https://github.com/Azure/api-management-developer-portal.git
 * 
 * 2) Install NPM packages:
 *    npm install
 * 
 * 3) Set up authentication using one of these methods:
 *    - Service Principal: Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 *    - Managed Identity: Set AZURE_CLIENT_ID (in Azure environments)
 *    - Azure CLI: Run 'az login' (fallback option)
 * 
 * 4) Run this script:
 *    node ./generate --subscriptionId <id> --resourceGroupName <name> --serviceName <name> --folder <path>
 */

const path = require("path");
const fs = require("fs");
const { ImporterExporter } = require("./utils");

const yargs = require('yargs')
    .example(`node ./generate --subscriptionId "<subscription-id>" --resourceGroupName "<resource-group>" --serviceName "<service-name>" --folder "./dist/snapshot"`)
    .option('subscriptionId', {
        type: 'string',
        description: 'Azure subscription ID.',
        default: process.env.AZURE_SUBSCRIPTION_ID,
        demandOption: !process.env.AZURE_SUBSCRIPTION_ID
    })
    .option('resourceGroupName', {
        type: 'string',
        description: 'Azure resource group name.',
        default: process.env.AZURE_RESOURCE_GROUP_NAME,
        demandOption: !process.env.AZURE_RESOURCE_GROUP_NAME
    })
    .option('serviceName', {
        type: 'string',
        description: 'API Management service name.',
        default: process.env.AZURE_SERVICE_NAME,
        demandOption: !process.env.AZURE_SERVICE_NAME
    })
    .option('folder', {
        type: 'string',
        default: '../dist/snapshot',
        description: 'The path to the folder which contains the content to be uploaded to the portal',
        example: '../dist/snapshot',
        demandOption: false
    })
    .option('publish', {
        type: 'boolean',
        default: false,
        description: 'Enabling this flag will publish the developer portal changes.',
        demandOption: false
    })
    .option('tenantId', {
        type: 'string',
        description: 'Azure tenant ID (optional, can use AZURE_TENANT_ID env var)',
        default: process.env.AZURE_TENANT_ID,
        demandOption: false
    })
    .option('servicePrincipal', {
        type: 'string',
        description: 'Service principal client ID (optional, can use AZURE_CLIENT_ID env var)',
        default: process.env.AZURE_CLIENT_ID,
        demandOption: false
    })
    .option('servicePrincipalSecret', {
        type: 'string',
        description: 'Service principal secret (optional, can use AZURE_CLIENT_SECRET env var)',
        default: process.env.AZURE_CLIENT_SECRET,
        demandOption: false
    })
    .option('force', {
        type: 'boolean',
        default: false,
        description: 'Force generation even if snapshot validation fails',
        demandOption: false
    })
    .help()
    .argv;

async function generate() {
    try {
        // Validate required parameters
        if (!yargs.subscriptionId || !yargs.resourceGroupName || !yargs.serviceName) {
            throw new Error('Missing required parameters: subscriptionId, resourceGroupName, and serviceName are required');
        }

        // Use proper cross-platform path handling
        const absoluteFolder = path.resolve(yargs.folder);
        
        console.log('📦 Starting generate process...');
        console.log(`   Source folder: ${absoluteFolder}`);
        console.log(`   Target Service: ${yargs.serviceName}`);
        console.log(`   Resource Group: ${yargs.resourceGroupName}`);
        console.log(`   Publish after import: ${yargs.publish ? 'Yes' : 'No'}`);

        // Validate snapshot folder exists
        if (!fs.existsSync(absoluteFolder)) {
            throw new Error(`Snapshot folder not found: ${absoluteFolder}`);
        }

        // Validate snapshot contains data
        const dataFile = path.join(absoluteFolder, 'data.json');
        if (!fs.existsSync(dataFile)) {
            if (!yargs.force) {
                throw new Error(`Snapshot data file not found: ${dataFile}. Use --force to override.`);
            } else {
                console.warn('⚠️  Warning: data.json not found, proceeding due to --force flag');
            }
        }

        // Check if snapshot has content
        const files = fs.readdirSync(absoluteFolder);
        if (files.length === 0) {
            throw new Error(`Snapshot folder is empty: ${absoluteFolder}`);
        }

        console.log(`✅ Snapshot validation passed. Found ${files.length} items.`);

        const importerExporter = new ImporterExporter(
            yargs.subscriptionId,
            yargs.resourceGroupName,
            yargs.serviceName,
            yargs.tenantId,
            yargs.servicePrincipal,
            yargs.servicePrincipalSecret,
            absoluteFolder
        );

        console.log('🔄 Importing content...');
        await importerExporter.import();
        console.log('✅ Content imported successfully!');

        if (yargs.publish === true) {
            console.log('📢 Publishing changes...');
            await importerExporter.publish();
            console.log('✅ Changes published successfully!');
        } else {
            console.log('ℹ️  Skipped publishing changes.');
            console.log('   💡 To publish changes, run the script with --publish flag.');
        }

        console.log('✅ Generate process completed successfully!');

    } catch (error) {
        console.error(`❌ Generate failed: ${error.message}`);
        if (error.details) {
            console.error(`Details: ${error.details}`);
        }
        throw error;
    }
}

generate()
    .then(() => {
        console.log("✅ DONE");
        process.exit(0);
    })
    .catch(error => {
        console.error(`❌ ERROR: ${error.message}`);
        process.exit(1);
    });

module.exports = {
    generate
}