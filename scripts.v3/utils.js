const fs = require("fs");
const path = require("path");
const https = require("https");
const { BlobServiceClient } = require("@azure/storage-blob");
const { 
    DefaultAzureCredential, 
    ClientSecretCredential,
    ManagedIdentityCredential,
    AzureCliCredential 
} = require("@azure/identity");

const blobStorageContainer = "content";

const apiVersion = "2021-08-01";
const managementApiEndpoint = "management.azure.com";
const metadataFileExt = ".info";
const defaultFileEncoding = "utf8";

// Add a helper function to load mime dynamically
let mime;
async function getMime() {
    if (!mime) {
        mime = await import('mime');
    }
    return mime;
}
class HttpClient {
    constructor(subscriptionId, resourceGroupName, serviceName, tenantId, servicePrincipal, secret) {
        this.subscriptionId = subscriptionId;
        this.resourceGroupName = resourceGroupName;
        this.serviceName = serviceName;
        this.baseUrl = `https://${managementApiEndpoint}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.ApiManagement/service/${serviceName}`;
        
        // Initialize Azure credential based on available parameters
        this.credential = this.initializeCredential(tenantId, servicePrincipal, secret);
        this.accessToken = null;
    }

    /**
     * Initialize Azure credential based on available authentication parameters
     */
    initializeCredential(tenantId, servicePrincipal, secret) {
        // If all service principal parameters are provided, use ClientSecretCredential
        if (tenantId && servicePrincipal && secret) {
            console.log("Using Service Principal authentication");
            return new ClientSecretCredential(tenantId, servicePrincipal, secret);
        }
        
        // If running in Azure (GitHub Actions with OIDC or Azure VM), try managed identity
        if (process.env.GITHUB_ACTIONS && process.env.AZURE_CLIENT_ID) {
            console.log("Using Managed Identity authentication for GitHub Actions");
            return new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID);
        }

        // Fallback to DefaultAzureCredential (tries multiple auth methods)
        console.log("Using DefaultAzureCredential authentication");
        return new DefaultAzureCredential({
            // Exclude interactive browser credential in CI/CD environments
            excludeInteractiveBrowserCredential: !!process.env.CI || !!process.env.GITHUB_ACTIONS
        });
    }

    /**
     * Get access token using Azure Identity
     */
    async getAccessToken() {
        try {
            const tokenResponse = await this.credential.getToken("https://management.azure.com/.default");
            return `Bearer ${tokenResponse.token}`;
        } catch (error) {
            throw new Error(`Failed to get access token: ${error.message}`);
        }
    }

    /**
     * A wrapper for making a request and returning its response body.
     * @param {string} method - Http method, e.g. GET.
     * @param {string} url - Relative resource URL, e.g. `/contentTypes`.
     * @param {string} body - Request body.
     */
    async sendRequest(method, url, body) {
        let requestUrl;
        let requestBody;

        if (url.startsWith("https://")) {
            requestUrl = new URL(url);
        } else {
            const normalizedUrl = url.startsWith("/") ? url : `/${url}`;
            requestUrl = new URL(this.baseUrl + normalizedUrl);
        }

        if (!requestUrl.searchParams.has("api-version")) {
            requestUrl.searchParams.append("api-version", apiVersion);
        }

        // Get fresh access token for each request
        if (!this.accessToken) {
            this.accessToken = await this.getAccessToken();
        }

        const headers = {
            "If-Match": "*",
            "Content-Type": "application/json",
            "Authorization": this.accessToken
        };

        if (body) {
            if (!body.properties) {
                body = {
                    properties: body
                }
            }
            requestBody = JSON.stringify(body);
            headers["Content-Length"] = Buffer.byteLength(requestBody);
        }

        const options = {
            port: 443,
            method: method,
            headers: headers
        };

        return new Promise((resolve, reject) => {
            const req = https.request(requestUrl.toString(), options, (resp) => {
                let data = '';

                resp.on('data', (chunk) => {
                    data += chunk;
                });

                resp.on('end', () => {
                    switch (resp.statusCode) {
                        case 200:
                        case 201:
                        case 202:
                            data.startsWith("{") ? resolve(JSON.parse(data)) : resolve(data);
                            break;
                        case 401:
                            // Token might be expired, clear it for next request
                            this.accessToken = null;
                            reject({ 
                                code: "Unauthorized", 
                                message: `Unauthorized. Please check your Azure credentials and permissions.`,
                                details: data
                            });
                            break;
                        case 403:
                            reject({ 
                                code: "Forbidden", 
                                message: `Access denied. Please check your permissions for the API Management service.`,
                                details: data
                            });
                            break;
                        case 404:
                            reject({ 
                                code: "NotFound", 
                                message: `Resource not found: ${requestUrl}`,
                                details: data
                            });
                            break;
                        default:
                            reject({ 
                                code: "UnhandledError", 
                                message: `Request failed: ${resp.statusCode} ${resp.statusMessage}`,
                                url: requestUrl.toString(),
                                details: data
                            });
                    }
                });
            });

            req.on('error', (e) => {
                reject({
                    code: "NetworkError",
                    message: `Network error: ${e.message}`,
                    originalError: e
                });
            });

            if (requestBody) {
                req.write(requestBody);
            }

            req.end();
        });
    }
}

class ImporterExporter {
    constructor(subscriptionId, resourceGroupName, serviceName, tenantId, servicePrincipal, secret, snapshotFolder = "../dist/snapshot") {
        this.httpClient = new HttpClient(subscriptionId, resourceGroupName, serviceName, tenantId, servicePrincipal, secret);
        this.snapshotFolder = snapshotFolder;
    }

    /**
     * Returns list of files in specified directory and its sub-directories.
     * @param {string} dir - Directory, e.g. "./dist/snapshot".
     */
    listFilesInDirectory(dir) {
        const results = [];

        fs.readdirSync(dir).forEach((file) => {
            if (file.endsWith(".info")) {
                return;
            }

            file = dir + "/" + file;
            const stat = fs.statSync(file);

            if (stat && stat.isDirectory()) {
                results.push(...this.listFilesInDirectory(file));
            }
            else {
                results.push(file);
            }
        });

        return results;
    }

    /**
     * Returns list of content types.
     */
    async getContentTypes() {
        try {
            const data = await this.httpClient.sendRequest("GET", `/contentTypes`);
            const contentTypes = data.value.map(x => x.id.replace("\/contentTypes\/", ""));

            return contentTypes;
        }
        catch (error) {
            throw new Error(`Unable to fetch content types. ${error.message}`);
        }
    }

    /**
     * Returns list of content items of specified content type.
     * @param {string} contentType - Content type, e.g. "page".
     */
    async getContentItems(contentType) {
        try {
            const contentItems = [];
            let nextPageUrl = `/contentTypes/${contentType}/contentItems`;
            nextPageUrl = this.ensureDocumentTypeFiltered(contentType, nextPageUrl);

            do {
                const data = await this.httpClient.sendRequest("GET", nextPageUrl);
                contentItems.push(...data.value);

                if (data.value.length > 0 && data.nextLink) {
                    nextPageUrl = data.nextLink;
                } else {
                    nextPageUrl = null;
                }
            }
            while (nextPageUrl)

            return contentItems;
        }
        catch (error) {
            throw new Error(`Unable to fetch content items. ${error.message}`);
        }
    }

    ensureDocumentTypeFiltered(contentType, nextLink) {
        if (contentType === 'document') {
            nextLink = `${nextLink}?$top=1`
        }
        return nextLink
    }

    /**
     * Returns a single content item of specified content type.
     * @param {string} contentType - Content type, e.g. "page".
     * @param {string} contentItem - Content item, e.g. "configuration".
     */
    async getContentItem(contentType, contentItem) {
        try {
            const url = `/contentTypes/${contentType}/contentItems/${contentItem}`;
            const data = await this.httpClient.sendRequest("GET", url);

            return data;
        }
        catch (error) {
            throw new Error(`Unable to fetch content item. ${error.message}`);
        }
    }

    /**
     * Updates a single content item of specified content type.
     * @param {string} contentType - Content type, e.g. "page".
     * @param {string} contentItem - Content item, e.g. "configuration".
     * @param {object} body Request body .
     */
    async updateContentItem(contentType, contentItem, body) {
        try {
            const url = `/contentTypes/${contentType}/contentItems/${contentItem}`;

            const data = await this.httpClient.sendRequest("PUT", url, body);

            return data;
        }
        catch (error) {
            throw new Error(`Unable to update content item. ${error.message}`);
        }
    }

    /**
     * Downloads media files from storage of specified API Management service.
     */
    async downloadBlobs() {
        try {
            const snapshotMediaFolder = `${this.snapshotFolder}/media`;
            const blobStorageUrl = await this.getStorageSasUrl();
            const blobServiceClient = new BlobServiceClient(blobStorageUrl.replace(`/${blobStorageContainer}`, ""));
            const containerClient = blobServiceClient.getContainerClient(blobStorageContainer);

            let blobs = containerClient.listBlobsFlat();

            for await (const blob of blobs) {
                const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
                const pathToFile = `${snapshotMediaFolder}/${blob.name}`;
                const folderPath = pathToFile.substring(0, pathToFile.lastIndexOf("/"));

                await fs.promises.mkdir(path.resolve(folderPath), { recursive: true });
                await blockBlobClient.downloadToFile(pathToFile);

                const metadata = { contentType: blob.properties.contentType };
                const metadataFile = JSON.stringify(metadata);
                await fs.promises.writeFile(pathToFile + metadataFileExt, metadataFile);
            }
        }
        catch (error) {
            throw new Error(`Unable to download media files. ${error.message}`);
        }
    }

    /**
     * Uploads media files to storage of specified API Management service.
     */
    async uploadBlobs() {
        const snapshotMediaFolder = `${this.snapshotFolder}/media`;

        if (!fs.existsSync(snapshotMediaFolder)) {
            console.info("No media files found in the snapshot folder. Skipping media upload...");
            return;
        }

        try {
            const blobStorageUrl = await this.getStorageSasUrl();
            const blobServiceClient = new BlobServiceClient(blobStorageUrl.replace(`/${blobStorageContainer}`, ""));
            const containerClient = blobServiceClient.getContainerClient(blobStorageContainer);
            const fileNames = this.listFilesInDirectory(snapshotMediaFolder);
            
            // Get mime dynamically
            const mimeModule = await getMime();

            for (const fileName of fileNames) {
                let contentType;
                let blobKey = fileName.replace(snapshotMediaFolder + "/", "")
                const metadataFilePath = fileName + metadataFileExt;

                if (fs.existsSync(metadataFilePath)) {
                    const metadataFile = await fs.promises.readFile(metadataFilePath, defaultFileEncoding);
                    const metadata = JSON.parse(metadataFile);
                    contentType = metadata.contentType
                } else {
                    blobKey = blobKey.split(".")[0];
                    contentType = mimeModule.getType(fileName) || "application/octet-stream";
                }

                const blockBlobClient = containerClient.getBlockBlobClient(blobKey);

                await blockBlobClient.uploadFile(fileName, {
                    blobHTTPHeaders: {
                        blobContentType: contentType
                    }
                });
            }
        }
        catch (error) {
            throw new Error(`Unable to upload media files. ${error.message}`);
        }
    }

    /**
     * Deletes media files from storage of specified API Management service.
     */
    async deleteBlobs() {
        try {
            const blobStorageUrl = await this.getStorageSasUrl();
            const blobServiceClient = new BlobServiceClient(blobStorageUrl.replace(`/${blobStorageContainer}`, ""));
            const containerClient = blobServiceClient.getContainerClient(blobStorageContainer);

            let blobs = containerClient.listBlobsFlat();

            for await (const blob of blobs) {
                const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
                await blockBlobClient.delete();
            }
        }
        catch (error) {
            throw new Error(`Unable to delete media files. ${error.message}`);
        }
    }

    /**
     * Captures the content of specified API Management service into snapshot.
     */
    async captureContent() {
        try {
            const result = {};
            const contentTypes = await this.getContentTypes();

            for (const contentType of contentTypes) {
                const contentItems = await this.getContentItems(contentType);

                contentItems.forEach(contentItem => {
                    result[contentItem.id] = contentItem;
                    delete contentItem.id;
                });
            }

            await fs.promises.mkdir(path.resolve(this.snapshotFolder), { recursive: true });

            fs.writeFileSync(`${this.snapshotFolder}/data.json`, JSON.stringify(result));
        }
        catch (error) {
            throw new Error(`Unable to capture content. ${error.message}`);
        }
    }

    /**
     * Deletes the content in specified API Management service.
     */
    async deleteContent() {
        try {
            const contentTypes = await this.getContentTypes();

            for (const contentType of contentTypes) {
                const contentItems = await this.getContentItems(contentType);

                for (const contentItem of contentItems) {
                    await this.httpClient.sendRequest("DELETE", `/${contentItem.id}`);
                }
            }
        }
        catch (error) {
            throw new Error(`Unable to delete content. ${error.message}`);
        }
    }

    /**
     * Generates the content in specified API Management service from snapshot.
     */
    async generateContent() {
        const snapshotFilePath = `${this.snapshotFolder}/data.json`;

        try {
            if (!fs.existsSync(snapshotFilePath)) {
                throw new Error(`Snapshot file ${snapshotFilePath} not found.`);
            }

            const data = fs.readFileSync(snapshotFilePath);
            const dataObj = JSON.parse(data);
            const keys = Object.keys(dataObj);

            for (const key of keys) {
                await this.httpClient.sendRequest("PUT", key, dataObj[key]);
            }
        }
        catch (error) {
            throw new Error(`Unable to generate the content. ${error.message}`);
        }
    }

    /**
     * Gets a storage SAS URL.
     */
    async getStorageSasUrl() {
        const response = await this.httpClient.sendRequest("POST", `/portalSettings/mediaContent/listSecrets`);
        return response.containerSasUrl;
    }

    /**
     * Deletes the content and media files in specfied service.
     */
    async cleanup() {
        console.log("Cleaning up...")

        try {
            await this.deleteContent();
            await this.deleteBlobs();
        }
        catch (error) {
            throw new Error(`Unable to complete cleanup. ${error.message}`);
        }
    }

    /**
     * Exports the content and media files from specfied service.
     */
    async export() {
        console.log("Exporting...")

        try {
            await this.captureContent();
            await this.downloadBlobs();
        }
        catch (error) {
            throw new Error(`Unable to complete export. ${error.message}`);
        }
    }

    /**
     * Imports the content and media files into specfied service.
     */
    async import() {
        console.log("Importing...")

        try {
            await this.generateContent();
            await this.uploadBlobs();
        }
        catch (error) {
            throw new Error(`Unable to complete import. ${error.message}`);
        }
    }

    /**
     * Publishes the content of the specified APIM service.
     */
    async publish() {
        try {
            const timeStamp = new Date();
            const revision = timeStamp.toISOString().replace(/[\-\:\T]/g, "").substr(0, 14);
            const url = `/portalRevisions/${revision}`;
            const body = {
                description: `Migration ${revision}.`,
                isCurrent: true
            };

            await this.httpClient.sendRequest("PUT", url, body);
        }
        catch (error) {
            throw new Error(`Unable to schedule website publishing. ${error.message}`);
        }
    }

    /**
     * Replaces existing URLs of API Management service with specified URLs.
     */
    async updateContentUrl(existingUrls, replaceableUrls) {
        try {
            if (existingUrls.Count != replaceableUrls.Count) {
                throw new Error(`Existing URL and Replaceable URLs count mismatch.`);
            }

            const contentItems = await this.getContentItems("url");

            console.log("Number of urls found in portal: " + contentItems.length);

            for (const contentItem of contentItems) {
                var count = 0;
                console.log(" url found in portal: " + contentItem.properties.permalink);

                for (const existingUrl of existingUrls) {
                    if (contentItem.properties.permalink == existingUrl) {
                        contentItem.properties.permalink = replaceableUrls[count];
                        console.log("updating URL content... for no. " + count + " link: " + contentItem.properties.permalink);
                        console.log(" updated URL content : for no. " + count + " content item: " + JSON.stringify(contentItem));
                        const response = await this.httpClient.sendRequest("PUT", contentItem.id + "?api-version=" + apiVersion, contentItem);

                        console.log(" response : " + JSON.stringify(response));
                    }
                    count++;
                };
            };

        }
        catch (error) {
            throw new Error(`Unable to update URL. ${error.message}`);
        }
    }

    /**
     * Pushes the GTM tag to the specified APIM instance.
     * @param {string} gtmContainerId - Google Tag Manager container ID, e.g. `GTM-XXXXXX`.
     */
    async gtm(gtmContainerId) {
        console.log("Applying GTM Tag...")
        try {
            const config = await this.getContentItem("document", "configuration");
            const newNodes = config.properties.nodes.map((node) => {
                return {
                    ...node, integration: {
                        googleTagManager: {
                            containerId: gtmContainerId
                        }
                    }
                }
            })
            const newConfig = { ...config, properties: { ...config.properties, nodes: newNodes } }

            await this.updateContentItem("document", "configuration", newConfig)
        }
        catch (error) {
            throw new Error(`Unable to apply gtm tag. ${error.message}`);
        }
    }
}

module.exports = {
    ImporterExporter,
    HttpClient
};