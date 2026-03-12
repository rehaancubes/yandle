#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { VoxaStack } from "../lib/voxa-stack";

const app = new cdk.App();

new VoxaStack(app, "VoxaStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1"
  }
});
