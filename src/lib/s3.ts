import { S3 } from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';

export const s3Client = new S3({
	endpoint: env.R2_ENDPOINT,
	region: 'auto',
    credentials: {
        accessKeyId: env.R2_ACCESS_KEY,
        secretAccessKey: env.R2_SECRET_KEY
    }
});
