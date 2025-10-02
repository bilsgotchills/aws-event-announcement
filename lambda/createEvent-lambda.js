import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { randomUUID } from "crypto";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const sns = new SNSClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  try {
    console.log("Incoming event:", event);

    const body = JSON.parse(event.body);
    const { eventName, eventDate, eventDescription, fileContent, fileName } = body;

    // ✅ Basic validation
    if (!eventName || !eventDate) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing eventName or eventDate" }),
      };
    }

    // Generate unique ID
    const eventId = randomUUID();

    let fileUrl = null;

    // ✅ Upload file to S3 only if provided
    if (fileContent && fileName) {
      const buffer = Buffer.from(fileContent, "base64");

      const uploadParams = {
        Bucket: process.env.BUCKET_NAME,
        Key: `${eventId}-${fileName}`,
        Body: buffer,
        ContentType: "image/png", // adjust if needed
      };

      await s3.send(new PutObjectCommand(uploadParams));

      fileUrl = `https://${process.env.BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${eventId}-${fileName}`;
    }

    // ✅ Build DynamoDB item dynamically
    const item = {
      eventId: { S: eventId },
      name: { S: eventName },
      date: { S: eventDate },
    };

    if (eventDescription) {
      item.description = { S: eventDescription };
    }

    if (fileUrl) {
      item.fileUrl = { S: fileUrl };
    }

    await dynamo.send(new PutItemCommand({
      TableName: process.env.DYNAMO_TABLE,
      Item: item,
    }));

    // ✅ SNS Notification (optional)
    if (process.env.SNS_TOPIC_ARN) {
      const message = `New Event Created: ${eventName} on ${eventDate}`;
      await sns.send(
        new PublishCommand({
          TopicArn: process.env.SNS_TOPIC_ARN,
          Message: message,
        })
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Event created successfully!" }),
    };
  } catch (err) {
    console.error("Error creating event:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
