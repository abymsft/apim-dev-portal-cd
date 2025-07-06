/**
 * This script automates deleting the content of API Management developer portals.
 * In order to run it, you need to:
 * 
 * 1) Clone the api-management-developer-portal repository:
 *    git clone https://github.com/Azure/api-management-developer-portal.git
 * 
 * 2) Install NPM  packages:
 *    npm install
 * 
 * 3) Run this script with a valid combination of arguments:
 *    node ./cleanup ^
 *    --sourceSubscriptionId "< your subscription ID >" ^
 *    --sourceResourceGroupName "< your resource group name >" ^
 *    --sourceServiceName "< your service name >" ^
 *    --destSubscriptionId "< your subscription ID >" ^
 *    --destResourceGroupName "< your resource group name >" ^
 *    --destServiceName "< your service name >"
 */

const { ImporterExporter } = require("./utils");

const yargs = require('yargs')
    .example(`node ./cleanup ^ \r
    --subscriptionId "< your subscription ID >" ^ \r
    --resourceGroupName "< your resource group name >" ^ \r
    --serviceName "< your service name >"\n`)
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
    .option('tenantId', {
        type: 'string',
        description: 'tenant ID.',
        default: process.env.AZURE_TENANT_ID,
        demandOption: !process.env.AZURE_TENANT_ID
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
    .help()
    .argv;

async function cleanup() {
    try {
        // Validate required parameters
        if (!yargs.subscriptionId || !yargs.resourceGroupName || !yargs.serviceName) {
            throw new Error('Missing required parameters: subscriptionId, resourceGroupName, and serviceName are required');
        }

        // Safety confirmation
        if (!yargs.confirm) {
            console.warn('⚠️  WARNING: This will DELETE ALL content from the API Management developer portal!');
            console.warn(`   Service: ${yargs.serviceName}`);
            console.warn(`   Resource Group: ${yargs.resourceGroupName}`);
            console.warn(`   Subscription: ${yargs.subscriptionId}`);
            console.warn('');
            console.warn('   To proceed, add the --confirm flag to your command.');
            console.warn('   Example: node ./cleanup --subscriptionId "..." --resourceGroupName "..." --serviceName "..." --confirm');
            return;
        }

        console.log('🧹 Starting cleanup process...');
        console.log(`   Target Service: ${yargs.serviceName}`);
        console.log(`   Resource Group: ${yargs.resourceGroupName}`);

        const importerExporter = new ImporterExporter(
            yargs.subscriptionId,
            yargs.resourceGroupName,
            yargs.serviceName,
            yargs.tenantId,
            yargs.servicePrincipal,
            yargs.servicePrincipalSecret
        );

        await importerExporter.cleanup();
        
        console.log('✅ Cleanup completed successfully!');
        
    } catch (error) {
        console.error(`❌ Cleanup failed: ${error.message}`);
        if (error.details) {
            console.error(`Details: ${error.details}`);
        }
        throw error;
    }
}

cleanup()
    .then(() => {
        console.log("✅ DONE");
        process.exit(0);
    })
    .catch(error => {
        console.error(`❌ ERROR: ${error.message}`);
        process.exit(1);
    });

module.exports = {
    cleanup
}