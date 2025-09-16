#!/bin/bash

# Deploy script for push-categories-direct Lambda function
# This script helps create the deployment package

echo "🚀 Creating deployment package for push-categories-direct Lambda..."

# Create temporary directory
TEMP_DIR="lambda-deploy-temp"
mkdir -p $TEMP_DIR
cd $TEMP_DIR

# Copy and rename the main file
cp ../lambda-push-categories-direct.js index.js

# Copy package.json
cp ../lambda-push-categories-direct-package.json package.json

echo "📦 Installing dependencies..."
npm install --production

echo "🗜️ Creating deployment package..."
zip -r ../push-categories-direct-lambda.zip .

# Clean up
cd ..
rm -rf $TEMP_DIR

echo "✅ Deployment package created: push-categories-direct-lambda.zip"
echo ""
echo "📋 Next steps:"
echo "1. Go to AWS Lambda Console"
echo "2. Create a new function (Node.js 18.x)"
echo "3. Upload the zip file: push-categories-direct-lambda.zip"
echo "4. Set environment variables (see README)"
echo "5. Configure memory (1024 MB) and timeout (5 minutes)"
echo "6. Set up CloudWatch Events trigger for hourly execution"
echo ""
echo "📖 For detailed instructions, see: lambda-push-categories-direct-README.md"
