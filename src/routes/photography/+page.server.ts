import { s3Client } from '$lib/s3';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const objects = await s3Client.listObjects({ Bucket: 'photos' });
	const formattedObjects = objects.Contents?.map(obj => ({
		Key: obj.Key
	}));

	return {
		images: formattedObjects
	};
};