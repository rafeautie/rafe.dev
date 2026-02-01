import { s3Client } from '$lib/s3';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const objects = await s3Client.listObjects({ Bucket: 'photos' });
	const randomIndex = Math.floor(Math.random() * (objects.Contents?.length || 1));
	const object = objects.Contents?.[randomIndex ?? 0]

	return {
		image: {
			key: object?.Key,
		}
	};
};