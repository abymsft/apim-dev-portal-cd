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

// Built-in logging policy for API Management
resource apimLogger 'Microsoft.ApiManagement/service/loggers@2023-05-01-preview' = {
  parent: apimService
  name: 'applicationinsights'
  properties: {
    loggerType: 'applicationInsights'
    description: 'Application Insights logger'
    credentials: {
      instrumentationKey: '{{Logger-Credentials-applicationinsights}}'
    }
    isBuffered: true
  }
}

// Default API Management policies
resource apimPolicy 'Microsoft.ApiManagement/service/policies@2023-05-01-preview' = {
  parent: apimService
  name: 'policy'
  properties: {
    value: '''
    <policies>
      <inbound>
        <cors allow-credentials="true">
          <allowed-origins>
            <origin>*</origin>
          </allowed-origins>
          <allowed-methods preflight-result-max-age="3600">
            <method>*</method>
          </allowed-methods>
          <allowed-headers>
            <header>*</header>
          </allowed-headers>
        </cors>
      </inbound>
      <backend>
        <forward-request />
      </backend>
      <outbound />
      <on-error />
    </policies>
    '''
    format: 'xml'
  }
}

// Output values
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

@description('The public IP addresses of the API Management service')
output apimPublicIPAddresses array = apimService.properties.publicIPAddresses

@description('The private IP addresses of the API Management service') 
output apimPrivateIPAddresses array = apimService.properties.privateIPAddresses
