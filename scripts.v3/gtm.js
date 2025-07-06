/**
 * This script add the Google Tag Manager (GTM) configuration to the API Management developer portal and publishes it.
 * In order to run it, you need to:
 * 
 * 1) Clone the api-management-developer-portal repository:
 *    git clone https://github.com/Azure/api-management-developer-portal.git
 * 
 * 2) Install NPM  packages:
 *    npm install
 * 
 * 3) Run this script with a valid combination of arguments:
 *    node ./gtm ^
 *   --subscriptionId < your subscription ID > ^
 *   --resourceGroupName < your resource group name > ^
 *   --serviceName < your service name > ^
 *   --gtmContainerId < gtm container ID >
 */

 const { ImporterExporter } = require("./utils");
 
 const yargs = require('yargs')
     .example(`node ./generate ^ \r
     --subscriptionId "< your subscription ID >" ^ \r
     --resourceGroupName "< your resource group name >" ^ \r
     --serviceName "< your service name >"\r
     --gtmContainerId "< gtm container ID >"\n`)
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
     .option('gtmContainerId', {
         type: 'string',
         description: 'The Google Tag Manager container ID',
         example: 'UA-XXXXXXX-X',
         demandOption: true
     })
         .option('tenantId', {
        type: 'string',
        default: process.env.AZURE_TENANT_ID,
        demandOption: false
    })
    .option('servicePrincipal', {
        type: 'string',
        default: process.env.AZURE_CLIENT_ID,
        demandOption: false
    })
    .option('servicePrincipalSecret', {
        type: 'string',
        description: 'service principal secret.',
        default: process.env.AZURE_CLIENT_SECRET,
        demandOption: false
    })
     .help()
     .argv;
 
async function gtm() {
    try {
        // Validate required parameters
        if (!yargs.subscriptionId || !yargs.resourceGroupName || !yargs.serviceName) {
            throw new Error('Missing required parameters: subscriptionId, resourceGroupName, and serviceName are required');
        }

        if (!yargs.gtmContainerId) {
            throw new Error('GTM Container ID is required');
        }

        // Validate GTM container ID format
        if (!validateGtmContainerId(yargs.gtmContainerId)) {
            throw new Error(`Invalid GTM Container ID format: ${yargs.gtmContainerId}. Expected format: GTM-XXXXXX (e.g., GTM-ABC123)`);
        }

        console.log('🏷️  Starting GTM configuration...');
        console.log(`   GTM Container ID: ${yargs.gtmContainerId}`);
        console.log(`   Target Service: ${yargs.serviceName}`);
        console.log(`   Resource Group: ${yargs.resourceGroupName}`);
        console.log(`   Auto-publish: ${yargs.skipPublish ? 'No' : 'Yes'}`);

        const importerExporter = new ImporterExporter(
            yargs.subscriptionId,
            yargs.resourceGroupName,
            yargs.serviceName,
            yargs.tenantId,
            yargs.servicePrincipal,
            yargs.servicePrincipalSecret,
            null
        );

        console.log('🔄 Applying GTM configuration...');
        await importerExporter.gtm(yargs.gtmContainerId);
        console.log('✅ GTM configuration applied successfully!');

        if (!yargs.skipPublish) {
            console.log('📢 Publishing changes...');
            await importerExporter.publish();
            console.log('✅ Changes published successfully!');
        } else {
            console.log('ℹ️  Skipped publishing changes.');
            console.log('   💡 To publish changes, run the script without --skipPublish flag.');
        }

        console.log('✅ GTM setup completed successfully!');
        console.log(`   🎯 GTM Container ${yargs.gtmContainerId} is now configured for your developer portal.`);

    } catch (error) {
        console.error(`❌ GTM setup failed: ${error.message}`);
        if (error.details) {
            console.error(`Details: ${error.details}`);
        }
        throw error;
    }
}

gtm()
    .then(() => {
        console.log("✅ DONE");
        process.exit(0);
    })
    .catch(error => {
        console.error(`❌ ERROR: ${error.message}`);
        process.exit(1);
    });
 
 
 module.exports = {
     gtm
 }
 