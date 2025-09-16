# Push Categories Direct Lambda Function

This Lambda function deletes the OpenSearch index and pushes catalog data directly without creating files. It runs on an hourly schedule.

## 🚀 Quick Setup for AWS Lambda Console

### 1. Create Lambda Function
1. Go to AWS Lambda Console
2. Click "Create function"
3. Choose "Author from scratch"
4. Function name: `push-categories-direct`
5. Runtime: `Node.js 18.x`
6. Architecture: `x86_64`
7. Click "Create function"

### 2. Upload Code
1. Copy the entire contents of `lambda-push-categories-direct.js`
2. In Lambda console, go to "Code" tab
3. Delete the existing code
4. Paste the copied code
5. Click "Deploy"

### 3. Install Dependencies
1. In Lambda console, go to "Code" tab
2. Click "Upload from" → ".zip file"
3. Create a zip file with:
   - `lambda-push-categories-direct.js` (rename to `index.js`)
   - `package.json` (use the provided package.json)
   - `node_modules` folder (install dependencies locally first)

**OR** use Lambda Layers (recommended):
1. Create a layer with the dependencies
2. Attach the layer to your function

### 4. Set Environment Variables
In Lambda console, go to "Configuration" → "Environment variables":

```bash
# Database Configuration
DB_HOST=ozi-production-db.cz82wy66qdwe.ap-south-1.rds.amazonaws.com
DB_USER=admin
DB_PASSWORD=rLfcu9Y80S8X
DB_NAME=ozi_products

# OpenSearch Configuration
OPEN_SEARCH_URL=https://search-search-service-7pfvpbbo5iqm7i5rxct2dzszce.aos.ap-south-1.on.aws
OPEN_SEARCH_USERNAME=admin
OPEN_SEARCH_PASSWORD=S@HutT80YB@6
OPEN_SEARCH_CATEGORIES_INDEX=prod-catalog-index
```

### 5. Configure Function Settings
1. **Memory**: 1024 MB (or higher if needed)
2. **Timeout**: 5 minutes (300 seconds)
3. **VPC**: Configure if your database is in a VPC

### 6. Set Up CloudWatch Events (Hourly Schedule)
1. Go to "Configuration" → "Triggers"
2. Click "Add trigger"
3. Choose "EventBridge (CloudWatch Events)"
4. Rule: Create new rule
5. Rule name: `push-categories-direct-schedule`
6. Rule type: `Schedule expression`
7. Schedule expression: `rate(1 hour)`
8. Click "Add"

## 📦 Manual Package Creation

If you want to create the package manually:

```bash
# Create a new directory
mkdir push-categories-direct-lambda
cd push-categories-direct-lambda

# Copy the files
cp lambda-push-categories-direct.js index.js
cp lambda-push-categories-direct-package.json package.json

# Install dependencies
npm install

# Create zip file
zip -r push-categories-direct-lambda.zip .
```

## 🧪 Testing

### Test in Lambda Console
1. Go to "Test" tab
2. Create new test event
3. Use this test event:
```json
{
  "test": true
}
```
4. Click "Test"

### Expected Response
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"categoryCount\":123,\"productCount\":456,\"totalCount\":579,\"deleteResult\":{\"success\":true,\"response\":{\"acknowledged\":true},\"indexName\":\"prod-catalog-index\"},\"pushResponse\":{\"took\":1234,\"errors\":false,\"items\":[...]},\"message\":\"Index deleted and data pushed directly to OpenSearch without creating file\",\"timestamp\":\"2024-01-01T12:00:00.000Z\"}"
}
```

## 📊 Monitoring

### CloudWatch Logs
- Log group: `/aws/lambda/push-categories-direct`
- Check for execution logs and errors

### CloudWatch Metrics
- Monitor invocations, errors, duration
- Set up alarms for failures

## 🔧 Troubleshooting

### Common Issues:

1. **Database Connection Failed**
   - Check VPC configuration if database is in VPC
   - Verify security groups allow Lambda to connect to RDS
   - Check database credentials

2. **OpenSearch Connection Failed**
   - Verify OpenSearch URL and credentials
   - Check if OpenSearch is accessible from Lambda
   - Ensure proper IAM permissions

3. **Memory Issues**
   - Increase memory allocation
   - Monitor CloudWatch metrics

4. **Timeout Issues**
   - Increase timeout (current: 5 minutes)
   - Optimize database queries if needed

### Debug Steps:
1. Check CloudWatch logs for detailed error messages
2. Test database connection separately
3. Test OpenSearch connection separately
4. Verify environment variables are set correctly

## 🔄 Manual Execution

You can manually trigger the function:
1. Go to Lambda console
2. Click "Test" button
3. Or use AWS CLI:
```bash
aws lambda invoke --function-name push-categories-direct response.json
```

## 📁 Files Included

- `lambda-push-categories-direct.js` - Main Lambda function code
- `lambda-push-categories-direct-package.json` - Dependencies
- `lambda-push-categories-direct-README.md` - This documentation

## ⚙️ Function Behavior

1. **Delete Index**: Removes existing OpenSearch index
2. **Fetch Data**: Queries database for categories and products
3. **Format Data**: Converts to OpenSearch bulk format
4. **Push Data**: Sends formatted data to OpenSearch
5. **Log Results**: Provides detailed execution logs

## 🔐 Security Notes

- Database credentials are stored as environment variables
- OpenSearch credentials are stored as environment variables
- Consider using AWS Secrets Manager for production
- Ensure proper IAM roles and policies are configured
