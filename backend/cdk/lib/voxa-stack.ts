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

    // Website config table — stores website customization per business
    const websiteConfigTable = new ddb.Table(this, "WebsiteConfigTable", {
      partitionKey: { name: "handle", type: ddb.AttributeType.STRING },
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
        userSrp: true,
        userPassword: true
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

    const userPoolDomain = userPool.addDomain("VoxaUserPoolDomain", {
      cognitoDomain: {
        domainPrefix: cognitoDomainPrefix.valueAsString
      }
    });

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
        CREDITS_TABLE: creditsTable.tableName
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
      BOOKINGS_TABLE: bookingsTable.tableName,
      BOOKINGS_EMAIL_INDEX: "BookingsEmailIndex",
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
      WEBSITE_CONFIG_TABLE: websiteConfigTable.tableName,
      WEBSITE_ASSETS_BUCKET: websiteAssetsBucket.bucketName,
      RECORDINGS_BUCKET: recordingsBucket.bucketName,
      SONIC_SERVICE_URL: sonicServiceUrl as unknown as string,
      SONIC_MODEL_ID: "amazon.nova-2-sonic-v1:0",
      TEXT_MODEL_ID: "amazon.nova-lite-v1:0",
      BEDROCK_REGION: cdk.Stack.of(this).region,
      COGNITO_USER_POOL_ID: userPool.userPoolId
    };
    // Layer with aws-sdk (Node 18+ runtimes don't bundle it). Build: cd lambda-layer/nodejs && npm install --production
    const awsSdkLayer = new lambda.LayerVersion(this, "AwsSdkLayer", {
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda-layer")),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: "aws-sdk v2 for VOXA Lambdas"
    });

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
      layers: layer
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

    // Grant Sonic ECS task role access to new tables + recordings bucket
    catalogTable.grantReadData(taskDefinition.taskRole);
    tokensTable.grantReadWriteData(taskDefinition.taskRole);
    conversationsTable.grantReadWriteData(taskDefinition.taskRole);
    recordingsBucket.grantPut(taskDefinition.taskRole);
    creditsTable.grantReadWriteData(taskDefinition.taskRole);

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
