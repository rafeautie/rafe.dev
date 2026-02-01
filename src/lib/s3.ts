import { S3 } from '@aws-sdk/client-s3';
import { R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY } from '$env/static/private';

export const s3Client = new S3({
	endpoint: R2_ENDPOINT,
	region: 'auto',
    credentials: {
        accessKeyId: R2_ACCESS_KEY,
        secretAccessKey: R2_SECRET_KEY
    }
});
