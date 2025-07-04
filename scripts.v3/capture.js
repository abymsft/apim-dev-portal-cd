/**
 * This script automates capturing the content of API Management developer portals into snapshot.
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
 *    node ./capture --subscriptionId <id> --resourceGroupName <name> --serviceName <name>
 */

const path = require("path");
const { ImporterExporter } = require("./utils");

const yargs = require('yargs')
    .example(`node ./capture --subscriptionId "<subscription-id>" --resourceGroupName "<resource-group>" --serviceName "<service-name>"`)
    .option('subscriptionId', {
        type: 'string',
        description: 'Azure subscription ID.',
        default: process.env.AZURE_SUBSCRIPTION_ID,
        demandOption: true
    })
    .option('resourceGroupName', {
        type: 'string',
        description: 'Azure resource group name.',
        default: process.env.AZURE_RESOURCE_GROUP_NAME,
        demandOption: true
    })
    .option('serviceName', {
        type: 'string',
        description: 'API Management service name.',
        default: process.env.AZURE_SERVICE_NAME,
        demandOption: true
    })
    .option('folder', {
        type: 'string',
        default: '../dist/snapshot',
        description: 'The path to the folder which will contain the content of the portal'
    })
    .option('timestamp', {
        type: 'boolean',
        description: 'Adds a timestamp to the folder where the content is stored',
        default: false
    })
    .option('tenantId', {
        type: 'string',
        description: 'Azure tenant ID (optional, can use AZURE_TENANT_ID env var)',
        default: process.env.AZURE_TENANT_ID
    })
    .option('servicePrincipal', {
        type: 'string',
        description: 'Service principal client ID (optional, can use AZURE_CLIENT_ID env var)',
        default: process.env.AZURE_CLIENT_ID
    })
    .option('servicePrincipalSecret', {
        type: 'string',
        description: 'Service principal secret (optional, can use AZURE_CLIENT_SECRET env var)',
        default: process.env.AZURE_CLIENT_SECRET
    })
    .help()
    .argv;

async function capture() {
    try {
        // Validate required parameters
        if (!yargs.subscriptionId || !yargs.resourceGroupName || !yargs.serviceName) {
            throw new Error('Missing required parameters: subscriptionId, resourceGroupName, and serviceName are required');
        }

        // Use path.resolve for proper cross-platform path handling
        let absoluteFolder = path.resolve(yargs.folder);

        // Add timestamp if requested
        if (yargs.timestamp) {
            const timestamp = new Date();
            const postfix = "-" +
                timestamp.getFullYear() +
                makeTwo(timestamp.getMonth() + 1) +
                makeTwo(timestamp.getDate()) +
                makeTwo(timestamp.getHours()) +
                makeTwo(timestamp.getMinutes()) +
                makeTwo(timestamp.getSeconds());

            absoluteFolder += postfix;
        }

        console.log(`Starting capture process...`);
        console.log(`Target folder: ${absoluteFolder}`);

        const importerExporter = new ImporterExporter(
            yargs.subscriptionId,
            yargs.resourceGroupName,
            yargs.serviceName,
            yargs.tenantId,
            yargs.servicePrincipal,
            yargs.servicePrincipalSecret,
            absoluteFolder
        );

        await importerExporter.export();

        console.log(`✅ Content successfully captured in: ${absoluteFolder}`);
    } catch (error) {
        console.error(`❌ Capture failed: ${error.message}`);
        if (error.details) {
            console.error(`Details: ${error.details}`);
        }
        throw error;
    }
}

function makeTwo(digits) {
    return digits.toString().padStart(2, '0');
}

capture()
    .then(() => {
        console.log("✅ DONE");
        process.exit(0);
    })
    .catch(error => {
        console.error(`❌ ERROR: ${error.message}`);
        process.exit(1);
    });

module.exports = {
    capture
};