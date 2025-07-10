@description('The name of the API Management service')
param apimServiceName string = 'apimDev003TDC'

@description('The name of the resource group')
param resourceGroupName string

@description('Location for all resources')
param location string = resourceGroup().location

@description('The pricing tier of this API Management service')
@allowed([
  'Consumption'
  'Developer'
  'Basic'
  'Standard'
  'Premium'
])
param sku string = 'Developer'

@description('The instance size of this API Management service')
@allowed([
  0
  1
  2
])
param skuCount int = 1

@description('The email address of the owner of the service')
param publisherEmail string

@description('The name of the owner of the service')
param publisherName string

@description('The notification sender email address for the service')
param notificationSenderEmail string = publisherEmail

@description('Enable or disable public network access')
@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Enabled'

@description('Enable developer portal signup')
param enablePortalSignup bool = true

@description('Enable developer portal delegation')
param enablePortalDelegation bool = false

@description('Portal delegation URL')
param portalDelegationUrl string = ''

@description('Portal delegation validation key')
@secure()
param portalDelegationValidationKey string = ''

@description('Terms of service text')
param termsOfServiceText string = ''

@description('Enable terms of service consent requirement')
param termsOfServiceConsentRequired bool = false

@description('Tags to apply to all resources')
param tags object = {
  Environment: 'Development'
  Project: 'APIM-DevPortal'
  ManagedBy: 'Bicep'
  CreatedDate: utcNow('yyyy-MM-dd')
}

// API Management Service
resource apimService 'Microsoft.ApiManagement/service@2023-05-01-preview' = {
  name: apimServiceName
  location: location
  tags: tags
  sku: {
    name: sku
    capacity: skuCount
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: publisherName
    notificationSenderEmail: notificationSenderEmail
    hostnameConfigurations: [
      {
        type: 'Proxy'
        hostName: '${apimServiceName}.azure-api.net'
        negotiateClientCertificate: false
        defaultSslBinding: true
        certificateSource: 'BuiltIn'
      }
    ]
    customProperties: {
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls10': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls11': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Ssl30': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TripleDes168': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls10': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls11': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Ssl30': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Protocols.Server.Http2': 'False'
    }
    virtualNetworkType: 'None'
    disableGateway: false
    apiVersionConstraint: {
      minApiVersion: '2019-01-01'
    }
    publicNetworkAccess: publicNetworkAccess
    developerPortalStatus: 'Enabled'
  }
  identity: {
    type: 'SystemAssigned'
  }
}

// Storage Account for Developer Portal Media Files
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'apim${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    encryption: {
      services: {
        blob: {
          enabled: true
        }
        file: {
          enabled: true
        }
      }
      keySource: 'Microsoft.Storage'
    }
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: ['https://${apimServiceName}.developer.azure-api.net']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']
          allowedHeaders: ['*']
          exposedHeaders: ['*']
          maxAgeInSeconds: 3600
        }
      ]
    }
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource contentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'content'
  properties: {
    publicAccess: 'None'
  }
}

// Portal Settings - Sign In Configuration
resource portalSignInSettings 'Microsoft.ApiManagement/service/portalsettings@2023-05-01-preview' = {
  parent: apimService
  name: 'signin'
  properties: {
    enabled: true
    termsOfService: {
      enabled: (termsOfServiceText != '')
      text: termsOfServiceText
      consentRequired: termsOfServiceConsentRequired
    }
  }
}

// Portal Settings - Sign Up Configuration
resource portalSignUpSettings 'Microsoft.ApiManagement/service/portalsettings@2023-05-01-preview' = {
  parent: apimService
  name: 'signup'
  properties: {
    enabled: enablePortalSignup
    termsOfService: {
      enabled: (termsOfServiceText != '')
      text: termsOfServiceText
      consentRequired: termsOfServiceConsentRequired
    }
  }
}

// Portal Settings - Delegation Configuration
resource portalDelegationSettings 'Microsoft.ApiManagement/service/portalsettings@2023-05-01-preview' = {
  parent: apimService
  name: 'delegation'
  properties: {
    enabled: enablePortalDelegation
    url: portalDelegationUrl
    validationKey: portalDelegationValidationKey
    subscriptions: {
      enabled: enablePortalDelegation
    }
    userRegistration: {
      enabled: enablePortalDelegation
    }
  }
}

// Correct Notification Templates (using actual template names)
resource notificationTemplates 'Microsoft.ApiManagement/service/templates@2023-05-01-preview' = [for template in [
  'ApplicationApprovedNotificationMessage'
  'AccountClosedDeveloper'
  'QuotaLimitApproachingDeveloperNotificationMessage'
  'NewDeveloperNotificationMessage'
  'EmailChangeIdentityDefault'
  'InviteUserNotificationMessage'
  'NewCommentNotificationMessage'
  'ConfirmSignUpIdentityDefault'
  'NewIssueNotificationMessage'
  'PurchaseDeveloperNotificationMessage'
  'PasswordResetIdentityDefault'
  'PasswordResetByAdminNotificationMessage'
  'RejectDeveloperNotificationMessage'
  'RequestDeveloperNotificationMessage'
] : {
  parent: apimService
  name: template
  properties: {
    subject: 'Notification from ${apimServiceName}'
    body: 'This is a notification from ${apimServiceName} API Management service.'
  }
}]

// Role Assignment for APIM Managed Identity to access Storage Account
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(apimService.id, storageAccount.id, 'Storage Blob Data Contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') // Storage Blob Data Contributor
    principalId: apimService.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Named Values for Portal Configuration
resource namedValues 'Microsoft.ApiManagement/service/namedValues@2023-05-01-preview' = [for namedValue in [
  {
    name: 'portal-storage-connection-string'
    value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
    displayName: 'Portal Storage Connection String'
    secret: true
  }
  {
    name: 'portal-base-url'
    value: 'https://${apimServiceName}.developer.azure-api.net'
    displayName: 'Portal Base URL'
    secret: false
  }
  {
    name: 'gateway-base-url'
    value: 'https://${apimServiceName}.azure-api.net'
    displayName: 'Gateway Base URL'
    secret: false
  }
] : {
  parent: apimService
  name: namedValue.name
  properties: {
    displayName: namedValue.displayName
    value: namedValue.value
    secret: namedValue.secret
  }
}]

// Global Policy for CORS and Security
resource globalPolicy 'Microsoft.ApiManagement/service/policies@2023-05-01-preview' = {
  parent: apimService
  name: 'policy'
  properties: {
    value: '''
    <policies>
      <inbound>
        <cors allow-credentials="true">
          <allowed-origins>
            <origin>https://${apimServiceName}.developer.azure-api.net</origin>
            <origin>https://localhost:3000</origin>
          </allowed-origins>
          <allowed-methods preflight-result-max-age="3600">
            <method>GET</method>
            <method>POST</method>
            <method>PUT</method>
            <method>DELETE</method>
            <method>HEAD</method>
            <method>OPTIONS</method>
          </allowed-methods>
          <allowed-headers>
            <header>*</header>
          </allowed-headers>
        </cors>
        <set-header name="X-Frame-Options" exists-action="override">
          <value>DENY</value>
        </set-header>
        <set-header name="X-Content-Type-Options" exists-action="override">
          <value>nosniff</value>
        </set-header>
      </inbound>
      <backend>
        <forward-request />
      </backend>
      <outbound>
        <set-header name="X-Powered-By" exists-action="delete" />
        <set-header name="Server" exists-action="delete" />
      </outbound>
      <on-error />
    </policies>
    '''
    format: 'xml'
  }
}

// Products (Essential for Developer Portal)
resource starterProduct 'Microsoft.ApiManagement/service/products@2023-05-01-preview' = {
  parent: apimService
  name: 'starter'
  properties: {
    displayName: 'Starter'
    description: 'Subscribers will be able to run 5 calls/minute up to a maximum of 100 calls/week.'
    subscriptionRequired: true
    approvalRequired: false
    subscriptionsLimit: 1
    state: 'published'
    terms: 'By subscribing to this product you agree to the Terms of Use.'
  }
}

resource unlimitedProduct 'Microsoft.ApiManagement/service/products@2023-05-01-preview' = {
  parent: apimService
  name: 'unlimited'
  properties: {
    displayName: 'Unlimited'
    description: 'Subscribers have completely unlimited access to the API. Administrator approval is required.'
    subscriptionRequired: true
    approvalRequired: true
    state: 'published'
    terms: 'By subscribing to this product you agree to the Terms of Use.'
  }
}

// Logger for Application Insights (Optional but recommended)
resource apimLogger 'Microsoft.ApiManagement/service/loggers@2023-05-01-preview' = {
  parent: apimService
  name: 'applicationinsights'
  properties: {
    loggerType: 'applicationInsights'
    description: 'Application Insights logger for APIM'
    credentials: {
      instrumentationKey: '{{Logger-Credentials-applicationinsights}}'
    }
    isBuffered: true
  }
}

// Outputs
@description('The name of the created API Management service')
output apimServiceName string = apimService.name

@description('The resource ID of the created API Management service')
output apimServiceId string = apimService.id

@description('The gateway URL of the API Management service')
output apimGatewayUrl string = apimService.properties.gatewayUrl

@description('The developer portal URL of the API Management service')
output apimPortalUrl string = apimService.properties.developerPortalUrl

@description('The management API URL of the API Management service')
output apimManagementApiUrl string = apimService.properties.managementApiUrl

@description('The system assigned managed identity principal ID')
output apimPrincipalId string = apimService.identity.principalId

@description('The storage account name for media files')
output storageAccountName string = storageAccount.name

@description('The storage account connection string')
output storageConnectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

@description('The content container URL')
output contentContainerUrl string = '${storageAccount.properties.primaryEndpoints.blob}content'

@description('The public IP addresses of the API Management service')
output apimPublicIPAddresses array = apimService.properties.publicIPAddresses

@description('The private IP addresses of the API Management service') 
output apimPrivateIPAddresses array = apimService.properties.privateIPAddresses
