import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as path from "path";

export class VoxaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sonicContainerImageUri = new cdk.CfnParameter(this, "SonicContainerImageUri", {
      type: "String",
      default: "235494787608.dkr.ecr.us-east-1.amazonaws.com/voxa-sonic-service:latest",
      description: "Container image URI for the Sonic ECS runtime service (Node + Nova Sonic)."
    });
    const cognitoDomainPrefix = new cdk.CfnParameter(this, "CognitoDomainPrefix", {
      type: "String",
      default: "voxa-auth-dev",
      description: "Unique Cognito Hosted UI domain prefix."
    });
    // Comma-separated URLs. Must match exactly what the app sends (no trailing slash on callback path).
    // Include both localhost and 127.0.0.1 so dev works with either.
    const webCallbackUrls = new cdk.CfnParameter(this, "WebCallbackUrls", {
      type: "String",
      default: "https://callcentral.vercel.app/auth/callback,https://callcentral-55rn8hgk2-rehaancubes-6193s-projects.vercel.app/auth/callback,http://localhost:8080/auth/callback,http://localhost:5173/auth/callback,http://127.0.0.1:8080/auth/callback,http://127.0.0.1:5173/auth/callback",
      description: "Comma-separated callback URLs for Cognito (production, preview, localhost, 127.0.0.1). No trailing slash."
    });
    const webLogoutUrls = new cdk.CfnParameter(this, "WebLogoutUrls", {
      type: "String",
      default: "https://callcentral.vercel.app/,https://callcentral-55rn8hgk2-rehaancubes-6193s-projects.vercel.app/,http://localhost:8080/,http://localhost:5173/,http://127.0.0.1:8080/,http://127.0.0.1:5173/",
      description: "Comma-separated sign-out URLs for Cognito."
    });
    const knowledgeBaseIdParam = new cdk.CfnParameter(this, "KnowledgeBaseId", {
      type: "String",
      default: "",
      description: "Optional. Bedrock Knowledge Base ID for auto-sync (create in console, add S3 data source from voxa-kb-content bucket)."
    });
    const kbDataSourceIdParam = new cdk.CfnParameter(this, "KbDataSourceId", {
      type: "String",
      default: "",
      description: "Optional. Data source ID of the S3 data source in the Knowledge Base."
    });
    const sonicServicePublicUrlParam = new cdk.CfnParameter(this, "SonicServicePublicUrl", {
      type: "String",
      default: "",
      description: "Optional. Public HTTPS URL for Sonic (e.g. https://sonic.yourdomain.com). When set, clients use wss:// for voice. Leave empty to use ALB http URL."
    });
    const callcentralEC2RoleNameParam = new cdk.CfnParameter(this, "CallcentralEC2RoleName", {
      type: "String",
      default: "callcentralEC2",
      description: "Optional. IAM role name for EC2 (e.g. SIP trunk) that needs PhoneNumbersTable read for DID lookup. Same account as stack. Leave empty to skip grant."
    });

    const conversationsTable = new ddb.Table(this, "ConversationsTable", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    conversationsTable.addGlobalSecondaryIndex({
      indexName: "HandleCreatedAtIndex",
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: ddb.AttributeType.STRING }
    });

    const handlesTable = new ddb.Table(this, "HandlesTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const bookingsTable = new ddb.Table(this, "BookingsTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "startTime", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    bookingsTable.addGlobalSecondaryIndex({
      indexName: "BookingsEmailIndex",
      partitionKey: { name: "email", type: ddb.AttributeType.STRING },
      sortKey: { name: "startTime", type: ddb.AttributeType.STRING }
    });
    bookingsTable.addGlobalSecondaryIndex({
      indexName: "BookingsPhoneIndex",
      partitionKey: { name: "phone", type: ddb.AttributeType.STRING },
      sortKey: { name: "startTime", type: ddb.AttributeType.STRING }
    });

    const customersTable = new ddb.Table(this, "CustomersTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "customerId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    customersTable.addGlobalSecondaryIndex({
      indexName: "HandleLastSeenIndex",
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "lastSeenAt", type: ddb.AttributeType.STRING }
    });

    const businessConfigTable = new ddb.Table(this, "BusinessConfigTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "configType", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const branchesTable = new ddb.Table(this, "BranchesTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "branchId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const servicesTable = new ddb.Table(this, "ServicesTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "serviceId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    servicesTable.addGlobalSecondaryIndex({
      indexName: "HandleUseCaseIndex",
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "useCaseId", type: ddb.AttributeType.STRING }
    });

    const doctorsTable = new ddb.Table(this, "DoctorsTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "doctorId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const locationsTable = new ddb.Table(this, "LocationsTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "locationId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const gamingCentersTable = new ddb.Table(this, "GamingCentersTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "centerId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const callersTable = new ddb.Table(this, "CallersTable", {
      partitionKey: { name: "phoneE164", type: ddb.AttributeType.STRING },
      sortKey: { name: "lastSeenAt", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const phoneNumbersTable = new ddb.Table(this, "PhoneNumbersTable", {
      partitionKey: { name: "phoneNumber", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Members table — owner-added managers per business handle
    const membersTable = new ddb.Table(this, "MembersTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "email", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    // GSI to query "which handles does this email have access to"
    membersTable.addGlobalSecondaryIndex({
      indexName: "EmailIndex",
      partitionKey: { name: "email", type: ddb.AttributeType.STRING },
      sortKey: { name: "handle", type: ddb.AttributeType.STRING }
    });

    // Catalog table — retail product catalog
    const catalogTable = new ddb.Table(this, "CatalogTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "itemId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Tokens table — clinic queue tokens
    const tokensTable = new ddb.Table(this, "TokensTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "tokenId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    tokensTable.addGlobalSecondaryIndex({
      indexName: "HandleDateIndex",
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "date", type: ddb.AttributeType.STRING }
    });

    // Credits table — tracks credit balance per business
    const creditsTable = new ddb.Table(this, "CreditsTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Payments table — stores simulated payment records
    const paymentsTable = new ddb.Table(this, "PaymentsTable", {
      partitionKey: { name: "paymentId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    paymentsTable.addGlobalSecondaryIndex({
      indexName: "HandleIndex",
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: ddb.AttributeType.STRING }
    });

    // Requests table — callback/contact requests for general businesses
    const requestsTable = new ddb.Table(this, "RequestsTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "requestId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    requestsTable.addGlobalSecondaryIndex({
      indexName: "HandleCreatedAtIndex",
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: ddb.AttributeType.STRING }
    });

    // Tickets table — support tickets for customer_support businesses
    const ticketsTable = new ddb.Table(this, "TicketsTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "ticketId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    ticketsTable.addGlobalSecondaryIndex({
      indexName: "HandleStatusIndex",
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      sortKey: { name: "status", type: ddb.AttributeType.STRING }
    });
    ticketsTable.addGlobalSecondaryIndex({
      indexName: "PhoneIndex",
      partitionKey: { name: "phone", type: ddb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: ddb.AttributeType.STRING }
    });

    // Website config table — stores website customization per business
    const websiteConfigTable = new ddb.Table(this, "WebsiteConfigTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Salesbot — campaigns table
    const salesCampaignsTable = new ddb.Table(this, "SalesCampaignsTable", {
      partitionKey: { name: "campaignId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Salesbot — leads table
    const salesLeadsTable = new ddb.Table(this, "SalesLeadsTable", {
      partitionKey: { name: "campaignId", type: ddb.AttributeType.STRING },
      sortKey: { name: "leadId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    salesLeadsTable.addGlobalSecondaryIndex({
      indexName: "CallUniqueIdIndex",
      partitionKey: { name: "callUniqueId", type: ddb.AttributeType.STRING }
    });

    // BMS outbound voice config (handle, system prompt, voice, KB for salesbot)
    const bmsOutboundConfigTable = new ddb.Table(this, "BmsOutboundConfigTable", {
      partitionKey: { name: "configKey", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const kbContentBucket = new s3.Bucket(this, "VoxaKbContentBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // Website assets bucket — stores uploaded business website images
    const websiteAssetsBucket = new s3.Bucket(this, "VoxaWebsiteAssetsBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"]
        }
      ]
    });

    // Recordings bucket — stores MP3 call recordings (both sides mixed)
    const recordingsBucket = new s3.Bucket(this, "VoxaRecordingsBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"]
        }
      ]
    });

    // IAM role for Bedrock Knowledge Bases (data source + vector store access). Used when we create a KB per handle.
    const kbServiceRole = new iam.Role(this, "VoxaKbServiceRole", {
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com").withConditions({
        StringEquals: { "aws:SourceAccount": cdk.Stack.of(this).account },
        ArnLike: { "aws:SourceArn": `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:knowledge-base/*` }
      }),
      description: "Role for Bedrock KB to read S3 content and write to S3 Vectors"
    });
    kbContentBucket.grantReadWrite(kbServiceRole); // needed to read content and write supplemental multimodal data
    kbServiceRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3vectors:PutVectors",
          "s3vectors:GetVectors",
          "s3vectors:DeleteVectors",
          "s3vectors:QueryVectors",
          "s3vectors:GetIndex"
        ],
        resources: ["*"]
      })
    );
    kbServiceRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v*",
          "arn:aws:bedrock:*::foundation-model/amazon.nova-2-multimodal-embeddings-v*"
        ]
      })
    );

    handlesTable.addGlobalSecondaryIndex({
      indexName: "DiscoveryIndex",
      partitionKey: { name: "discoveryKey", type: ddb.AttributeType.STRING },
      sortKey: { name: "discoveryRank", type: ddb.AttributeType.STRING }
    });

    handlesTable.addGlobalSecondaryIndex({
      indexName: "OwnerIndex",
      partitionKey: { name: "ownerId", type: ddb.AttributeType.STRING },
      sortKey: { name: "handle", type: ddb.AttributeType.STRING }
    });

    handlesTable.addGlobalSecondaryIndex({
      indexName: "OwnerEmailIndex",
      partitionKey: { name: "ownerEmail", type: ddb.AttributeType.STRING },
      sortKey: { name: "handle", type: ddb.AttributeType.STRING }
    });

    const userPool = new cognito.UserPool(this, "VoxaUserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      standardAttributes: {
        email: { required: true, mutable: true }
      }
    });

    // Split at deploy time via CloudFormation (CfnParameter is a token; JS .split() does not produce separate list items).
    const callbackUrlList = cdk.Fn.split(",", webCallbackUrls.valueAsString);
    const logoutUrlList = cdk.Fn.split(",", webLogoutUrls.valueAsString);
    const userPoolClient = userPool.addClient("VoxaWebClient", {
      authFlows: {
        custom: true,
        adminUserPassword: true,
      },
      generateSecret: false,
      oAuth: {
        callbackUrls: callbackUrlList as unknown as string[],
        logoutUrls: logoutUrlList as unknown as string[],
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        flows: {
          implicitCodeGrant: true
        }
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO]
    });

    const cfnClient = userPoolClient.node.defaultChild as cognito.CfnUserPoolClient | undefined;
    if (cfnClient) {
      cfnClient.addPropertyOverride("AccessTokenValidity", 86400);
      cfnClient.addPropertyOverride("IdTokenValidity", 86400);
      cfnClient.addPropertyOverride("RefreshTokenValidity", 31536000);
      cfnClient.addPropertyOverride("TokenValidityUnits", {
        AccessToken: "seconds",
        IdToken: "seconds",
        RefreshToken: "seconds"
      });
    }

    const userPoolDomain = userPool.addDomain("VoxaUserPoolDomain", {
      cognitoDomain: {
        domainPrefix: cognitoDomainPrefix.valueAsString
      }
    });

    // Layer with aws-sdk (Node 20 runtimes don't bundle it)
    const awsSdkLayer = new lambda.LayerVersion(this, "AwsSdkLayer", {
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda-layer")),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: "aws-sdk v2 for VOXA Lambdas"
    });

    // Cognito CUSTOM_AUTH triggers for phone+OTP
    const authTriggerCode = lambda.Code.fromAsset(path.join(__dirname, ".."), {
      exclude: ["cdk.out", "node_modules", ".git"],
    });
    const defineAuthFn = new lambda.Function(this, "DefineAuthChallengeFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/define-auth-challenge.handler",
      code: authTriggerCode,
    });
    const createAuthFn = new lambda.Function(this, "CreateAuthChallengeFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/create-auth-challenge.handler",
      code: authTriggerCode,
      layers: [awsSdkLayer],
      environment: {
        SENDER_EMAIL: "rehaan@mobil80.com",
      },
    });
    createAuthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["sns:Publish", "ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    }));
    const verifyAuthFn = new lambda.Function(this, "VerifyAuthChallengeFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/verify-auth-challenge.handler",
      code: authTriggerCode,
    });

    userPool.addTrigger(cognito.UserPoolOperation.DEFINE_AUTH_CHALLENGE, defineAuthFn);
    userPool.addTrigger(cognito.UserPoolOperation.CREATE_AUTH_CHALLENGE, createAuthFn);
    userPool.addTrigger(cognito.UserPoolOperation.VERIFY_AUTH_CHALLENGE_RESPONSE, verifyAuthFn);

    const vpc = new ec2.Vpc(this, "VoxaVpc", {
      natGateways: 1,
      maxAzs: 2
    });

    const cluster = new ecs.Cluster(this, "VoxaCluster", { vpc });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "SonicTaskDef", {
      cpu: 1024,
      memoryLimitMiB: 2048,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
      }
    });

    taskDefinition.addContainer("SonicContainer", {
      image: ecs.ContainerImage.fromRegistry(sonicContainerImageUri.valueAsString),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "voxa-sonic" }),
      environment: {
        AWS_REGION: cdk.Stack.of(this).region,
        SONIC_MODEL_ID: "amazon.nova-2-sonic-v1:0",
        BOOKINGS_TABLE: bookingsTable.tableName,
        HANDLES_TABLE: handlesTable.tableName,
        SERVICES_TABLE: servicesTable.tableName,
        CUSTOMERS_TABLE: customersTable.tableName,
        BRANCHES_TABLE: branchesTable.tableName,
        GAMING_CENTERS_TABLE: gamingCentersTable.tableName,
        CATALOG_TABLE: catalogTable.tableName,
        TOKENS_TABLE: tokensTable.tableName,
        CONVERSATIONS_TABLE: conversationsTable.tableName,
        RECORDINGS_BUCKET: recordingsBucket.bucketName,
        CREDITS_TABLE: creditsTable.tableName,
        REQUESTS_TABLE: requestsTable.tableName,
        TICKETS_TABLE: ticketsTable.tableName,
        SALESBOT_WEBHOOK_URL: "",
        SALESBOT_WEBHOOK_SECRET: "voxa-salesbot-internal-2024"
      },
      portMappings: [{ containerPort: 80 }]
    });

    taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:InvokeModelWithBidirectionalStream",
          "bedrock:Retrieve"
        ],
        resources: ["*"]
      })
    );

    // Allow execution role to pull container image from ECR (required for private ECR)
    taskDefinition.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"]
      })
    );
    taskDefinition.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ],
        resources: [`arn:aws:ecr:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:repository/*`]
      })
    );

    const sonicService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "SonicService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      publicLoadBalancer: true
    });

    sonicService.targetGroup.configureHealthCheck({
      path: "/",
      healthyHttpCodes: "200",
    });

    const sonicUrlProvided = new cdk.CfnCondition(this, "SonicUrlProvided", {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(sonicServicePublicUrlParam.valueAsString, ""))
    });
    const albHttpUrl = cdk.Fn.join("", ["http://", sonicService.loadBalancer.loadBalancerDnsName]);
    const sonicServiceUrl = cdk.Fn.conditionIf(
      "SonicUrlProvided",
      sonicServicePublicUrlParam.valueAsString,
      albHttpUrl
    );

    const commonEnv = {
      CONVERSATIONS_TABLE: conversationsTable.tableName,
      HANDLES_TABLE: handlesTable.tableName,
      HANDLES_OWNER_INDEX: "OwnerIndex",
      HANDLES_OWNER_EMAIL_INDEX: "OwnerEmailIndex",
      BOOKINGS_TABLE: bookingsTable.tableName,
      BOOKINGS_EMAIL_INDEX: "BookingsEmailIndex",
      BOOKINGS_PHONE_INDEX: "BookingsPhoneIndex",
      CUSTOMERS_TABLE: customersTable.tableName,
      CUSTOMERS_LAST_SEEN_INDEX: "HandleLastSeenIndex",
      BUSINESS_CONFIG_TABLE: businessConfigTable.tableName,
      BRANCHES_TABLE: branchesTable.tableName,
      SERVICES_TABLE: servicesTable.tableName,
      DOCTORS_TABLE: doctorsTable.tableName,
      LOCATIONS_TABLE: locationsTable.tableName,
      GAMING_CENTERS_TABLE: gamingCentersTable.tableName,
      CALLERS_TABLE: callersTable.tableName,
      PHONE_NUMBERS_TABLE: phoneNumbersTable.tableName,
      MEMBERS_TABLE: membersTable.tableName,
      MEMBERS_EMAIL_INDEX: "EmailIndex",
      CATALOG_TABLE: catalogTable.tableName,
      TOKENS_TABLE: tokensTable.tableName,
      CREDITS_TABLE: creditsTable.tableName,
      PAYMENTS_TABLE: paymentsTable.tableName,
      PAYMENTS_HANDLE_INDEX: "HandleIndex",
      REQUESTS_TABLE: requestsTable.tableName,
      TICKETS_TABLE: ticketsTable.tableName,
      WEBSITE_CONFIG_TABLE: websiteConfigTable.tableName,
      WEBSITE_ASSETS_BUCKET: websiteAssetsBucket.bucketName,
      RECORDINGS_BUCKET: recordingsBucket.bucketName,
      SALES_CAMPAIGNS_TABLE: salesCampaignsTable.tableName,
      SALES_LEADS_TABLE: salesLeadsTable.tableName,
      BMS_OUTBOUND_CONFIG_TABLE: bmsOutboundConfigTable.tableName,
      SONIC_SERVICE_URL: sonicServiceUrl as unknown as string,
      SONIC_MODEL_ID: "amazon.nova-2-sonic-v1:0",
      TEXT_MODEL_ID: "amazon.nova-lite-v1:0",
      BEDROCK_REGION: cdk.Stack.of(this).region,
      COGNITO_USER_POOL_ID: userPool.userPoolId
    };
    const lambdaCode = lambda.Code.fromAsset(path.join(__dirname, ".."), {
      exclude: ["cdk.out", "node_modules", ".git"]
    });

    const layer = [awsSdkLayer];

    const syncKnowledgeFn = new lambda.Function(this, "SyncKnowledgeFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/sync-knowledge.handler",
      code: lambdaCode,
      environment: {
        ...commonEnv,
        KB_CONTENT_BUCKET: kbContentBucket.bucketName,
        DEFAULT_KNOWLEDGE_BASE_ID: knowledgeBaseIdParam.valueAsString,
        DEFAULT_KB_DATA_SOURCE_ID: kbDataSourceIdParam.valueAsString
      },
      layers: layer,
      timeout: cdk.Duration.seconds(90)
    });
    kbContentBucket.grantPut(syncKnowledgeFn);
    handlesTable.grantReadData(syncKnowledgeFn);
    branchesTable.grantReadData(syncKnowledgeFn);
    servicesTable.grantReadData(syncKnowledgeFn);
    doctorsTable.grantReadData(syncKnowledgeFn);
    locationsTable.grantReadData(syncKnowledgeFn);
    gamingCentersTable.grantReadData(syncKnowledgeFn);
    businessConfigTable.grantReadData(syncKnowledgeFn);
    catalogTable.grantReadData(syncKnowledgeFn);
    syncKnowledgeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:StartIngestionJob", "bedrock:GetIngestionJob"],
        resources: ["*"]
      })
    );

    const createKnowledgeBaseFn = new lambda.Function(this, "CreateKnowledgeBaseFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/create-knowledge-base.handler",
      code: lambdaCode,
      environment: {
        ...commonEnv,
        KB_CONTENT_BUCKET: kbContentBucket.bucketName,
        KB_CONTENT_BUCKET_ARN: kbContentBucket.bucketArn,
        KB_ROLE_ARN: kbServiceRole.roleArn,
        EMBEDDING_MODEL_ARN: `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.nova-2-multimodal-embeddings-v1:0`,
        EMBEDDING_DIMENSION: "3072",
        SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn,
        AWS_ACCOUNT_ID: cdk.Stack.of(this).account
      },
      layers: layer,
      timeout: cdk.Duration.seconds(120)
    });
    handlesTable.grantReadWriteData(createKnowledgeBaseFn);
    syncKnowledgeFn.grantInvoke(createKnowledgeBaseFn);
    createKnowledgeBaseFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3vectors:CreateVectorBucket", "s3vectors:CreateIndex", "s3vectors:DeleteIndex", "s3vectors:DeleteVectorBucket"],
        resources: ["*"]
      })
    );
    createKnowledgeBaseFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:CreateKnowledgeBase", "bedrock:CreateDataSource", "bedrock:ListDataSources", "bedrock:ListKnowledgeBases"],
        resources: ["*"]
      })
    );
    createKnowledgeBaseFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [kbServiceRole.roleArn],
        conditions: {
          StringEquals: { "iam:PassedToService": "bedrock.amazonaws.com" }
        }
      })
    );

    const healthFn = new lambda.Function(this, "HealthFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/health.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const createSessionFn = new lambda.Function(this, "CreateSessionFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/session.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const messageFn = new lambda.Function(this, "MessageFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/message.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer,
      timeout: cdk.Duration.seconds(30),
    });

    const upsertHandleFn = new lambda.Function(this, "UpsertHandleFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/handle-upsert.handler",
      code: lambdaCode,
      environment: {
        ...commonEnv,
        SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn,
        CREATE_KNOWLEDGE_BASE_FUNCTION_ARN: createKnowledgeBaseFn.functionArn
      },
      layers: layer
    });
    syncKnowledgeFn.grantInvoke(upsertHandleFn);
    createKnowledgeBaseFn.grantInvoke(upsertHandleFn);

    const getHandleFn = new lambda.Function(this, "GetHandleFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/handle-get.handler",
      code: lambdaCode,
      environment: { ...commonEnv, DEFAULT_KNOWLEDGE_BASE_ID: knowledgeBaseIdParam.valueAsString },
      layers: layer
    });

    const publicSlotsFn = new lambda.Function(this, "PublicSlotsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/public-slots.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const listMyHandlesFn = new lambda.Function(this, "ListMyHandlesFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/handle-list-mine.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const sonicConfigFn = new lambda.Function(this, "SonicConfigFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/sonic-config.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const getSessionMessagesFn = new lambda.Function(this, "GetSessionMessagesFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/session-messages.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const getHandleConversationsFn = new lambda.Function(this, "GetHandleConversationsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/handle-conversations.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const sonicSessionFn = new lambda.Function(this, "SonicSessionFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/sonic-session.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    conversationsTable.grantReadWriteData(createSessionFn);
    conversationsTable.grantReadWriteData(messageFn);
    conversationsTable.grantReadData(getSessionMessagesFn);
    conversationsTable.grantReadData(getHandleConversationsFn);
    recordingsBucket.grantRead(getHandleConversationsFn);
    handlesTable.grantReadWriteData(upsertHandleFn);
    handlesTable.grantReadData(getHandleFn);
    doctorsTable.grantReadData(getHandleFn);
    locationsTable.grantReadData(getHandleFn);
    servicesTable.grantReadData(getHandleFn);
    branchesTable.grantReadData(getHandleFn);
    gamingCentersTable.grantReadData(getHandleFn);
    businessConfigTable.grantReadData(publicSlotsFn);
    bookingsTable.grantReadData(publicSlotsFn);
    gamingCentersTable.grantReadData(publicSlotsFn);
    handlesTable.grantReadData(listMyHandlesFn);
    membersTable.grantReadData(listMyHandlesFn); // needed to look up manager handles via EmailIndex
    // Allow Sonic ECS task role to read/write bookings and customers via the booking tools
    bookingsTable.grantReadWriteData(taskDefinition.taskRole);
    handlesTable.grantReadData(taskDefinition.taskRole);
    servicesTable.grantReadData(taskDefinition.taskRole);
    customersTable.grantReadWriteData(taskDefinition.taskRole);
    branchesTable.grantReadData(taskDefinition.taskRole);
    gamingCentersTable.grantReadData(taskDefinition.taskRole);
    handlesTable.grantReadData(createSessionFn); // session Lambda reads handle profile for persona
    handlesTable.grantReadData(messageFn); // message Lambda reads handle profile for knowledge base + persona
    bookingsTable.grantReadWriteData(messageFn); // message Lambda creates bookings via AI tool calls
    requestsTable.grantReadWriteData(messageFn); // message Lambda creates callback requests for general use case (chat → Requests tab)
    customersTable.grantReadWriteData(messageFn); // message Lambda upserts customer when general business create_request is used
    handlesTable.grantReadData(sonicSessionFn);

    const bookingsFn = new lambda.Function(this, "BookingsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/bookings.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const discoverySearchFn = new lambda.Function(this, "DiscoverySearchFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/discovery-search.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const phoneEntryFn = new lambda.Function(this, "PhoneEntryFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/phone-entry.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const businessConfigFn = new lambda.Function(this, "BusinessConfigFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/business-config.handler",
      code: lambdaCode,
      environment: { ...commonEnv, SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn },
      layers: layer
    });
    syncKnowledgeFn.grantInvoke(businessConfigFn);

    const customersListFn = new lambda.Function(this, "CustomersListFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/customers-list.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });

    const branchesFn = new lambda.Function(this, "BranchesFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/branches.handler",
      code: lambdaCode,
      environment: { ...commonEnv, SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn },
      layers: layer
    });
    syncKnowledgeFn.grantInvoke(branchesFn);

    const servicesFn = new lambda.Function(this, "ServicesFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/services.handler",
      code: lambdaCode,
      environment: { ...commonEnv, SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn },
      layers: layer
    });
    syncKnowledgeFn.grantInvoke(servicesFn);

    const doctorsFn = new lambda.Function(this, "DoctorsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/doctors.handler",
      code: lambdaCode,
      environment: { ...commonEnv, SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn },
      layers: layer
    });
    syncKnowledgeFn.grantInvoke(doctorsFn);

    const locationsFn = new lambda.Function(this, "LocationsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/locations.handler",
      code: lambdaCode,
      environment: { ...commonEnv, SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn },
      layers: layer
    });
    syncKnowledgeFn.grantInvoke(locationsFn);

    const centersFn = new lambda.Function(this, "CentersFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/centers.handler",
      code: lambdaCode,
      environment: { ...commonEnv, SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn },
      layers: layer
    });
    syncKnowledgeFn.grantInvoke(centersFn);

    const knowledgeIngestImageFn = new lambda.Function(this, "KnowledgeIngestImageFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/knowledge-ingest-image.handler",
      code: lambdaCode,
      environment: { ...commonEnv, SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn },
      layers: layer,
      timeout: cdk.Duration.seconds(30)
    });
    syncKnowledgeFn.grantInvoke(knowledgeIngestImageFn);
    handlesTable.grantReadWriteData(knowledgeIngestImageFn);
    knowledgeIngestImageFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:DetectDocumentText"],
        resources: ["*"]
      })
    );

    const knowledgeUploadFileFn = new lambda.Function(this, "KnowledgeUploadFileFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/knowledge-upload-file.handler",
      code: lambdaCode,
      environment: {
        ...commonEnv,
        KB_CONTENT_BUCKET: kbContentBucket.bucketName,
        SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn
      },
      layers: layer,
      timeout: cdk.Duration.seconds(25)
    });
    kbContentBucket.grantPut(knowledgeUploadFileFn);
    syncKnowledgeFn.grantInvoke(knowledgeUploadFileFn);
    handlesTable.grantReadData(knowledgeUploadFileFn);

    const knowledgeTriggerSyncFn = new lambda.Function(this, "KnowledgeTriggerSyncFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/knowledge-trigger-sync.handler",
      code: lambdaCode,
      environment: {
        ...commonEnv,
        SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn,
        CREATE_KNOWLEDGE_BASE_FUNCTION_ARN: createKnowledgeBaseFn.functionArn
      },
      layers: layer,
      timeout: cdk.Duration.seconds(90)
    });
    syncKnowledgeFn.grantInvoke(knowledgeTriggerSyncFn);
    createKnowledgeBaseFn.grantInvoke(knowledgeTriggerSyncFn);
    handlesTable.grantReadData(knowledgeTriggerSyncFn);

    // Knowledge preview Lambda — returns formatted knowledge document for dashboard display (no S3/ingestion)
    const knowledgePreviewFn = new lambda.Function(this, "KnowledgePreviewFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/knowledge-preview.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer,
      timeout: cdk.Duration.seconds(15)
    });
    handlesTable.grantReadData(knowledgePreviewFn);
    branchesTable.grantReadData(knowledgePreviewFn);
    servicesTable.grantReadData(knowledgePreviewFn);
    doctorsTable.grantReadData(knowledgePreviewFn);
    locationsTable.grantReadData(knowledgePreviewFn);
    gamingCentersTable.grantReadData(knowledgePreviewFn);
    catalogTable.grantReadData(knowledgePreviewFn);
    membersTable.grantReadData(knowledgePreviewFn);

    // Knowledge files Lambda — list and delete uploaded S3 files for a handle
    const knowledgeFilesFn = new lambda.Function(this, "KnowledgeFilesFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/knowledge-files.handler",
      code: lambdaCode,
      environment: {
        ...commonEnv,
        KB_CONTENT_BUCKET: kbContentBucket.bucketName,
        SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn
      },
      layers: layer,
      timeout: cdk.Duration.seconds(15)
    });
    kbContentBucket.grantRead(knowledgeFilesFn);
    kbContentBucket.grantDelete(knowledgeFilesFn);
    handlesTable.grantReadData(knowledgeFilesFn);
    membersTable.grantReadData(knowledgeFilesFn);
    syncKnowledgeFn.grantInvoke(knowledgeFilesFn);

    // Members Lambda
    const membersFn = new lambda.Function(this, "MembersFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/members.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    membersTable.grantReadWriteData(membersFn);
    handlesTable.grantReadData(membersFn);

    // Credits Lambda
    const creditsFn = new lambda.Function(this, "CreditsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/credits.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    creditsTable.grantReadWriteData(creditsFn);
    handlesTable.grantReadData(creditsFn);

    // Phone Numbers Management Lambda
    const phoneNumbersManageFn = new lambda.Function(this, "PhoneNumbersManageFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/phone-numbers.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    phoneNumbersTable.grantReadWriteData(phoneNumbersManageFn);
    creditsTable.grantReadWriteData(phoneNumbersManageFn);
    handlesTable.grantReadWriteData(phoneNumbersManageFn);
    paymentsTable.grantReadWriteData(phoneNumbersManageFn);

    // Grant Callcentral EC2 role (SIP trunk) read access to PhoneNumbersTable for DID → handle lookup
    const callcentralEC2RoleName = callcentralEC2RoleNameParam.valueAsString;
    if (callcentralEC2RoleName) {
      const callcentralEC2Role = iam.Role.fromRoleArn(
        this,
        "CallcentralEC2Role",
        `arn:aws:iam::${this.account}:role/${callcentralEC2RoleName}`,
        { mutable: false }
      );
      phoneNumbersTable.grantReadData(callcentralEC2Role);
    }

    // BMS (Business Management System) Lambda — super-admin only
    const bmsFn = new lambda.Function(this, "BmsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/bms.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    phoneNumbersTable.grantReadData(bmsFn);
    paymentsTable.grantReadData(bmsFn);
    handlesTable.grantReadData(bmsFn);
    creditsTable.grantReadData(bmsFn);
    bookingsTable.grantReadData(bmsFn);
    conversationsTable.grantReadData(bmsFn);
    membersTable.grantReadData(bmsFn);
    websiteConfigTable.grantReadData(bmsFn);

    // Website Config Lambda
    const websiteConfigFn = new lambda.Function(this, "WebsiteConfigFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/website-config.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    websiteConfigTable.grantReadWriteData(websiteConfigFn);
    handlesTable.grantReadData(websiteConfigFn);
    membersTable.grantReadData(websiteConfigFn);
    gamingCentersTable.grantReadData(websiteConfigFn);
    branchesTable.grantReadData(websiteConfigFn);
    servicesTable.grantReadData(websiteConfigFn);
    doctorsTable.grantReadData(websiteConfigFn);

    // Website Upload Lambda
    const websiteUploadFn = new lambda.Function(this, "WebsiteUploadFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/website-upload.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer,
      timeout: cdk.Duration.seconds(15)
    });
    websiteAssetsBucket.grantPut(websiteUploadFn);
    websiteAssetsBucket.grantRead(websiteUploadFn);
    handlesTable.grantReadData(websiteUploadFn);
    membersTable.grantReadData(websiteUploadFn);

    // Catalog Lambda
    const catalogFn = new lambda.Function(this, "CatalogFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/catalog.handler",
      code: lambdaCode,
      environment: { ...commonEnv, SYNC_KNOWLEDGE_FUNCTION_ARN: syncKnowledgeFn.functionArn },
      layers: layer
    });
    catalogTable.grantReadWriteData(catalogFn);
    handlesTable.grantReadData(catalogFn);
    membersTable.grantReadData(catalogFn);
    syncKnowledgeFn.grantInvoke(catalogFn);

    // Tokens Lambda
    const tokensFn = new lambda.Function(this, "TokensFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/tokens.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    tokensTable.grantReadWriteData(tokensFn);
    handlesTable.grantReadData(tokensFn);
    membersTable.grantReadData(tokensFn);
    doctorsTable.grantReadData(tokensFn);

    // Recording presign Lambda
    const recordingPresignFn = new lambda.Function(this, "RecordingPresignFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/recording-presign.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    recordingsBucket.grantRead(recordingPresignFn);
    handlesTable.grantReadData(recordingPresignFn);
    membersTable.grantReadData(recordingPresignFn);

    // My Bookings Lambda (consumer self-service)
    const myBookingsFn = new lambda.Function(this, "MyBookingsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/my-bookings.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    bookingsTable.grantReadData(myBookingsFn);
    handlesTable.grantReadData(myBookingsFn);

    // Requests Lambda (general business type)
    const requestsFn = new lambda.Function(this, "RequestsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/requests.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    requestsTable.grantReadWriteData(requestsFn);
    handlesTable.grantReadData(requestsFn);
    membersTable.grantReadData(requestsFn);

    // Tickets Lambda (customer_support business type)
    const ticketsFn = new lambda.Function(this, "TicketsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/tickets.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    ticketsTable.grantReadWriteData(ticketsFn);
    handlesTable.grantReadData(ticketsFn);
    membersTable.grantReadData(ticketsFn);

    // Website Chat Lambda (AI chatbot for website editing using Titan Text)
    const websiteChatFn = new lambda.Function(this, "WebsiteChatFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/website-chat.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer,
      timeout: cdk.Duration.seconds(30)
    });
    websiteChatFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"]
      })
    );
    handlesTable.grantReadData(websiteChatFn);
    membersTable.grantReadData(websiteChatFn);

    // Support Config Lambda (customer_support categories & SLA)
    const supportConfigFn = new lambda.Function(this, "SupportConfigFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/support-config.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    businessConfigTable.grantReadWriteData(supportConfigFn);
    handlesTable.grantReadData(supportConfigFn);
    membersTable.grantReadData(supportConfigFn);

    // Grant Sonic ECS task role access to new tables + recordings bucket
    catalogTable.grantReadData(taskDefinition.taskRole);
    tokensTable.grantReadWriteData(taskDefinition.taskRole);
    conversationsTable.grantReadWriteData(taskDefinition.taskRole);
    recordingsBucket.grantPut(taskDefinition.taskRole);
    creditsTable.grantReadWriteData(taskDefinition.taskRole);
    requestsTable.grantReadWriteData(taskDefinition.taskRole);
    ticketsTable.grantReadWriteData(taskDefinition.taskRole);

    // Grant credits table to lambdas that deduct credits
    creditsTable.grantReadWriteData(messageFn);
    creditsTable.grantReadWriteData(upsertHandleFn);

    // Grant members table read to all lambdas that check access
    membersTable.grantReadData(upsertHandleFn);
    membersTable.grantReadData(getHandleConversationsFn);
    membersTable.grantReadData(bookingsFn);
    membersTable.grantReadData(branchesFn);
    membersTable.grantReadData(servicesFn);
    membersTable.grantReadData(doctorsFn);
    membersTable.grantReadData(locationsFn);
    membersTable.grantReadData(centersFn);
    membersTable.grantReadData(businessConfigFn);
    membersTable.grantReadData(customersListFn);

    bookingsTable.grantReadWriteData(bookingsFn);
    handlesTable.grantReadData(bookingsFn);
    branchesTable.grantReadData(bookingsFn);
    gamingCentersTable.grantReadData(bookingsFn);
    customersTable.grantReadWriteData(bookingsFn);
    servicesTable.grantReadData(bookingsFn);
    callersTable.grantReadWriteData(discoverySearchFn);
    handlesTable.grantReadData(discoverySearchFn);
    locationsTable.grantReadData(discoverySearchFn);
    branchesTable.grantReadData(discoverySearchFn);
    gamingCentersTable.grantReadData(discoverySearchFn);
    websiteConfigTable.grantReadData(discoverySearchFn);

    phoneNumbersTable.grantReadData(phoneEntryFn);
    callersTable.grantReadWriteData(phoneEntryFn);
    handlesTable.grantReadData(phoneEntryFn);

    handlesTable.grantReadData(businessConfigFn);
    businessConfigTable.grantReadWriteData(businessConfigFn);
    handlesTable.grantReadData(customersListFn);
    customersTable.grantReadData(customersListFn);
    handlesTable.grantReadData(branchesFn);
    branchesTable.grantReadWriteData(branchesFn);
    handlesTable.grantReadData(servicesFn);
    servicesTable.grantReadWriteData(servicesFn);
    handlesTable.grantReadData(doctorsFn);
    doctorsTable.grantReadWriteData(doctorsFn);
    handlesTable.grantReadData(locationsFn);
    locationsTable.grantReadWriteData(locationsFn);
    handlesTable.grantReadData(centersFn);
    gamingCentersTable.grantReadWriteData(centersFn);

    messageFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:Converse"],
        resources: ["*"]
      })
    );

    // Phone+OTP auth Lambda (unauthenticated — handles its own auth)
    const phoneAuthFn = new lambda.Function(this, "PhoneAuthFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/phone-auth.handler",
      code: lambdaCode,
      timeout: cdk.Duration.seconds(15),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
        FIREBASE_PROJECT_ID: "yandle-abb4c",
      },
      layers: layer
    });
    phoneAuthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminSetUserPassword",
        "cognito-idp:AdminInitiateAuth",
        "cognito-idp:AdminRespondToAuthChallenge",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminDeleteUser",
        "cognito-idp:ListUsers",
      ],
      resources: [userPool.userPoolArn],
    }));

    const httpApi = new apigwv2.HttpApi(this, "VoxaHttpApi", {
      apiName: "voxa-api",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ["content-type", "authorization"]
      }
    });

    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      "VoxaJwtAuthorizer",
      `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId]
      }
    );

    httpApi.addRoutes({
      path: "/health",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("HealthIntegration", healthFn)
    });

    httpApi.addRoutes({
      path: "/session",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("SessionIntegration", createSessionFn)
    });

    httpApi.addRoutes({
      path: "/message",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("MessageIntegration", messageFn)
    });

    httpApi.addRoutes({
      path: "/handle",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("HandleUpsertIntegration", upsertHandleFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/handles",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("ListMyHandlesIntegration", listMyHandlesFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/public/{handle}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("HandleGetIntegration", getHandleFn)
    });

    httpApi.addRoutes({
      path: "/public/{handle}/slots",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("PublicSlotsIntegration", publicSlotsFn)
    });

    httpApi.addRoutes({
      path: "/public/{handle}/conversations",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("HandleConversationsIntegration", getHandleConversationsFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/sonic/config",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("SonicConfigIntegration", sonicConfigFn)
    });

    httpApi.addRoutes({
      path: "/auth/phone",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("PhoneAuthIntegration", phoneAuthFn)
    });

    httpApi.addRoutes({
      path: "/auth/email",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("EmailAuthIntegration", phoneAuthFn)
    });

    httpApi.addRoutes({
      path: "/auth/profile",
      methods: [apigwv2.HttpMethod.PUT],
      integration: new integrations.HttpLambdaIntegration("AuthProfileIntegration", phoneAuthFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/sonic/session",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("SonicSessionIntegration", sonicSessionFn)
    });

    httpApi.addRoutes({
      path: "/bookings",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("BookingsIntegration", bookingsFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/config/slots",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("BusinessConfigIntegration", businessConfigFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/customers",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("CustomersListIntegration", customersListFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/branches",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("BranchesIntegration", branchesFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/services",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("ServicesIntegration", servicesFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/doctors",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("DoctorsIntegration", doctorsFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/locations",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("LocationsIntegration", locationsFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/centers",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("CentersIntegration", centersFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/knowledge/ingest-image",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("KnowledgeIngestImageIntegration", knowledgeIngestImageFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/knowledge/upload-file",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("KnowledgeUploadFileIntegration", knowledgeUploadFileFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/knowledge/sync",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("KnowledgeTriggerSyncIntegration", knowledgeTriggerSyncFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/knowledge/preview",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("KnowledgePreviewIntegration", knowledgePreviewFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/knowledge/files",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("KnowledgeFilesIntegration", knowledgeFilesFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/discover",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("DiscoverySearchIntegration", discoverySearchFn)
    });

    httpApi.addRoutes({
      path: "/members",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("MembersIntegration", membersFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/catalog",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("CatalogPublicIntegration", catalogFn)
    });

    httpApi.addRoutes({
      path: "/catalog/manage",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.PATCH, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("CatalogManageIntegration", catalogFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/tokens",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("TokensPublicIntegration", tokensFn)
    });

    httpApi.addRoutes({
      path: "/tokens/manage",
      methods: [apigwv2.HttpMethod.PATCH, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("TokensManageIntegration", tokensFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/recordings/presign",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("RecordingPresignIntegration", recordingPresignFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/session/{sessionId}/messages",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("SessionMessagesIntegration", getSessionMessagesFn),
      authorizer: jwtAuthorizer
    });

    httpApi.addRoutes({
      path: "/my-bookings",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("MyBookingsIntegration", myBookingsFn),
      authorizer: jwtAuthorizer
    });

    // Credits endpoints
    httpApi.addRoutes({
      path: "/credits",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("CreditsGetIntegration", creditsFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/credits/deduct",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("CreditsDeductIntegration", creditsFn)
      // No authorizer — called internally by sonic-service and message lambda
    });
    httpApi.addRoutes({
      path: "/credits/initialize",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("CreditsInitIntegration", creditsFn),
      authorizer: jwtAuthorizer
    });

    // Public DID resolution (no auth — used by SIP trunk)
    httpApi.addRoutes({
      path: "/public/resolve-did/{did}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("ResolveDIDIntegration", phoneNumbersManageFn),
    });

    // Phone number management endpoints
    httpApi.addRoutes({
      path: "/phone-numbers/available",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("PhoneAvailableIntegration", phoneNumbersManageFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/phone-numbers/assign",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("PhoneAssignIntegration", phoneNumbersManageFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/phone-numbers/release",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("PhoneReleaseIntegration", phoneNumbersManageFn),
      authorizer: jwtAuthorizer
    });

    // BMS (super-admin) endpoints
    httpApi.addRoutes({
      path: "/bms/summary",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("BmsSummaryIntegration", bmsFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/bms/numbers",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("BmsNumbersIntegration", bmsFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/bms/payments",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("BmsPaymentsIntegration", bmsFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/bms/businesses",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("BmsBusinessesIntegration", bmsFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/bms/credits",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("BmsCreditsIntegration", bmsFn),
      authorizer: jwtAuthorizer
    });

    // Salesbot Lambdas
    const salesbotLeadsFn = new lambda.Function(this, "SalesbotLeadsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/salesbot-leads.handler",
      code: lambdaCode,
      environment: { ...commonEnv, GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY || "" },
      layers: layer,
      timeout: cdk.Duration.seconds(30)
    });
    salesLeadsTable.grantReadWriteData(salesbotLeadsFn);
    salesCampaignsTable.grantReadWriteData(salesbotLeadsFn);

    const salesbotCampaignsFn = new lambda.Function(this, "SalesbotCampaignsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/salesbot-campaigns.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    salesCampaignsTable.grantReadWriteData(salesbotCampaignsFn);
    salesLeadsTable.grantReadData(salesbotCampaignsFn);
    bmsOutboundConfigTable.grantReadWriteData(salesbotCampaignsFn);

    const salesbotCallFn = new lambda.Function(this, "SalesbotCallFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/salesbot-call.handler",
      code: lambdaCode,
      environment: { ...commonEnv, SIP_TRUNK_URL: process.env.SIP_TRUNK_URL || "http://54.226.99.50:3000" },
      layers: layer,
      timeout: cdk.Duration.seconds(30)
    });
    salesCampaignsTable.grantReadWriteData(salesbotCallFn);
    salesLeadsTable.grantReadWriteData(salesbotCallFn);
    bmsOutboundConfigTable.grantReadData(salesbotCallFn);

    const salesbotWebhookFn = new lambda.Function(this, "SalesbotWebhookFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/salesbot-webhook.handler",
      code: lambdaCode,
      environment: commonEnv,
      layers: layer
    });
    salesCampaignsTable.grantReadWriteData(salesbotWebhookFn);
    salesLeadsTable.grantReadWriteData(salesbotWebhookFn);

    // Salesbot API routes
    httpApi.addRoutes({
      path: "/bms/salesbot/leads",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("SalesbotLeadsIntegration", salesbotLeadsFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/bms/salesbot/leads/save",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("SalesbotLeadsSaveIntegration", salesbotLeadsFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/bms/salesbot/campaigns",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("SalesbotCampaignsIntegration", salesbotCampaignsFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/bms/salesbot/campaigns/{campaignId}",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration("SalesbotCampaignDetailIntegration", salesbotCampaignsFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/bms/salesbot/test-call",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("SalesbotTestCallIntegration", salesbotCallFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/bms/salesbot/call-next",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("SalesbotCallNextIntegration", salesbotCallFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/bms/salesbot/webhook",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("SalesbotWebhookIntegration", salesbotWebhookFn)
      // No authorizer — internal webhook from Sonic service, authenticated via X-Salesbot-Secret header
    });
    httpApi.addRoutes({
      path: "/bms/salesbot/outbound-config",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration("SalesbotOutboundConfigIntegration", salesbotCampaignsFn),
      authorizer: jwtAuthorizer
    });

    // Website config endpoints
    httpApi.addRoutes({
      path: "/website/config",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("WebsiteConfigIntegration", websiteConfigFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/website/public/{handle}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("WebsitePublicIntegration", websiteConfigFn)
      // No authorizer — public endpoint
    });
    httpApi.addRoutes({
      path: "/website/upload-image",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("WebsiteUploadIntegration", websiteUploadFn),
      authorizer: jwtAuthorizer
    });
    httpApi.addRoutes({
      path: "/website/chat",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("WebsiteChatIntegration", websiteChatFn),
      authorizer: jwtAuthorizer
    });

    // Requests endpoints (general business type)
    httpApi.addRoutes({
      path: "/requests",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("RequestsIntegration", requestsFn),
      authorizer: jwtAuthorizer
    });

    // Tickets endpoints (customer_support business type)
    httpApi.addRoutes({
      path: "/tickets",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration("TicketsIntegration", ticketsFn),
      authorizer: jwtAuthorizer
    });

    // Support config endpoints
    httpApi.addRoutes({
      path: "/support/config",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("SupportConfigIntegration", supportConfigFn),
      authorizer: jwtAuthorizer
    });

    new cdk.CfnOutput(this, "ApiBaseUrl", {
      value: httpApi.apiEndpoint
    });

    new cdk.CfnOutput(this, "SonicServiceUrl", {
      value: `http://${sonicService.loadBalancer.loadBalancerDnsName}`
    });

    new cdk.CfnOutput(this, "CognitoUserPoolId", {
      value: userPool.userPoolId
    });
    new cdk.CfnOutput(this, "CognitoUserPoolClientId", {
      value: userPoolClient.userPoolClientId
    });
    new cdk.CfnOutput(this, "CognitoHostedUiDomain", {
      value: userPoolDomain.baseUrl()
    });

    new cdk.CfnOutput(this, "RecordingsBucketName", {
      value: recordingsBucket.bucketName,
      description: "S3 bucket for voice call MP3 recordings."
    });

    new cdk.CfnOutput(this, "KbContentBucketName", {
      value: kbContentBucket.bucketName,
      description: "S3 bucket for auto-synced knowledge base content. Create a Bedrock KB (console), add this bucket as S3 data source with prefix 'knowledge/', then pass KnowledgeBaseId and KbDataSourceId as stack parameters."
    });

    new cloudwatch.Alarm(this, "MessageLambdaErrorsAlarm", {
      metric: messageFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Message Lambda has errors in the last 5 minutes."
    });

    new cloudwatch.Alarm(this, "SonicUnhealthyHostsAlarm", {
      metric: sonicService.targetGroup.metricUnhealthyHostCount({
        statistic: "max",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Sonic service has unhealthy target hosts."
    });
  }
}
